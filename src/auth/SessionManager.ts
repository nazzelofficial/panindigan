/**
 * Session Manager for Panindigan
 * Handles session persistence, validation, and refresh
 */

import { readFile, writeFile, access } from 'fs/promises';
import { CookieJar } from 'tough-cookie';
import type { Session, AppState, SessionValidationResult } from '../types/index.js';
import { CookieParser } from './CookieParser.js';
import { logger } from '../utils/Logger.js';
import { generateDeviceId, generateUUID } from '../utils/Helpers.js';
import { SESSION_SETTINGS } from '../utils/Constants.js';

export class SessionManager {
  private session: Session | null = null;
  private cookieJar: CookieJar;
  private sessionPath?: string;
  private refreshInterval?: NodeJS.Timeout;
  private validationInterval?: NodeJS.Timeout;

  constructor(cookieJar: CookieJar, sessionPath?: string) {
    this.cookieJar = cookieJar;
    this.sessionPath = sessionPath;
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

    // Create session
    this.session = {
      userId,
      fbDtsg: appState.fbDtsg || '',
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
   * Refresh the session
   */
  async refreshSession(): Promise<boolean> {
    logger.info('Refreshing session');

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
