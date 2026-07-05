/**
 * Session Manager for Panindigan
 * Handles session persistence, validation, and refresh
 */
 
import { readFile, writeFile, access } from 'fs/promises';
import { CookieJar } from 'tough-cookie';
import type { Session, AppState, SessionValidationResult } from '../types/index.js';
import { CookieParser } from './CookieParser.js';
import { logger } from '../utils/Logger.js';
import { generateDeviceId, generateUUID, extractIrisSeqId, extractRevisionInfo, extractRevision, extractLsd, extractFbDtsg, retryWithBackoff } from '../utils/Helpers.js';
import { SESSION_SETTINGS, FACEBOOK_BASE_URL, FACEBOOK_MESSAGES_URL } from '../utils/Constants.js';
import type { RequestHandler } from '../api/RequestHandler.js';
import type { GraphQLClient } from '../api/GraphQLClient.js';
 
export class SessionManager {
  private session: Session | null = null;
  private cookieJar: CookieJar;
  private sessionPath?: string;
  private refreshInterval?: NodeJS.Timeout;
  private validationInterval?: NodeJS.Timeout;
  private requestHandler?: RequestHandler;
  private graphqlClient?: GraphQLClient;
 
  constructor(cookieJar: CookieJar, sessionPath?: string) {
    this.cookieJar = cookieJar;
    this.sessionPath = sessionPath;
  }

  /**
   * Inject the RequestHandler so refreshSession() can use the authenticated
   * cookie-aware client instead of a bare fetch().
   */
  setRequestHandler(handler: RequestHandler): void {
    this.requestHandler = handler;
  }

  /**
   * Inject the GraphQLClient so refreshSession() can push refreshed
   * fb_dtsg/lsd/revision-fingerprint tokens back into it — without this,
   * a periodic refresh would update the Session object but leave the
   * client issuing requests with stale (eventually rejected) tokens.
   */
  setGraphQLClient(client: GraphQLClient): void {
    this.graphqlClient = client;
  }
 
  /**
   * Create a new session from AppState
   */
  async createSession(appState: AppState): Promise<Session> {
    logger.info('Creating new session');
 
    // Validate cookies
    const validation = CookieParser.validateCookies(appState.cookies);
    if (!validation.valid) {
      throw new Error(`Missing required cookies: ${validation.missing.join(', ')}`);
    }
 
    // Get user ID from cookies
    const userId = appState.userId || CookieParser.getCookieValue(appState.cookies, 'c_user');
    if (!userId) {
      throw new Error('Could not extract user ID from cookies');
    }
 
    // Ensure userId is always a string to prevent precision loss
    const stringUserId = String(userId);
 
    // Create session
    this.session = {
      userId: stringUserId,
      fbDtsg: appState.fbDtsg || '',
      lsd: appState.lsd || '',
      cookies: appState.cookies,
      token: appState.token,
      region: appState.region || 'PRN',
      deviceId: appState.deviceId || generateDeviceId(),
      clientId: generateUUID(),
      irisSeqId: appState.irisSeqId || '0',
      loggedIn: true,
      createdAt: new Date(),
      lastActive: new Date(),
    };
 
    // Add cookies to jar
    await this.syncCookiesToJar();
 
    // Save session if path is provided
    if (this.sessionPath) {
      await this.saveSession();
    }
 
    // Start auto-refresh
    this.startAutoRefresh();
 
    logger.info('Session created successfully', { userId });
    return this.session;
  }
 
  /**
   * Get current session
   */
  getSession(): Session | null {
    return this.session;
  }
 
  /**
   * Check if logged in
   */
  isLoggedIn(): boolean {
    return this.session?.loggedIn ?? false;
  }
 
  /**
   * Get user ID
   */
  getUserId(): string | null {
    return this.session?.userId ?? null;
  }
 
  /**
   * Get fb_dtsg token
   */
  getFbDtsg(): string | null {
    return this.session?.fbDtsg ?? null;
  }
 
  /**
   * Update fb_dtsg token
   */
  updateFbDtsg(fbDtsg: string): void {
    if (this.session) {
      this.session.fbDtsg = fbDtsg;
      this.session.lastActive = new Date();
    }
  }
 
  /**
   * Get lsd token
   */
  getLsd(): string | null {
    return this.session?.lsd ?? null;
  }

