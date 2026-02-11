/**
 * Universal Cookie Parser for Panindigan
 * Handles all cookie formats from various sources
 */

import type { Cookie, CookieFormat, AppState } from '../types/index.js';
import { logger } from '../utils/Logger.js';

export class CookieParser {
  /**
   * Parse cookies from any format and normalize to internal Cookie format
   */
  static parse(input: unknown, format?: CookieFormat): Cookie[] {
    if (!input) {
      throw new Error('No cookie input provided');
    }

    // Auto-detect format if not specified
    if (!format) {
      format = this.detectFormat(input);
      logger.debug(`Auto-detected cookie format: ${format}`);
    }

    switch (format) {
      case 'c3c-fbstate':
        return this.parseC3CFbState(input);
      case 'fca-unofficial':
      case 'facebook-chat-api':
        return this.parseFCAFormat(input);
      case 'editthiscookie':
      case 'cookie-editor':
      case 'j2team':
      case 'browser':
        return this.parseBrowserFormat(input);
      case 'raw':
        return this.parseRawCookieString(input);
      default:
        throw new Error(`Unknown cookie format: ${format}`);
    }
  }

  /**
   * Auto-detect the cookie format
   */
  static detectFormat(input: unknown): CookieFormat {
    // Check if it's a string (raw cookies or JSON string)
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input);
        return this.detectFormat(parsed);
      } catch {
        // It's a raw cookie string
        return 'raw';
      }
    }

    // Check if it's an array
    if (Array.isArray(input)) {
      if (input.length === 0) {
        throw new Error('Empty cookie array');
      }

      const first = input[0];

      // Check for browser extension format first (most common format with expirationDate)
      if (first.expirationDate !== undefined || (first.httpOnly !== undefined && first.name !== undefined)) {
        return 'browser';
      }

      // Check for c3c-fbstate format
      if (first.key !== undefined && first.domain !== undefined) {
        return 'c3c-fbstate';
      }

      // Check for browser extension format (simpler checks)
      if (first.name !== undefined && first.value !== undefined) {
        return 'browser';
      }

      // Check for FCA format (simpler array of objects)
      if (first.key !== undefined && first.value !== undefined && !first.domain) {
        return 'fca-unofficial';
      }
    }

    // Check if it's an object with cookies property
    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      if (obj.cookies && Array.isArray(obj.cookies)) {
        return 'c3c-fbstate';
      }
    }

    throw new Error('Unable to detect cookie format');
  }

  /**
   * Parse c3c-fbstate format
   */
  private static parseC3CFbState(input: unknown): Cookie[] {
    let cookies: unknown[];

    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          cookies = parsed;
        } else if (parsed.cookies && Array.isArray(parsed.cookies)) {
          cookies = parsed.cookies;
        } else {
          throw new Error('Invalid c3c-fbstate format');
        }
      } catch (e) {
        throw new Error(`Failed to parse c3c-fbstate: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (Array.isArray(input)) {
      cookies = input;
    } else if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      if (obj.cookies && Array.isArray(obj.cookies)) {
        cookies = obj.cookies;
      } else {
        throw new Error('Invalid c3c-fbstate format');
      }
    } else {
      throw new Error('Invalid c3c-fbstate input type');
    }

    return cookies.map((c) => this.normalizeCookie(c, 'c3c-fbstate'));
  }

  /**
   * Parse FCA (fca-unofficial / facebook-chat-api) format
   */
  private static parseFCAFormat(input: unknown): Cookie[] {
    let cookies: unknown[];

    if (typeof input === 'string') {
      try {
        cookies = JSON.parse(input);
      } catch (e) {
        throw new Error(`Failed to parse FCA format: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (Array.isArray(input)) {
      cookies = input;
    } else {
      throw new Error('Invalid FCA input type');
    }

    return cookies.map((c) => this.normalizeCookie(c, 'fca-unofficial'));
  }

  /**
   * Parse browser extension formats (EditThisCookie, Cookie-Editor, etc.)
   */
  private static parseBrowserFormat(input: unknown): Cookie[] {
    let cookies: unknown[];

    if (typeof input === 'string') {
      try {
        cookies = JSON.parse(input);
      } catch (e) {
        throw new Error(`Failed to parse browser format: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (Array.isArray(input)) {
      cookies = input;
    } else {
      throw new Error('Invalid browser cookie input type');
    }

    return cookies
      .map((c) => this.normalizeCookie(c, 'browser'))
      .filter(c => c !== null);
  }

  /**
   * Parse raw cookie string
   */
  private static parseRawCookieString(input: unknown): Cookie[] {
    if (typeof input !== 'string') {
      throw new Error('Raw cookie format requires a string input');
    }

    const cookies: Cookie[] = [];
    const pairs = input.split(';');

    for (const pair of pairs) {
      const trimmed = pair.trim();
      if (!trimmed) continue;

      const [name, ...valueParts] = trimmed.split('=');
      if (name) {
        cookies.push({
          key: name.trim(),
          value: valueParts.join('=').trim(),
          domain: '.facebook.com',
          path: '/',
        });
      }
    }

    return cookies;
  }

  /**
   * Normalize a cookie object to internal format
   */
  private static normalizeCookie(cookie: unknown, sourceFormat: string): Cookie {
    if (typeof cookie !== 'object' || cookie === null) {
      throw new Error(`Invalid cookie object from ${sourceFormat}`);
    }

    const c = cookie as Record<string, unknown>;

    // Map various field names to our standard format
    const key = (c.key || c.name || c.Name) as string;
    const value = (c.value || c.Value || c.val) as unknown;
    const domain = (c.domain || c.Domain || c.domains) as string;
    const path = (c.path || c.Path || '/') as string;

    if (!key || typeof key !== 'string') {
      logger.warn('Cookie missing key/name field', { cookie, sourceFormat });
      return null as any; // Filtered out below
    }

    // Ensure value is a string, handling various types
    let stringValue = '';
    if (value !== undefined && value !== null) {
      stringValue = typeof value === 'string' ? value : String(value);
    }

    return {
      key: key.trim(),
      value: stringValue,
      domain: (domain || '.facebook.com').trim(),
      path: (path || '/').trim(),
      hostOnly: (c.hostOnly === true || c.hostOnly === 'true'),
      creation: c.creation as string | undefined,
      lastAccessed: c.lastAccessed as string | undefined,
    };
  }

  /**
   * Convert cookies to c3c-fbstate format
   */
  static toC3CFbState(cookies: Cookie[]): string {
    return JSON.stringify(cookies, null, 2);
  }

  /**
   * Convert cookies to FCA format
   */
  static toFCAFormat(cookies: Cookie[]): string {
    const fcaCookies = cookies.map((c) => ({
      key: c.key,
      value: c.value,
      domain: c.domain,
      path: c.path,
    }));
    return JSON.stringify(fcaCookies, null, 2);
  }

  /**
   * Convert cookies to browser extension format
   */
  static toBrowserFormat(cookies: Cookie[]): string {
    const browserCookies = cookies.map((c) => ({
      name: c.key,
      value: c.value,
      domain: c.domain,
      path: c.path,
      hostOnly: c.hostOnly ?? false,
    }));
    return JSON.stringify(browserCookies, null, 2);
  }

  /**
   * Convert cookies to raw string format
   */
  static toRawString(cookies: Cookie[]): string {
    return cookies.map((c) => `${c.key}=${c.value}`).join('; ');
  }

  /**
   * Extract specific cookie value
   */
  static getCookieValue(cookies: Cookie[], key: string): string | undefined {
    const cookie = cookies.find((c) => c.key === key);
    return cookie?.value;
  }

  /**
   * Check if required cookies are present
   */
  static validateCookies(cookies: Cookie[]): { valid: boolean; missing: string[] } {
    const required = ['c_user', 'xs'];
    const missing: string[] = [];

    for (const key of required) {
      if (!cookies.some((c) => c.key === key)) {
        missing.push(key);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Parse AppState from various formats
   */
  static parseAppState(input: unknown): AppState {
    if (typeof input === 'string') {
      try {
        input = JSON.parse(input);
      } catch (e) {
        throw new Error(`Failed to parse AppState: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (Array.isArray(input)) {
      // It's just cookies
      return {
        cookies: this.parse(input),
      };
    }

    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      
      if (obj.cookies && Array.isArray(obj.cookies)) {
        return {
          cookies: this.parse(obj.cookies),
          fbDtsg: obj.fbDtsg as string | undefined,
          userId: obj.userId as string | undefined,
          token: obj.token as string | undefined,
          region: obj.region as string | undefined,
          deviceId: obj.deviceId as string | undefined,
          irisSeqId: obj.irisSeqId as string | undefined,
        };
      }
    }

    throw new Error('Invalid AppState format');
  }

  /**
   * Serialize AppState to string
   */
  static serializeAppState(appState: AppState): string {
    return JSON.stringify(appState, null, 2);
  }
}
