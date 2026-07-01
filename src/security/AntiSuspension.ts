/**
 * Anti-Suspension System
 * Human-behavior simulation to avoid Facebook bans
 */

import { logger } from '../utils/Logger.js';

export interface AntiSuspensionOptions {
  enabled?: boolean;
  typingDelayMin?: number;
  typingDelayMax?: number;
  messageDelayMin?: number;
  messageDelayMax?: number;
  actionDelayMin?: number;
  actionDelayMax?: number;
  randomTypingPattern?: boolean;
  simulateHumanErrors?: boolean;
}

export class AntiSuspension {
  private options: Required<AntiSuspensionOptions>;
  private messageCount: number = 0;
  private actionCount: number = 0;
  private sessionStartTime: number = Date.now();

  constructor(options: AntiSuspensionOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      typingDelayMin: options.typingDelayMin ?? 500,
      typingDelayMax: options.typingDelayMax ?? 3000,
      messageDelayMin: options.messageDelayMin ?? 1000,
      messageDelayMax: options.messageDelayMax ?? 5000,
      actionDelayMin: options.actionDelayMin ?? 200,
      actionDelayMax: options.actionDelayMax ?? 1000,
      randomTypingPattern: options.randomTypingPattern ?? true,
      simulateHumanErrors: options.simulateHumanErrors ?? false,
    };
  }

  /**
   * Get random delay between min and max
   */
  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Delay before sending a message (simulates typing)
   */
  async beforeMessage(): Promise<void> {
    if (!this.options.enabled) return;

    const delay = this.getRandomDelay(
      this.options.messageDelayMin,
      this.options.messageDelayMax
    );

    logger.debug('Anti-Suspension: Delaying message', { delay, messageCount: this.messageCount });
    await this.sleep(delay);
    this.messageCount++;
  }

  /**
   * Delay before typing indicator
   */
  async beforeTyping(): Promise<void> {
    if (!this.options.enabled) return;

    const delay = this.getRandomDelay(
      this.options.typingDelayMin,
      this.options.typingDelayMax
    );

    logger.debug('Anti-Suspension: Delaying typing', { delay });
    await this.sleep(delay);
  }

  /**
   * Delay before any action
   */
  async beforeAction(): Promise<void> {
    if (!this.options.enabled) return;

    const delay = this.getRandomDelay(
      this.options.actionDelayMin,
      this.options.actionDelayMax
    );

    logger.debug('Anti-Suspension: Delaying action', { delay, actionCount: this.actionCount });
    await this.sleep(delay);
    this.actionCount++;
  }

  /**
   * Simulate human typing pattern with random variations
   */
  async simulateTyping(text: string): Promise<void> {
    if (!this.options.enabled || !this.options.randomTypingPattern) return;

    const chunks = this.splitTextIntoChunks(text);
    for (const _chunk of chunks) {
      const delay = this.getRandomDelay(100, 500);
      await this.sleep(delay);
    }
  }

  /**
   * Split text into chunks for typing simulation
   */
  private splitTextIntoChunks(text: string): string[] {
    const words = text.split(' ');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of words) {
      if (currentChunk.length + word.length > 20) {
        chunks.push(currentChunk.trim());
        currentChunk = word + ' ';
      } else {
        currentChunk += word + ' ';
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Check if should simulate human error (typos, etc.)
   */
  shouldSimulateError(): boolean {
    if (!this.options.enabled || !this.options.simulateHumanErrors) return false;
    return Math.random() < 0.02; // 2% chance
  }

  /**
   * Get session statistics
   */
  getStats(): {
    sessionDuration: number;
    messageCount: number;
    actionCount: number;
    messagesPerMinute: number;
    actionsPerMinute: number;
  } {
    const sessionDuration = Date.now() - this.sessionStartTime;
    const minutes = sessionDuration / 60000;

    return {
      sessionDuration,
      messageCount: this.messageCount,
      actionCount: this.actionCount,
      messagesPerMinute: minutes > 0 ? this.messageCount / minutes : 0,
      actionsPerMinute: minutes > 0 ? this.actionCount / minutes : 0,
    };
  }

  /**
   * Check if rate limit is being approached
   */
  isRateLimitSafe(): boolean {
    const stats = this.getStats();
    // Safe if less than 30 messages per minute
    return stats.messagesPerMinute < 30;
  }

  /**
   * Reset counters
   */
  reset(): void {
    this.messageCount = 0;
    this.actionCount = 0;
    this.sessionStartTime = Date.now();
    logger.debug('Anti-Suspension: Counters reset');
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enable/disable anti-suspension
   */
  setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
    logger.info('Anti-Suspension:', enabled ? 'Enabled' : 'Disabled');
  }

  /**
   * Update options
   */
  updateOptions(options: Partial<AntiSuspensionOptions>): void {
    this.options = { ...this.options, ...options };
    logger.debug('Anti-Suspension: Options updated', this.options);
  }
}