  /**
   * Update lsd token.
   *
   * `lsd` is a real, page-load-bound Facebook security token (distinct from
   * `fb_dtsg`) that Facebook checks on Comet-era ajax/GraphQL endpoints. It
   * must come from the actual HTML Facebook served for this session — never
   * randomly generated — or Facebook rejects the request with
   * "Please try closing and re-opening your browser window."
   */
  updateLsd(lsd: string): void {
    if (this.session) {
      this.session.lsd = lsd;
      this.session.lastActive = new Date();
    }
  }

  /**
   * Update the real Facebook build/revision fingerprint
   * (__spin_r/__spin_b/__spin_t + __hsi). Must always come from live HTML
   * extraction (see `extractRevisionInfo`) — never a fabricated value.
   */
  updateRevisionInfo(info: { spinR: string; spinB: string; spinT: string; hsi: string }): void {
    if (this.session) {
      this.session.revisionInfo = info;
      this.session.lastActive = new Date();
    }
  }

  /**
   * Get the current real revision fingerprint, if one has been extracted.
   */
  getRevisionInfo(): Session['revisionInfo'] {
    return this.session?.revisionInfo;
  }

  /**
   * Update iris sequence ID
   */
  updateIrisSeqId(seqId: string): void {
    if (this.session) {
      this.session.irisSeqId = seqId;
    }
  }
 
  /**
   * Validate the current session
   */
  async validateSession(): Promise<SessionValidationResult> {
    if (!this.session) {
      return { valid: false, expired: true, error: 'No active session' };
    }
 
    try {
      // Check if c_user and xs cookies are still valid
      const cookies = await this.cookieJar.getCookies('https://www.facebook.com');
      const cUser = cookies.find((c) => c.key === 'c_user');
      const xs = cookies.find((c) => c.key === 'xs');
 
      if (!cUser || !xs) {
        this.session.loggedIn = false;
        return { valid: false, expired: true, error: 'Missing required cookies' };
      }
 
      // Check if user ID matches
      if (cUser.value !== this.session.userId) {
        this.session.loggedIn = false;
        return { valid: false, expired: true, error: 'User ID mismatch' };
      }
 
      // Update last active
      this.session.lastActive = new Date();
 
      return { valid: true, expired: false, userId: this.session.userId };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { valid: false, expired: true, error: errorMsg };
    }
  }
 
