/**
 * Token Bucket Rate Limiter
 * Prevents API abuse with configurable rate limits
 */

export interface RateLimiterOptions {
  tokensPerInterval?: number;
  interval?: number;
  maxTokens?: number;
}

export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private tokensPerInterval: number;
  private interval: number;
  private lastRefill: number;

  constructor(options: RateLimiterOptions = {}) {
    this.maxTokens = options.maxTokens ?? 100;
    this.tokens = this.maxTokens;
    this.tokensPerInterval = options.tokensPerInterval ?? 10;
    this.interval = options.interval ?? 1000; // 1 second
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume a token
   */
  tryConsume(tokens: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Wait until tokens are available
   */
  async waitForTokens(tokens: number = 1): Promise<void> {
    while (!this.tryConsume(tokens)) {
      const waitTime = this.calculateWaitTime(tokens);
      await this.sleep(waitTime);
    }
  }

  /**
   * Get wait time for tokens
   */
  calculateWaitTime(tokens: number): number {
    this.refill();
    const needed = tokens - this.tokens;
    if (needed <= 0) return 0;

    const intervalsNeeded = Math.ceil(needed / this.tokensPerInterval);
    return intervalsNeeded * this.interval;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.interval) {
      const intervals = Math.floor(elapsed / this.interval);
      const newTokens = intervals * this.tokensPerInterval;
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Get rate limiter stats
   */
  getStats(): {
    tokens: number;
    maxTokens: number;
    tokensPerInterval: number;
    interval: number;
  } {
    this.refill();
    return {
      tokens: this.tokens,
      maxTokens: this.maxTokens,
      tokensPerInterval: this.tokensPerInterval,
      interval: this.interval,
    };
  }

  /**
   * Reset rate limiter
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
