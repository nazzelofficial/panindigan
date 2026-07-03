/**
 * Request Cache for API Optimization
 * Reduces redundant API calls with TTL-based caching
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface CacheOptions {
  defaultTTL?: number;
  maxSize?: number;
}

export class RequestCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private defaultTTL: number;
  private maxSize: number;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.defaultTTL ?? 300000; // 5 minutes
    this.maxSize = options.maxSize ?? 1000;

    // Periodically evict expired entries so the map doesn't grow unboundedly
    // even when entries are never accessed after insertion.
    this.cleanupTimer = setInterval(() => {
      this.cleanExpired();
    }, 300_000); // every 5 minutes
    // Allow Node.js to exit even if this timer is still running
    this.cleanupTimer.unref?.();
  }

  /** Stop the background cleanup timer (call in tests or when discarding the cache). */
  destroy(): void {
    clearInterval(this.cleanupTimer);
  }

  /**
   * Get cached value
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cached value
   */
  set<T>(key: string, data: T, ttl?: number): void {
    this.evictIfNeeded();
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    });
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Evict oldest entries if cache is full
   */
  private evictIfNeeded(): void {
    if (this.cache.size >= this.maxSize) {
      let oldestKey: string | null = null;
      let oldestTimestamp = Infinity;

      for (const [key, entry] of this.cache.entries()) {
        if (entry.timestamp < oldestTimestamp) {
          oldestTimestamp = entry.timestamp;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}