  /**
   * Refresh the session with automatic token extraction
   */
  async refreshSession(): Promise<boolean> {
    logger.info('Refreshing session with auto token refresh');
 
    if (!this.session) {
      logger.error('Cannot refresh: no active session');
      return false;
    }
 
    try {
      // Re-validate cookies
      const cookies = await this.cookieJar.getCookies('https://www.facebook.com');
      const cookieArray = cookies.map((c) => ({
        key: c.key,
        value: c.value,
        domain: c.domain,
        path: c.path,
      }));
 
      // Update session cookies
      this.session.cookies = cookieArray.map(c => ({
        key: c.key,
        value: c.value,
        domain: c.domain || '.facebook.com',
        path: c.path || '/',
      }));
      this.session.lastActive = new Date();
 
      // Auto-refresh fb_dtsg token by fetching Facebook homepage via the
      // authenticated RequestHandler (cookie-jar, retry policy, headers).
      if (!this.requestHandler) {
        logger.warn('No RequestHandler set on SessionManager — skipping token refresh. Call setRequestHandler() after construction.');
      } else {
        // Capture a local reference so TypeScript can narrow the type through
        // async callbacks (this.requestHandler can't be narrowed by TS after
        // the if (!this.requestHandler) check above).
        const requestHandler = this.requestHandler;
        try {
          const response = await requestHandler.get(FACEBOOK_BASE_URL);

          // Hoist token variables so the Messenger inbox fallback can check
          // and fill them whether the homepage returned 2xx or not.
          let lsd: string | null = null;
          let revisionInfo: { spinR: string; spinB: string; spinT: string; hsi: string } | null = null;
          let revision: string | null = null;
          let extractedSeqId: string | null = null;

          if (response.ok) {
            const html = await response.text();

            const fbDtsg = extractFbDtsg(html);
            if (fbDtsg) {
              this.session.fbDtsg = fbDtsg;
              logger.info('Auto-refreshed fb_dtsg token');
            }

            // Auto-refresh the real lsd token too — it is a separate,
            // page-load-bound Facebook security token from fb_dtsg, and
            // GraphQL/Comet ajax requests are rejected with "Please try
            // closing and re-opening your browser window" when it is stale
            // or missing. It must be re-pushed into both the RequestHandler
            // (x-fb-lsd header) and the GraphQLClient (lsd form field).
            //
            // Facebook embeds lsd as a Haste module bootstrap tuple
            // (`["LSD",[],{"token":"..."}]`), not a plain `"lsd":"..."` JSON
            // key — see extractLsd() in Helpers.ts for the full root cause.
            lsd = extractLsd(html);
            if (lsd) {
              this.session.lsd = lsd;
              requestHandler.setLsdToken(lsd);
              logger.info('Auto-refreshed lsd token');
            } else {
              logger.debug('lsd not found on homepage during session refresh; will try Messenger inbox fallback');
            }

            // Auto-refresh the real Facebook build/revision fingerprint
            // (__spin_r/__spin_b/__spin_t + __hsi) — it rotates with every
            // Facebook deploy, so a value captured at login will eventually
            // go stale and start being rejected the same way an expired
            // fb_dtsg/lsd would be.
            revisionInfo = extractRevisionInfo(html);
            if (revisionInfo) {
              this.session.revisionInfo = revisionInfo;
              logger.info('Auto-refreshed Facebook build/revision fingerprint');
            } else {
              logger.debug('Revision fingerprint not found on homepage during session refresh; will try Messenger inbox fallback');
            }

            // Auto-refresh the plain numeric page revision (__rev) — a
            // different, much more commonly-present value than the Comet
            // spin/hsi bundle above. Real FCA implementations
            // (fca-unofficial, ws3-fca) send this on every legacy
            // form-encoded request (e.g. /chat/user_info/, used by
            // getUserInfo) independent of the Comet fingerprint.
            revision = extractRevision(html);
            if (revision) {
              logger.info('Auto-refreshed real Facebook page revision (__rev)');
            }

            // Push all refreshed tokens back into the live GraphQLClient —
            // without this, the Session object updates but every in-flight
            // manager keeps issuing requests with the old (soon-to-expire)
            // tokens.
            if (this.graphqlClient) {
              this.graphqlClient.setAuthTokens(this.session.fbDtsg, this.session.userId, this.session.lsd);
              if (revisionInfo) {
                this.graphqlClient.setRevisionInfo(revisionInfo);
              }
              if (revision) {
                this.graphqlClient.setRevision(revision);
              }
            }

            // Extract iris sequence ID if available (tries all known response formats).
            // The general homepage doesn't always carry this value (it normally
            // lives in the Messenger inbox data blob) so a miss here is expected,
            // not an error — MQTT falls back to a fresh sync queue instead of
            // fabricating a sequence id.
            extractedSeqId = extractIrisSeqId(html);
            if (extractedSeqId) {
              this.session.irisSeqId = extractedSeqId;
              logger.info('Auto-refreshed iris sequence ID');
            } else {
              logger.debug('No iris sequence ID in refreshed homepage HTML; MQTT will use a fresh sync queue');
            }
          } else {
            logger.debug(`Homepage returned ${response.status} during session refresh; skipping homepage extraction and trying Messenger inbox fallback`);
          }

          // If any critical token is still missing — whether because the
          // homepage returned non-2xx or because it served a stripped shell
          // (CDN edge cache, A/B cohort, consent interstitial) that omitted
          // the Haste bootstrap blob — fall back to the Messenger inbox page.
          // /messages/t/ is a full Comet page load that reliably re-embeds
          // LSD/__spin_*/__hsi and the Iris sync data.
          if (!lsd || !revisionInfo || !revision || !extractedSeqId) {
            try {
              const messagesHtml = await retryWithBackoff(
                async () => {
                  const messagesResponse = await requestHandler.get(FACEBOOK_MESSAGES_URL, { skipCache: true });
                  if (!messagesResponse.ok) {
                    throw new Error(`Messenger inbox fallback failed with status ${messagesResponse.status}`);
                  }
                  return messagesResponse.text();
                },
                3,
                500,
                5000
              );

              if (!lsd) {
                const inboxLsd = extractLsd(messagesHtml);
                if (inboxLsd) {
                  this.session.lsd = inboxLsd;
                  requestHandler.setLsdToken(inboxLsd);
                  if (this.graphqlClient) {
                    this.graphqlClient.setAuthTokens(this.session.fbDtsg, this.session.userId, inboxLsd);
                  }
                  logger.info('Auto-refreshed lsd token from Messenger inbox');
                } else {
                  logger.warn('Could not extract lsd token during session refresh; GraphQL requests may be rejected until the next successful refresh');
                }
              }

              if (!revisionInfo) {
                const inboxRevisionInfo = extractRevisionInfo(messagesHtml);
                if (inboxRevisionInfo) {
                  this.session.revisionInfo = inboxRevisionInfo;
                  if (this.graphqlClient) {
                    this.graphqlClient.setRevisionInfo(inboxRevisionInfo);
                  }
                  logger.info('Auto-refreshed Facebook build/revision fingerprint from Messenger inbox');
                } else {
                  logger.warn('Could not extract __spin_r/__spin_b/__spin_t/__hsi during session refresh; GraphQL query()/batchQuery() may be rejected until the next successful refresh');
                }
              }

              if (!revision) {
                const inboxRevision = extractRevision(messagesHtml);
                if (inboxRevision) {
                  if (this.graphqlClient) {
                    this.graphqlClient.setRevision(inboxRevision);
                  }
                  logger.info('Auto-refreshed real Facebook page revision (__rev) from Messenger inbox');
                }
              }

              if (!extractedSeqId) {
                const inboxSeqId = extractIrisSeqId(messagesHtml);
                if (inboxSeqId) {
                  this.session.irisSeqId = inboxSeqId;
                  logger.info('Auto-refreshed iris sequence ID from Messenger inbox');
                }
              }
            } catch (inboxError) {
              logger.debug('Messenger inbox fallback during session refresh failed', inboxError);
            }
          }
        } catch (tokenError) {
          logger.warn('Failed to auto-refresh tokens, continuing with existing tokens', tokenError);
        }
      }
 
      // Save if path is set
      if (this.sessionPath) {
        await this.saveSession();
      }
 
      logger.info('Session refreshed successfully');
      return true;
    } catch (error) {
      logger.error('Failed to refresh session', error);
      return false;
    }
  }
 
