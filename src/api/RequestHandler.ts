/**
 * HTTP Request Handler for Panindigan
 * Advanced retry mechanism with exponential backoff, circuit breaker, caching,
 * rate limiting, and Facebook-specific headers (x-fb-lsd, x-asbd-id).
 */

import type { CookieJar } from 'tough-cookie';
import { logger } from '../utils/Logger.js';
import {
  DEFAULT_HEADERS,
  ERROR_CODES,
  FACEBOOK_BASE_URL,
  FB_HEADER_LSD,
  FB_HEADER_ASBD,
} from '../utils/Constants.js';
import { CircuitBreaker } from '../utils/CircuitBreaker.js';
import { RequestCache } from '../utils/RequestCache.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { NetworkError, RateLimitError, TimeoutError } from '../errors/index.js';
import type { CheckpointGuard } from '../security/CheckpointGuard.js';
import type { RequestOptions, APIError } from '../types/index.js';

export class RequestHandler {
  private cookieJar: CookieJar;
  private userAgent: string;
  private defaultTimeout: number = 30000;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;
  private circuitBreaker: CircuitBreaker;
  private cache: RequestCache;
  private rateLimiter: RateLimiter;

  /** x-fb-lsd token (extracted from page HTML, rotated periodically) */
  private lsdToken: string = '';
  /** x-asbd-id is a static fingerprint Messenger always sends */
  private readonly asbdId: string = '198387';
  /** Optional checkpoint guard — screens every response URL for redirect signals */
  private checkpointGuard?: CheckpointGuard;

