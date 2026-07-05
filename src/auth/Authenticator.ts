/**
 * Main Authenticator for Panindigan
 * Handles all authentication methods
 */

import { CookieJar } from 'tough-cookie';
import type { 
  LoginOptions, 
  Session, 
  AppState, 
  Credentials, 
  TwoFactorAuth,
  CheckpointData 
} from '../types/index.js';
import { CookieParser } from './CookieParser.js';
import { SessionManager } from './SessionManager.js';
import { RequestHandler } from '../api/RequestHandler.js';
import { GraphQLClient } from '../api/GraphQLClient.js';
import { logger } from '../utils/Logger.js';
import { FACEBOOK_BASE_URL, FACEBOOK_MESSAGES_URL, DEFAULT_USER_AGENT } from '../utils/Constants.js';
import { extractFbDtsg, extractIrisSeqId, extractRevisionInfo, extractRevision, extractLsd, retryWithBackoff } from '../utils/Helpers.js';

export class Authenticator {
  private sessionManager: SessionManager;
  private requestHandler: RequestHandler;
  private graphqlClient: GraphQLClient;
  private options: LoginOptions;

  constructor(options: LoginOptions = {}) {
    this.options = options;
    
    // Initialize cookie jar
    const cookieJar = new CookieJar();
    
    // Initialize request handler
    this.requestHandler = new RequestHandler(
      cookieJar,
      options.userAgent || DEFAULT_USER_AGENT,
      options.proxy
    );
    
    // Initialize session manager and wire it to the authenticated handler
    this.sessionManager = new SessionManager(cookieJar, options.sessionPath);
    this.sessionManager.setRequestHandler(this.requestHandler);
    
    // Initialize GraphQL client
    this.graphqlClient = new GraphQLClient(this.requestHandler);

    // Let the SessionManager push refreshed tokens (fb_dtsg/lsd/revision
    // fingerprint) back into the same GraphQLClient instance every manager
    // shares, so periodic refresh doesn't leave callers using stale tokens.
    this.sessionManager.setGraphQLClient(this.graphqlClient);
  }

