/**
 * CheckpointGuard — Automated checkpoint detection and burst-send protection.
 *
 * Facebook's anti-automation system raises "checkpoints" (security challenges)
 * when it detects bot-like behaviour — most commonly burst messaging, unusual
 * ID patterns, or rapid API calls.  Once a checkpoint is raised the account is
 * effectively unusable until the challenge is resolved.
 *
 * This guard does three things:
 *
 * 1. **Checkpoint detection** — every HTTP response URL and body is screened
 *    for known checkpoint signals.  On detection the guard enters a BLOCKED
 *    state and all outgoing sends are refused until clearCheckpoint() is called.
 *
 * 2. **Burst tracking** — a sliding 60-second window counts outgoing sends.
 *    Three levels are reported: 'safe' (< 20/min), 'warn' (20–39/min), and
 *    'critical' (≥ 40/min).  At 'warn' an adaptive delay is injected; at
 *    'critical' sends are blocked until the window cools down.
 *
 * 3. **Exponential backoff advice** — when blocked, backoffMs() returns the
 *    recommended wait before the caller retries (caps at 5 minutes).
 */

import { logger } from '../utils/Logger.js';
import { CheckpointError } from '../errors/index.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Substrings in response URL that indicate a checkpoint redirect. */
const CHECKPOINT_URL_SIGNALS = [
  '/checkpoint/',
  'checkpoint_required',
  'checkpoint/?next',
  '/login/checkpoint',
  '/security/checkpoint',
];

/** Substrings in JSON body that indicate a checkpoint requirement. */
const CHECKPOINT_BODY_SIGNALS = [
  '"checkpoint_required"',
  '"checkpoint_url"',
  '"verification_required"',
  '"checkpoint":true',
  '"type":"checkpoint"',
  // Facebook error codes
  '"1357007"',   // CHECKPOINT_REQUIRED
  '"368"',       // BLOCKED_BY_FACEBOOK_ACTION
  '"CHECKPOINT"',
];

/** Burst window in milliseconds (60 seconds). */
const BURST_WINDOW_MS = 60_000;

/** Sends per minute thresholds. */
const WARN_THRESHOLD    = 20;
const CRITICAL_THRESHOLD = 40;

/** Adaptive delays injected at each burst level (ms). */
const BURST_DELAY: Record<'warn' | 'critical', number> = {
  warn:     1_200,
  critical: 4_000,
};

/** Backoff sequence (ms): 5s → 15s → 45s → 2min → 5min. */
const BACKOFF_SEQUENCE = [5_000, 15_000, 45_000, 120_000, 300_000];

// ─── Types ────────────────────────────────────────────────────────────────────

export type GuardState = 'clear' | 'checkpoint' | 'suspended';
export type BurstLevel = 'safe' | 'warn' | 'critical';

export type CheckpointCallback = (checkpointUrl: string, error: CheckpointError) => void;

export interface CheckpointGuardOptions {
  /** Emit a warning log whenever burst level exceeds 'safe'. Default: true. */
  logBurstWarnings?: boolean;
  /**
   * When true, 'critical' burst level blocks sends immediately even without a
   * server-side checkpoint signal.  Default: true.
   */
  blockOnCriticalBurst?: boolean;
}

export interface GuardStats {
  state:        GuardState;
  burstLevel:   BurstLevel;
  sendsLastMin: number;
  checkpointUrl?: string;
  backoffMs:    number;
  backoffStep:  number;
}

// ─── CheckpointGuard ─────────────────────────────────────────────────────────

export class CheckpointGuard {
  private state: GuardState = 'clear';
  private checkpointUrl: string = '';
  private backoffStep: number = 0;
  private callbacks: CheckpointCallback[] = [];
  private opts: Required<CheckpointGuardOptions>;

  /** Sliding window: timestamps of recent outgoing sends (epoch ms). */
  private sendTimestamps: number[] = [];