  /**
   * Save session to file
   */
  async saveSession(): Promise<void> {
    if (!this.sessionPath || !this.session) {
      return;
    }
 
    try {
      const appState: AppState = {
        cookies: this.session.cookies,
        fbDtsg: this.session.fbDtsg,
        userId: this.session.userId,
        token: this.session.token,
        region: this.session.region,
        deviceId: this.session.deviceId,
        irisSeqId: this.session.irisSeqId,
      };
 
      await writeFile(this.sessionPath, JSON.stringify(appState, null, 2));
      logger.debug('Session saved to file');
    } catch (error) {
      logger.error('Failed to save session', error);
    }
  }
 
  /**
   * Load session from file
   */
  async loadSession(): Promise<Session | null> {
    if (!this.sessionPath) {
      return null;
    }
 
    try {
      // Check if file exists
      await access(this.sessionPath);
      
      const data = await readFile(this.sessionPath, 'utf-8');
      const appState = CookieParser.parseAppState(data);
      
      return await this.createSession(appState);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to load session', error);
      }
      return null;
    }
  }
 
  /**
   * Clear the current session
   */
  async clearSession(): Promise<void> {
    logger.info('Clearing session');
 
    this.stopAutoRefresh();
    this.session = null;
    
    // Clear cookie jar
    await this.cookieJar.removeAllCookies();
 
    // Delete session file if exists
    if (this.sessionPath) {
      try {
        const { unlink } = await import('fs/promises');
        await unlink(this.sessionPath);
      } catch {
        // File might not exist, ignore error
      }
    }
  }
 
  /**
   * Get the cookie jar
   */
  getCookieJar(): CookieJar {
    return this.cookieJar;
  }
 
  /**
   * Sync session cookies to cookie jar
   */
  private async syncCookiesToJar(): Promise<void> {
    if (!this.session) return;
 
    for (const cookie of this.session.cookies) {
      const cookieStr = `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}`;
      await this.cookieJar.setCookie(cookieStr, 'https://www.facebook.com');
    }
  }
 
  /**
   * Start auto-refresh intervals
   */
  private startAutoRefresh(): void {
    // Session refresh interval
    this.refreshInterval = setInterval(async () => {
      await this.refreshSession();
    }, SESSION_SETTINGS.refreshInterval);
 
    // Validation interval
    this.validationInterval = setInterval(async () => {
      const result = await this.validateSession();
      if (!result.valid) {
        logger.warn('Session validation failed', result);
      }
    }, SESSION_SETTINGS.validityCheckInterval);
  }
 
  /**
   * Stop auto-refresh intervals
   */
  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = undefined;
    }
  }
 
  /**
   * Get session as AppState
   */
  getAppState(): AppState | null {
    if (!this.session) return null;
 
    return {
      cookies: this.session.cookies,
      fbDtsg: this.session.fbDtsg,
      userId: this.session.userId,
      token: this.session.token,
      region: this.session.region,
      deviceId: this.session.deviceId,
      irisSeqId: this.session.irisSeqId,
    };
  }
}