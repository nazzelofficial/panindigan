/**
 * HTTP Request Handler for Panindigan
 * Advanced retry mechanism with exponential backoff
 */

import type { CookieJar } from 'tough-cookie';
import { logger } from '../utils/Logger.js';
import { DEFAULT_HEADERS, ERROR_CODES, FACEBOOK_BASE_URL } from '../utils/Constants.js';
import type { RequestOptions, APIError } from '../types/index.js';

export class RequestHandler {
  private cookieJar: CookieJar;
  private userAgent: string;
  private defaultTimeout: number = 30000;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;

  constructor(cookieJar: CookieJar, userAgent: string, _proxy?: string) {
    this.cookieJar = cookieJar;
    this.userAgent = userAgent;
    // Proxy support reserved for future implementation
  }

  /**
   * Make an HTTP GET request
   */
  async get(url: string, options: RequestOptions = {}): Promise<Response> {
    return this.request('GET', url, undefined, options);
  }

  /**
   * Make an HTTP POST request
   */
  async post(url: string, body: unknown, options: RequestOptions = {}): Promise<Response> {
    return this.request('POST', url, body, options);
  }

  /**
   * Make an HTTP request with retry logic
   */
  private async request(
    method: string,
    url: string,
    body: unknown,
    options: RequestOptions
  ): Promise<Response> {
    const maxRetries = this.maxRetries;
    const retryDelay = this.retryDelay;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeRequest(method, url, body, options);
      } catch (error) {
        lastError = error;
        
        const apiError = error as APIError;
        if (!apiError.retryable || attempt === maxRetries) {
          throw error;
        }

        const delay = retryDelay * Math.pow(2, attempt);
        logger.warn(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, {
          url,
          method,
          error: apiError.message,
        });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Execute a single request
   */
  private async executeRequest(
    method: string,
    url: string,
    body: unknown,
    options: RequestOptions
  ): Promise<Response> {
    const startTime = Date.now();
    const timeout = options.timeout || this.defaultTimeout;

    // Get cookies for this URL
    const cookies = await this.cookieJar.getCookies(url);
    const cookieHeader = cookies.map((c) => `${c.key}=${c.value}`).join('; ');

    // Build headers
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      'User-Agent': this.userAgent,
      'Cookie': cookieHeader,
      ...options.headers,
    };

    // Build request body
    let requestBody: string | Buffer | FormData | undefined;
    if (body) {
      if (body instanceof FormData) {
        requestBody = body;
        delete headers['Content-Type'];
      } else if (typeof body === 'string') {
        requestBody = body;
      } else if (Buffer.isBuffer(body)) {
        requestBody = body;
      } else {
        requestBody = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
      }
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Make request
    const response = await fetch(url, {
      method,
      headers,
      body: requestBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Store cookies from response
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      const cookieStrings = Array.isArray(setCookieHeader) 
        ? setCookieHeader 
        : [setCookieHeader];
      for (const cookieStr of cookieStrings) {
        await this.cookieJar.setCookie(cookieStr, url);
      }
    }

    // Log API call
    const duration = Date.now() - startTime;
    logger.logAPICall(url, method, duration, response.ok);

    // Check for HTTP errors
    if (!response.ok) {
      throw this.createError(
        ERROR_CODES.API_ERROR,
        `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    return response;
  }

  /**
   * Get the cookie jar
   */
  getCookieJar(): CookieJar {
    return this.cookieJar;
  }

  /**
   * Set the cookie jar
   */
  setCookieJar(cookieJar: CookieJar): void {
    this.cookieJar = cookieJar;
  }

  /**
   * Get cookies as a string
   */
  async getCookiesString(url: string = FACEBOOK_BASE_URL): Promise<string> {
    const cookies = await this.cookieJar.getCookies(url);
    return cookies.map((c) => `${c.key}=${c.value}`).join('; ');
  }

  /**
   * Create an API error
   */
  private createError(
    code: string,
    message: string,
    statusCode: number = 0,
    originalError?: unknown
  ): APIError {
    const error = new Error(message) as APIError;
    error.code = code;
    error.statusCode = statusCode;
    error.retryable = this.isRetryableError(code, statusCode);
    error.data = originalError;
    return error;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(code: string, statusCode: number): boolean {
    if (code === ERROR_CODES.NETWORK_ERROR || code === ERROR_CODES.TIMEOUT_ERROR) {
      return true;
    }
    if (code === ERROR_CODES.API_ERROR && statusCode >= 500 && statusCode < 600) {
      return true;
    }
    return false;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
