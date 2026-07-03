/**
 * EntropyPool — CSPRNG seed pool for offline_threading_id generation.
 *
 * Facebook's own clients use the lower 22 bits of the threading ID for entropy.
 * Plain Math.random() is predictable under Node.js V8 — especially during
 * burst sends where many IDs are generated in rapid succession within the same
 * Math.random() sequence.  A CSPRNG pool drawn from crypto.randomBytes()
 * eliminates that predictability, making it harder for Facebook's anti-spam
 * classifier to fingerprint a bot by its ID distribution.
 *
 * The pool is pre-filled on first use and automatically refilled when it
 * drops below the low-water mark to keep crypto overhead off the hot path.
 */

import { randomBytes } from 'crypto';
import { logger } from '../utils/Logger.js';

export interface EntropyPoolOptions {
  /**
   * Number of random 22-bit values to keep pre-generated.
   * Default: 256.
   */
  poolSize?: number;
  /**
   * Refill the pool when fewer than this many values remain.
   * Default: 48 — large enough to absorb a small burst without blocking.
   */
  lowWaterMark?: number;
  /**
   * Rotate the seed (refill entire pool) after this many draws, regardless
   * of the low-water mark.  0 = never force rotate.  Default: 512.
   */
  rotationInterval?: number;
}

/** Max value of a 22-bit integer (2^22 − 1). */
const MASK_22 = 0x3fffff;

export class EntropyPool {
  private pool: bigint[] = [];
  private poolSize: number;
  private lowWaterMark: number;
  private rotationInterval: number;
  private drawCount: number = 0;
  private totalRefills: number = 0;

  constructor(options: EntropyPoolOptions = {}) {
    this.poolSize       = options.poolSize       ?? 256;
    this.lowWaterMark   = options.lowWaterMark   ?? 48;
    this.rotationInterval = options.rotationInterval ?? 512;

    // Eager fill so the first call to next() is instant
    this.refill(this.poolSize);
  }

  /**
   * Return the next CSPRNG-derived 22-bit value as a BigInt.
   * Triggers a background refill if the pool dips below lowWaterMark.
   */
  next(): bigint {
    this.drawCount++;

    // Force full rotation on interval
    if (this.rotationInterval > 0 && this.drawCount % this.rotationInterval === 0) {
      this.refill(this.poolSize);
      logger.debug('EntropyPool: rotation refill', {
        drawCount: this.drawCount,
        totalRefills: this.totalRefills,
      });
    } else if (this.pool.length <= this.lowWaterMark) {
      // Partial top-up — bring back to full
      const needed = this.poolSize - this.pool.length;
      this.refill(needed);
    }

    return this.pool.pop()!;
  }

  /**
   * Generate a full Messenger offline_threading_id using CSPRNG entropy.
   *
   * Format: (timestampMs << 22n) | random22bits
   * — upper 42 bits: current time in milliseconds
   * — lower 22 bits: cryptographically random
   *
   * This is identical to the format used by Facebook's web client, with
   * the only difference being the source of the lower 22 bits.
   */
  nextOfflineId(): string {
    const now    = BigInt(Date.now());
    const random = this.next() & BigInt(MASK_22);
    return ((now << 22n) | random).toString();
  }

  /**
   * Pre-generate `count` CSPRNG-backed 22-bit bigint values and push them
   * onto the pool.  Each call to randomBytes(3) yields exactly 24 bits;
   * we mask to 22.
   */
  refill(count: number): void {
    // Generate all bytes in one syscall (3 bytes × count = 22 usable bits each)
    const bytes = randomBytes(3 * count);
    for (let i = 0; i < count; i++) {
      const offset = i * 3;
      const val = (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
      this.pool.push(BigInt(val & MASK_22));
    }
    this.totalRefills++;
  }

  /** Current pool depth (for diagnostics). */
  depth(): number {
    return this.pool.length;
  }

  /** Stats for logging / health checks. */
  getStats(): { depth: number; drawCount: number; totalRefills: number } {
    return {
      depth:        this.pool.length,
      drawCount:    this.drawCount,
      totalRefills: this.totalRefills,
    };
  }
}