  /**
   * Login to Facebook
   */
  async login(options?: LoginOptions): Promise<Session> {
    const opts = { ...this.options, ...options };
    
    logger.logAuth('login', 'started');

    // Set log level
    if (opts.logLevel) {
      logger.setLogLevel(opts.logLevel);
    }

    try {
      // Check environment variable for AppState (for hosting safety)
      const envAppState = process.env.FACEBOOK_APPSTATE;
      if (envAppState && !opts.appState) {
        logger.info('Using AppState from environment variable');
        opts.appState = envAppState;
      }

      // Try to load existing session first
      if (!opts.appState && !opts.credentials && opts.sessionPath) {
        const existingSession = await this.sessionManager.loadSession();
        if (existingSession) {
          const validation = await this.sessionManager.validateSession();
          if (validation.valid) {
            logger.logAuth('login', 'success', 'Restored from saved session');
            return existingSession;
          }
        }
      }

      // Login with appState
      if (opts.appState) {
        return await this.loginWithAppState(opts.appState);
      }

      // Login with credentials
      if (opts.credentials) {
        return await this.loginWithCredentials(opts.credentials, opts.twoFactor);
      }

      throw new Error('No authentication method provided (appState or credentials required)');
    } catch (error) {
      logger.logAuth('login', 'failed', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Login with AppState/cookies
   */
  async loginWithAppState(appState: AppState | unknown): Promise<Session> {
    logger.info('Logging in with AppState');

    let parsedAppState: AppState;
    
    if (typeof appState === 'string') {
      // Try to parse as JSON
      try {
        const parsed = JSON.parse(appState);
        parsedAppState = CookieParser.parseAppState(parsed);
      } catch {
        // Try as raw cookie string
        const cookies = CookieParser.parse(appState, 'raw');
        parsedAppState = { cookies };
      }
    } else {
      parsedAppState = CookieParser.parseAppState(appState);
    }

    // Log parsed cookies for debugging
    logger.debug(`Parsed ${parsedAppState.cookies.length} cookies`, {
      cookieNames: parsedAppState.cookies.map(c => c.key).join(', '),
    });

    // Validate cookies
    const validation = CookieParser.validateCookies(parsedAppState.cookies);
    if (!validation.valid) {
      const availableCookies = parsedAppState.cookies.map(c => c.key);
      logger.error(`Login failed: Invalid AppState - missing required cookies: ${validation.missing.join(', ')}`, {
        available: availableCookies.join(', '),
        totalParsed: parsedAppState.cookies.length,
        required: ['c_user', 'xs']
      });
      throw new Error(`Invalid AppState: missing cookies ${validation.missing.join(', ')}. Please export your cookies again from Facebook.`);
    }

    logger.debug('Cookies validated successfully', {
      required: ['c_user', 'xs'],
      found: parsedAppState.cookies.filter(c => ['c_user', 'xs'].includes(c.key)).map(c => c.key),
    });

    // Create session
    const session = await this.sessionManager.createSession(parsedAppState);
    
    // Set auth tokens for GraphQL
    this.graphqlClient.setAuthTokens(session.fbDtsg, session.userId, session.lsd);

    // Validate by fetching homepage
    try {
      const response = await this.requestHandler.get(FACEBOOK_BASE_URL);
      if (!response.ok) {
        throw new Error(`Failed to validate session: ${response.status}`);
      }

      const html = await response.text();
      
      // Always refresh fb_dtsg from the live homepage — it rotates and the
      // AppState value may already be stale by the time loginWithAppState() runs.
      const fbDtsg = extractFbDtsg(html);
      if (fbDtsg) {
        this.sessionManager.updateFbDtsg(fbDtsg);
        this.graphqlClient.setAuthTokens(fbDtsg, session.userId, this.sessionManager.getLsd() || undefined);
        logger.debug('Refreshed fb_dtsg from homepage');
      }

      // Extract the real lsd token — a separate, page-load-bound Facebook
      // security token from fb_dtsg. GraphQL/Comet ajax endpoints (e.g.
      // /chat/user_info/, /webgraphql/query) reject requests missing a
      // valid lsd with "Please try closing and re-opening your browser
      // window." It must always come from real HTML, never be generated.
      //
      // Facebook embeds lsd as a Haste module bootstrap tuple
      // (`["LSD",[],{"token":"..."}]`), not a plain `"lsd":"..."` JSON key —
      // see extractLsd() in Helpers.ts for the full root-cause writeup.
      // Fresh lsd from the live homepage always takes priority over the
      // stale AppState value — using a stale lsd is what causes the
      // "Please try closing and re-opening your browser window" error.
      // Fall back to session.lsd only when the homepage yielded nothing.
      let lsd = extractLsd(html);
      if (lsd) {
        this.sessionManager.updateLsd(lsd);
        this.requestHandler.setLsdToken(lsd);
        this.graphqlClient.setAuthTokens(this.sessionManager.getFbDtsg() || session.fbDtsg, session.userId, lsd);
        logger.debug('Extracted lsd token from homepage');
      } else if (session.lsd) {
        lsd = session.lsd;
        this.requestHandler.setLsdToken(session.lsd);
      }

      // Extract the real Facebook build/revision fingerprint
      // (__spin_r/__spin_b/__spin_t + __hsi). Comet-era ajax/GraphQL
      // endpoints reject requests carrying a fabricated/hardcoded __rev or
      // a randomly generated __hsi with the same generic
      // "Please try closing and re-opening your browser window." error —
      // these values must always come from the HTML Facebook just served.
      let revisionInfo = extractRevisionInfo(html);
      if (revisionInfo) {
        this.sessionManager.updateRevisionInfo(revisionInfo);
        this.graphqlClient.setRevisionInfo(revisionInfo);
        logger.debug('Extracted real Facebook build/revision fingerprint', revisionInfo);
      }

      // Extract the plain numeric page revision (__rev) — a different,
      // much more commonly-present value than the Comet spin/hsi bundle
      // above. Real FCA implementations (fca-unofficial, ws3-fca) send this
      // on every legacy form-encoded request (e.g. /chat/user_info/,
      // used by getUserInfo) independent of whether the full Comet
      // fingerprint was ever obtained — this is what actually unblocks
      // getUserInfo() without needing __spin_r/__spin_b/__spin_t/__hsi.
      let revision = extractRevision(html);
      if (revision) {
        this.graphqlClient.setRevision(revision);
        logger.debug('Extracted real Facebook page revision (__rev)', { revision });
      }

      // Extract iris sequence ID. The general homepage does not always embed
      // this value (it's normally populated from the Messenger inbox data
      // blob, not www.facebook.com) so a miss here is expected/normal, not
      // an error — MQTT handles it correctly by creating a fresh sync queue
      // instead of fabricating a sequence id (see MQTTClient/FastMQTT
      // sendSyncQueue()).
      let irisSeqId = extractIrisSeqId(html);
      if (irisSeqId) {
        this.sessionManager.updateIrisSeqId(irisSeqId);
        logger.debug('Extracted iris sequence ID from homepage', { irisSeqId });
      }

      // If lsd, the revision fingerprint, or the iris sequence id are still
      // missing after the homepage fetch, fall back to the Messenger inbox
      // page. www.facebook.com/ sometimes serves a stripped-down/cached
      // shell (CDN edge cache, A/B cohort, consent interstitial, etc.) that
      // omits the Haste bootstrap blob entirely, while /messages/t/ is a
      // full Comet page load that reliably re-embeds LSD/__spin_*/__hsi
      // alongside the Iris sync data. This mirrors how real FCA
      // implementations (e.g. nkxfca's refreshTokensAlternative) retry
      // token extraction against a second real endpoint instead of ever
      // fabricating a value.
      //
      // Wrapped in a short retry/backoff (up to 3 attempts) so a single
      // transient network hiccup doesn't silently skip this lookup — a
      // non-2xx status is treated as a retryable failure here too, since
      // it's most commonly a momentary blip rather than a real error.
      if (!lsd || !revisionInfo || !revision || !irisSeqId) {
        try {
          const messagesHtml = await retryWithBackoff(
            async () => {
              const messagesResponse = await this.requestHandler.get(FACEBOOK_MESSAGES_URL, { skipCache: true });
              if (!messagesResponse.ok) {
                throw new Error(`Messenger inbox fallback request failed with status ${messagesResponse.status}`);
              }
              return messagesResponse.text();
            },
            3,
            500,
            5000
          );

          if (!lsd) {
            lsd = extractLsd(messagesHtml);
            if (lsd) {
              this.sessionManager.updateLsd(lsd);
              this.requestHandler.setLsdToken(lsd);
              this.graphqlClient.setAuthTokens(this.sessionManager.getFbDtsg() || session.fbDtsg, session.userId, lsd);
              logger.debug('Extracted lsd token from Messenger inbox page');
            }
          }

          if (!revisionInfo) {
            revisionInfo = extractRevisionInfo(messagesHtml);
            if (revisionInfo) {
              this.sessionManager.updateRevisionInfo(revisionInfo);
              this.graphqlClient.setRevisionInfo(revisionInfo);
              logger.debug('Extracted real Facebook build/revision fingerprint from Messenger inbox page', revisionInfo);
            }
          }

          if (!revision) {
            revision = extractRevision(messagesHtml);
            if (revision) {
              this.graphqlClient.setRevision(revision);
              logger.debug('Extracted real Facebook page revision (__rev) from Messenger inbox page', { revision });
            }
          }

          if (!irisSeqId) {
            irisSeqId = extractIrisSeqId(messagesHtml);
            if (irisSeqId) {
              this.sessionManager.updateIrisSeqId(irisSeqId);
              logger.debug('Extracted iris sequence ID from Messenger inbox page', { irisSeqId });
            } else {
              logger.debug('No iris sequence ID in Messenger inbox response either; MQTT will start a fresh sync queue');
            }
          }
        } catch (inboxError) {
          logger.debug('Messenger inbox fallback for lsd/revision fingerprint/iris sequence ID failed after retries', inboxError);
        }
      }

      if (!lsd) {
        logger.warn('Could not extract lsd token from homepage or Messenger inbox; GraphQL requests (e.g. getUserInfo) may be rejected by Facebook until a valid lsd is obtained');
      }
      if (!revisionInfo) {
        logger.warn('Could not extract __spin_r/__spin_b/__spin_t/__hsi from homepage or Messenger inbox; GraphQL query()/batchQuery() will be rejected until a valid fingerprint is obtained (formPost-based calls still work once fb_dtsg/lsd are set)');
      }
      if (!revision) {
        logger.warn('Could not extract real page revision (__rev) from homepage or Messenger inbox; legacy form-encoded calls (e.g. getUserInfo) will omit __rev until a valid value is obtained');
      }

    } catch (error) {
      logger.warn('Could not fully validate session, but continuing', error);
    }

    logger.logAuth('login', 'success', `User: ${session.userId}`);
    return this.sessionManager.getSession()!;
  }

  /**
   * Login with email/password credentials
   */
  async loginWithCredentials(
    credentials: Credentials, 
    twoFactor?: TwoFactorAuth
  ): Promise<Session> {
    logger.info('Logging in with credentials');
    
    if (!credentials.email || !credentials.password) {
      throw new Error('Email and password are required');
    }

    try {
      // Step 1: Get login page to extract form data
      logger.debug('Fetching login page');
      const loginPageResponse = await this.requestHandler.get(FACEBOOK_BASE_URL);
      const loginPageHtml = await loginPageResponse.text();

      // Extract necessary tokens from login page.
      // lsd is embedded as a Haste module bootstrap tuple
      // (`["LSD",[],{"token":"..."}]`), not a plain `"lsd":"..."` JSON key —
      // see extractLsd() in Helpers.ts for the full root-cause writeup.
      const fbDtsg = extractFbDtsg(loginPageHtml);
      const lsd = extractLsd(loginPageHtml) ?? undefined;

      if (!fbDtsg || !lsd) {
        throw new Error('Could not extract login tokens from page');
      }

      // Step 2: Attempt login with credentials
      logger.debug('Attempting login request');
      const loginPayload = new FormData();
      loginPayload.append('email', credentials.email);
      loginPayload.append('pass', credentials.password);
      loginPayload.append('login', 'Log In');
      loginPayload.append('persistent', '1');
      loginPayload.append('default_persistent', '0');
      loginPayload.append('timezone', 'UTC');
      loginPayload.append('lgnd_pwd_digit_sum', '');
      loginPayload.append('lsd', lsd);
      loginPayload.append('fb_dtsg', fbDtsg);
      loginPayload.append('m_ts', Math.floor(Date.now() / 1000).toString());
      loginPayload.append('unrecognized_tries', '0');

      const loginResponse = await this.requestHandler.post(
        `${FACEBOOK_BASE_URL}/login.php`,
        loginPayload
      );

      // Step 3: Check for 2FA requirement
      const loginHtml = await loginResponse.text();
      if (
        loginHtml.includes('two_step_id') ||
        loginHtml.includes('2fa') ||
        loginHtml.includes('checkpoint')
      ) {
        logger.info('Two-factor authentication required');
        
        if (!twoFactor) {
          throw new Error(
            'Two-factor authentication is required. Please provide 2FA code.'
          );
        }

        return await this.handleTwoFactor(twoFactor.code, twoFactor.type);
      }

      // Step 4: Check for security checkpoint
      if (loginHtml.includes('checkpoint') || loginHtml.includes('security_challenge')) {
        logger.warn('Security checkpoint detected');
        throw new Error(
          'Security checkpoint required. Please verify your identity on Facebook and try again.'
        );
      }

      // Step 5: Verify successful login
      if (loginResponse.status !== 200 && loginResponse.status !== 302) {
        throw new Error(`Login failed with status ${loginResponse.status}`);
      }

      // Get cookies from jar
      const cookies = await this.requestHandler.getCookieJar().getCookies(FACEBOOK_BASE_URL);
      const cUser = cookies.find((c) => c.key === 'c_user');
      const xs = cookies.find((c) => c.key === 'xs');

      if (!cUser || !xs) {
        throw new Error('Login failed - could not obtain session cookies');
      }

      // Create an AppState from the cookies
      const appState: AppState = {
        cookies: cookies.map((c) => ({
          key: c.key,
          value: c.value,
          domain: c.domain || '.facebook.com',
          path: c.path || '/',
        })),
        fbDtsg: fbDtsg,
        lsd: lsd,
        userId: cUser.value,
      };

      // Create and return session
      const session = await this.sessionManager.createSession(appState);
      this.graphqlClient.setAuthTokens(session.fbDtsg, session.userId, session.lsd);
      this.requestHandler.setLsdToken(session.lsd);

      logger.logAuth('login', 'success', `User: ${session.userId}`);
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.logAuth('login', 'failed', message);
      throw error;
    }
  }

  /**
   * Handle 2FA
   */
  async handleTwoFactor(code: string, method: TwoFactorAuth['type'] = 'totp'): Promise<Session> {
    logger.info('Handling 2FA', { method });
    
    if (!code || typeof code !== 'string') {
      throw new Error('2FA code is required');
    }

    try {
      // Get current cookies
      const cookies = await this.requestHandler.getCookieJar().getCookies(FACEBOOK_BASE_URL);
      const cUser = cookies.find((c) => c.key === 'c_user');
      
      if (!cUser) {
        throw new Error('No active login session for 2FA');
      }

      // Fetch 2FA form page
      const twoFaPageResponse = await this.requestHandler.get(FACEBOOK_BASE_URL);
      const twoFaHtml = await twoFaPageResponse.text();
      
      const fbDtsg = extractFbDtsg(twoFaHtml);
      const jazoest = twoFaHtml.match(/jazoest['\"]\s*:\s*['\"]([^'\"]+)['\"]/)?.[1];

      if (!fbDtsg) {
        throw new Error('Could not extract form tokens');
      }

      // Submit 2FA code
      const twoFaPayload = new FormData();
      twoFaPayload.append('approvals_code', code);
      twoFaPayload.append('codes_submitted', '1');
      twoFaPayload.append('method', method);
      twoFaPayload.append('fb_dtsg', fbDtsg);
      if (jazoest) {
        twoFaPayload.append('jazoest', jazoest);
      }

      const submitResponse = await this.requestHandler.post(
        `${FACEBOOK_BASE_URL}/login/device`,
        twoFaPayload
      );

      if (submitResponse.status !== 200 && submitResponse.status !== 302) {
        throw new Error(`2FA submission failed: ${submitResponse.status}`);
      }

      const responseText = await submitResponse.text();
      if (responseText.includes('invalid') || responseText.includes('error')) {
        throw new Error('Invalid 2FA code');
      }

      // Get updated cookies
      const updatedCookies = await this.requestHandler.getCookieJar().getCookies(FACEBOOK_BASE_URL);
      const updatedCUser = updatedCookies.find((c) => c.key === 'c_user');
      const updatedXs = updatedCookies.find((c) => c.key === 'xs');

      if (!updatedCUser || !updatedXs) {
        throw new Error('2FA verification failed');
      }

      // Create session from updated cookies
      const appState: AppState = {
        cookies: updatedCookies.map((c) => ({
          key: c.key,
          value: c.value,
          domain: c.domain || '.facebook.com',
          path: c.path || '/',
        })),
        fbDtsg: fbDtsg,
        userId: updatedCUser.value,
      };

      const session = await this.sessionManager.createSession(appState);
      this.graphqlClient.setAuthTokens(session.fbDtsg, session.userId, session.lsd);
      if (session.lsd) {
        this.requestHandler.setLsdToken(session.lsd);
      }

      logger.logAuth('2fa', 'success', `User: ${session.userId}`);
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.logAuth('2fa', 'failed', message);
      throw error;
    }
  }

  /**
   * Handle security checkpoint
   */
  async handleCheckpoint(checkpointData: CheckpointData): Promise<Session> {
    logger.info('Handling security checkpoint');
    
    if (!checkpointData.url) {
      throw new Error('Checkpoint URL is required');
    }

    try {
      // Fetch checkpoint page
      logger.debug('Fetching checkpoint page', { url: checkpointData.url });
      const checkpointResponse = await this.requestHandler.get(checkpointData.url);
      const checkpointHtml = await checkpointResponse.text();

      const fbDtsg = extractFbDtsg(checkpointHtml);
      if (!fbDtsg) {
        throw new Error('Could not extract checkpoint tokens');
      }

      // Prepare checkpoint resolution
      const method = checkpointData.method || 'email';
      const payload = new FormData();
      payload.append('fb_dtsg', fbDtsg);
      payload.append('checkpoint_data', JSON.stringify(checkpointData));

      // If security code is provided, submit it
      if (checkpointData.securityCode) {
        payload.append('security_code', checkpointData.securityCode);
        payload.append('submit[Continue]', 'Continue');

        logger.debug('Submitting checkpoint security code', { method });
        
        const submitResponse = await this.requestHandler.post(
          checkpointData.url,
          payload
        );

        if (submitResponse.status !== 200 && submitResponse.status !== 302) {
          throw new Error(
            `Checkpoint resolution failed: ${submitResponse.status}`
          );
        }

        const responseText = await submitResponse.text();
        if (responseText.includes('error') || responseText.includes('invalid')) {
          throw new Error('Invalid checkpoint verification code');
        }
      } else {
        // Checkpoint requires user interaction
        throw new Error(
          `Security checkpoint detected. Please verify your identity at: ${checkpointData.url}\n` +
          `Method: ${method}\n` +
          `After verification, please log in again with your cookies.`
        );
      }

      // Get cookies after checkpoint
      const cookies = await this.requestHandler.getCookieJar().getCookies(FACEBOOK_BASE_URL);
      const cUser = cookies.find((c) => c.key === 'c_user');
      const xs = cookies.find((c) => c.key === 'xs');

      if (!cUser || !xs) {
        throw new Error('Checkpoint verification failed');
      }

      // Create session from verified cookies
      const appState: AppState = {
        cookies: cookies.map((c) => ({
          key: c.key,
          value: c.value,
          domain: c.domain || '.facebook.com',
          path: c.path || '/',
        })),
        fbDtsg: fbDtsg,
        userId: cUser.value,
      };

      const session = await this.sessionManager.createSession(appState);
      this.graphqlClient.setAuthTokens(session.fbDtsg, session.userId, session.lsd);
      if (session.lsd) {
        this.requestHandler.setLsdToken(session.lsd);
      }

      logger.logAuth('checkpoint', 'success', `User: ${session.userId}`);
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.logAuth('checkpoint', 'failed', message);
      throw error;
    }
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    logger.info('Logging out');
    
    try {
      // Call logout endpoint if needed
      await this.sessionManager.clearSession();
      logger.logAuth('logout', 'success');
    } catch (error) {
      logger.error('Logout error', error);
      throw error;
    }
  }

  /**
   * Get current session
   */
  getSession(): Session | null {
    return this.sessionManager.getSession();
  }

  /**
   * Check if logged in
   */
  isLoggedIn(): boolean {
    return this.sessionManager.isLoggedIn();
  }

  /**
   * Validate current session
   */
  async validateSession(): Promise<boolean> {
    const result = await this.sessionManager.validateSession();
    return result.valid;
  }

  /**
   * Refresh session
   */
  async refreshSession(): Promise<boolean> {
    return await this.sessionManager.refreshSession();
  }

  /**
   * Get session manager
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get request handler
   */
  getRequestHandler(): RequestHandler {
    return this.requestHandler;
  }

  /**
   * Get GraphQL client
   */
  getGraphQLClient(): GraphQLClient {
    return this.graphqlClient;
  }

  /**
   * Get AppState for saving
   */
  getAppState(): AppState | null {
    return this.sessionManager.getAppState();
  }
}