  constructor(cookieJar: CookieJar, userAgent: string, _proxy?: string) {
    this.cookieJar = cookieJar;
    this.userAgent = userAgent;
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
    });
    this.cache = new RequestCache({
      defaultTTL: 300000,
      maxSize: 1000,
    });
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 30,
      interval: 1000,
      maxTokens: 100,
    });
  }

  /** Inject the x-fb-lsd token extracted from a Facebook HTML page */
  setLsdToken(token: string): void {
    this.lsdToken = token;
  }

  getLsdToken(): string {
    return this.lsdToken;
  }

  /** Attach a CheckpointGuard so every response URL is screened automatically. */
  setCheckpointGuard(guard: CheckpointGuard): void {
    this.checkpointGuard = guard;
  }

  /**
   * Make an HTTP GET request
   */
  async get(url: string, options: RequestOptions = {}): Promise<Response> {
    if (!options.skipCache) {
      const cacheKey = this.getCacheKey('GET', url, options);
      const cached = this.cache.get<string>(cacheKey);
      if (cached) {
        logger.debug(`Cache hit for ${url}`);
        return new Response(cached, { status: 200, statusText: 'OK' });
      }
    }
    return this.request('GET', url, undefined, options);
  }

  /**
   * Make an HTTP POST request
   */
  async post(url: string, body: unknown, options: RequestOptions = {}): Promise<Response> {
    return this.request('POST', url, body, options);
  }

  /**
   * Make an HTTP request with retry + exponential backoff
   */
  private async request(
    method: string,
    url: string,
    body: unknown,
    options: RequestOptions
  ): Promise<Response> {
    const maxRetries = this.maxRetries;
    const baseDelay = this.retryDelay;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeRequest(method, url, body, options);
      } catch (error) {
        lastError = error;

        // Do not retry non-retryable errors immediately
        if (error instanceof RateLimitError && error.retryAfter) {
          const waitMs = error.retryAfter * 1000;
          logger.warn(`Rate limited — waiting ${waitMs}ms before retry`, { url });
          await this.sleep(waitMs);
          continue;
        }

        const apiError = error as APIError;
        if (!apiError.retryable || attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 0.3 * delay;
        const wait = Math.round(delay + jitter);

        logger.warn(
          `Request failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${wait}ms`,
          { url, method, error: (error as Error).message }
        );
        await this.sleep(wait);
      }
    }

    throw lastError;
  }

  /**
   * Execute a single HTTP request via native fetch, guarded by the circuit
   * breaker and rate limiter.
   */
  private async executeRequest(
    method: string,
    url: string,
    body: unknown,
    options: RequestOptions
  ): Promise<Response> {
    // Rate-limit check (skip for requests that opted out)
    if (!options.skipRateLimit && !this.rateLimiter.tryConsume()) {
      const waitMs = this.rateLimiter.calculateWaitTime(1);
      throw new RateLimitError(
        `Local rate limit exceeded — try again in ${Math.ceil(waitMs / 1000)}s`,
        Math.ceil(waitMs / 1000)
      );
    }

    // Wrap the actual fetch inside the circuit breaker so repeated failures
    // trip the breaker and give Facebook's servers time to recover.
    // The CircuitBreaker throws a generic Error when OPEN — convert it to a
    // typed NetworkError so callers get a retryable, instanceof-safe error.
    try {
      return await this.circuitBreaker.execute(async () => {
        return this._doFetch(method, url, body, options);
      }, `${method} ${url}`);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message.includes('Circuit breaker is OPEN')
      ) {
        throw new NetworkError(
          `Circuit breaker is open for ${url} — too many recent failures. Try again later.`,
          0,
          { circuitOpen: true, originalMessage: error.message }
        );
      }
      throw error;
    }
  }

  /**
   * The raw fetch call — called exclusively from inside the circuit breaker.
   */
  private async _doFetch(
    method: string,
    url: string,
    body: unknown,
    options: RequestOptions
  ): Promise<Response> {
    const startTime = Date.now();
    const timeout = options.timeout || this.defaultTimeout;

    // Collect cookies
    const cookies = await this.cookieJar.getCookies(url);
    const cookieHeader = cookies.map((c) => `${c.key}=${c.value}`).join('; ');

    // Build headers — always include FB-specific ones
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      'User-Agent': this.userAgent,
      Cookie: cookieHeader,
      ...options.headers,
    };

    // Inject x-fb-lsd if we have the token
    if (this.lsdToken) {
      headers[FB_HEADER_LSD] = this.lsdToken;
    }
    // x-asbd-id is always present in Messenger Web requests
    headers[FB_HEADER_ASBD] = this.asbdId;

    // Build request body
    let requestBody: string | Buffer | FormData | undefined;
    if (body !== undefined && body !== null) {
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

    // Timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if ((fetchError as Error).name === 'AbortError') {
        throw new TimeoutError(url, timeout);
      }
      const msg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      const err = new NetworkError(`Fetch failed for ${url}: ${msg}`) as APIError;
      err.retryable = true;
      throw err;
    }

    clearTimeout(timeoutId);

    // Sync Set-Cookie headers into cookie jar
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      const cookieStrings = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : [setCookieHeader];
      for (const cookieStr of cookieStrings) {
        try {
          await this.cookieJar.setCookie(cookieStr, url);
        } catch {
          // Ignore malformed Set-Cookie values
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.logAPICall(url, method, duration, response.ok);

    // Screen for checkpoint redirects (URL-level signal, no body needed)
    if (this.checkpointGuard) {
      this.checkpointGuard.inspectUrl(response.url || url, response.status);
    }

    // Handle rate limiting explicitly
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
      throw new RateLimitError(
        `Rate limited by Facebook: retry after ${retryAfter}s`,
        retryAfter
      );
    }

    if (!response.ok) {
      const err = new NetworkError(
        `HTTP ${response.status}: ${response.statusText} (${url})`,
        response.status
      ) as APIError;
      err.code = ERROR_CODES.API_ERROR;
      err.retryable = response.status >= 500;
      throw err;
    }

    return response;
  }

  getCookieJar(): CookieJar { return this.cookieJar; }

  setCookieJar(cookieJar: CookieJar): void { this.cookieJar = cookieJar; }

  async getCookiesString(url: string = FACEBOOK_BASE_URL): Promise<string> {
    const cookies = await this.cookieJar.getCookies(url);
    return cookies.map((c) => `${c.key}=${c.value}`).join('; ');
  }

  getCache(): RequestCache { return this.cache; }

  getCircuitBreaker(): CircuitBreaker { return this.circuitBreaker; }

  getRateLimiter(): RateLimiter { return this.rateLimiter; }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getCacheKey(method: string, url: string, options: RequestOptions): string {
    return `${method}:${url}:${JSON.stringify(options)}`;
  }
}