  constructor(options: CheckpointGuardOptions = {}) {
    this.opts = {
      logBurstWarnings:     options.logBurstWarnings     ?? true,
      blockOnCriticalBurst: options.blockOnCriticalBurst ?? true,
    };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register a callback that fires every time a checkpoint is detected.
   * Multiple callbacks are supported.
   */
  onCheckpoint(cb: CheckpointCallback): void {
    this.callbacks.push(cb);
  }

  /**
   * Screen an HTTP response URL for checkpoint redirect signals.
   * Call this from RequestHandler after every fetch().
   */
  inspectUrl(responseUrl: string, statusCode: number): void {
    const url = responseUrl.toLowerCase();
    // A 302 alone is not a checkpoint signal — login success also returns 302.
    // Only treat a redirect as a checkpoint if the destination URL contains a
    // known checkpoint path segment.
    const hasCheckpointSignal = CHECKPOINT_URL_SIGNALS.some((sig) => url.includes(sig));

    if (hasCheckpointSignal) {
      this.handleCheckpoint(responseUrl, statusCode === 302 ? 'URL redirect (302)' : 'URL signal');
    }
  }

  /**
   * Screen a response body for checkpoint signals.
   * Call this from GraphQLClient after consuming the response text.
   */
  inspectBody(text: string, url: string = ''): void {
    if (!text) return;

    const found = CHECKPOINT_BODY_SIGNALS.some((sig) =>
      text.includes(sig)
    );

    if (found) {
      this.handleCheckpoint(url || 'body', 'response body');
    }
  }

  /**
   * Record an outgoing send in the burst sliding window.
   * Returns the adaptive delay (ms) the caller should wait before sending.
   *
   * @throws {CheckpointError} when state is not 'clear' or burst is critical-blocked.
   */
  recordSend(): number {
    this.assertNotBlocked();

    const now = Date.now();
    // Evict entries older than the window
    this.sendTimestamps = this.sendTimestamps.filter(
      (t) => now - t < BURST_WINDOW_MS
    );
    this.sendTimestamps.push(now);

    const level = this.burstLevel();

    if (level === 'critical' && this.opts.blockOnCriticalBurst) {
      logger.warn('CheckpointGuard: critical burst rate — temporarily blocking send', {
        sendsLastMin: this.sendTimestamps.length,
        threshold:    CRITICAL_THRESHOLD,
      });
      this.state = 'suspended';
      const err = new CheckpointError(
        `Send rate too high: ${this.sendTimestamps.length} sends/min (limit ${CRITICAL_THRESHOLD})`,
        'burst-limit'
      );
      this.notifyCallbacks('burst-limit', err);
      throw err;
    }

    if (level !== 'safe' && this.opts.logBurstWarnings) {
      logger.warn(`CheckpointGuard: burst level is '${level}'`, {
        sendsLastMin: this.sendTimestamps.length,
        delay:        BURST_DELAY[level],
      });
    }

    return level === 'safe' ? 0 : BURST_DELAY[level];
  }

  /**
   * Assert the guard is not in a blocked state.
   * @throws {CheckpointError}
   */
  assertNotBlocked(): void {
    if (this.state !== 'clear') {
      throw new CheckpointError(
        `Account is ${this.state}. Clear the checkpoint before sending.`,
        this.checkpointUrl || 'unknown'
      );
    }
  }

  /** Whether sends are currently blocked. */
  isBlocked(): boolean {
    return this.state !== 'clear';
  }

  /** Current guard state. */
  getState(): GuardState {
    return this.state;
  }

  /**
   * The current burst level based on the rolling 60-second send window.
   */
  burstLevel(): BurstLevel {
    const now = Date.now();
    const recent = this.sendTimestamps.filter(
      (t) => now - t < BURST_WINDOW_MS
    ).length;

    if (recent >= CRITICAL_THRESHOLD) return 'critical';
    if (recent >= WARN_THRESHOLD)     return 'warn';
    return 'safe';
  }

  /**
   * Number of sends in the current 60-second window.
   */
  sendsLastMinute(): number {
    const now = Date.now();
    return this.sendTimestamps.filter((t) => now - t < BURST_WINDOW_MS).length;
  }

  /**
   * Recommended backoff duration (ms) when the guard is blocked.
   * Advances one step each time it is called, capped at BACKOFF_SEQUENCE's max.
   */
  backoffMs(): number {
    const ms = BACKOFF_SEQUENCE[Math.min(this.backoffStep, BACKOFF_SEQUENCE.length - 1)];
    this.backoffStep = Math.min(this.backoffStep + 1, BACKOFF_SEQUENCE.length - 1);
    return ms;
  }

  /**
   * Clear a checkpoint or suspended state.
   * The caller is responsible for ensuring the underlying checkpoint has been
   * resolved (e.g. user completed the security challenge) before calling this.
   */
  clearCheckpoint(): void {
    if (this.state === 'clear') return;

    logger.info('CheckpointGuard: checkpoint cleared', { previousState: this.state });
    this.state         = 'clear';
    this.checkpointUrl = '';
    this.backoffStep   = 0;
    this.sendTimestamps = [];
  }

  /** Full diagnostics snapshot. */
  getStats(): GuardStats {
    return {
      state:        this.state,
      burstLevel:   this.burstLevel(),
      sendsLastMin: this.sendsLastMinute(),
      checkpointUrl: this.checkpointUrl || undefined,
      backoffMs:    BACKOFF_SEQUENCE[Math.min(this.backoffStep, BACKOFF_SEQUENCE.length - 1)],
      backoffStep:  this.backoffStep,
    };
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private handleCheckpoint(source: string, via: string): void {
    if (this.state === 'checkpoint') return; // already handled

    this.state         = 'checkpoint';
    this.checkpointUrl = source;

    logger.error('CheckpointGuard: checkpoint detected', { source, via });

    const err = new CheckpointError(
      `Facebook checkpoint detected (via ${via}). Manual verification required.`,
      source
    );
    this.notifyCallbacks(source, err);
  }

  private notifyCallbacks(url: string, err: CheckpointError): void {
    for (const cb of this.callbacks) {
      try {
        cb(url, err);
      } catch (cbErr) {
        logger.error('CheckpointGuard: callback threw', cbErr);
      }
    }
  }
}
