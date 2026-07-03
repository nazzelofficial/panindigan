/**
 * Message Queue with Persistence
 * Ensures message delivery even during disconnections
 */

import { logger } from './Logger.js';
import { readFileSync, existsSync } from 'fs';
import { writeFile } from 'fs/promises';

export interface QueuedMessage {
  id: string;
  threadId: string;
  body: string;
  timestamp: number;
  attempts: number;
  maxAttempts: number;
  priority: number;
}

export interface MessageQueueOptions {
  maxSize?: number;
  persistencePath?: string;
  autoSave?: boolean;
}

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private maxSize: number;
  private persistencePath: string | null;
  private autoSave: boolean;
  private processing: boolean = false;

  constructor(options: MessageQueueOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.persistencePath = options.persistencePath ?? null;
    this.autoSave = options.autoSave ?? true;

    if (this.persistencePath) {
      this.loadFromDisk();
    }
  }

  /**
   * Add message to queue
   */
  enqueue(message: Omit<QueuedMessage, 'id' | 'timestamp' | 'attempts'>): string {
    const id = this.generateId();
    const queuedMessage: QueuedMessage = {
      ...message,
      id,
      timestamp: Date.now(),
      attempts: 0,
    };

    // Insert based on priority (higher priority first)
    const insertIndex = this.queue.findIndex(m => m.priority < queuedMessage.priority);
    if (insertIndex === -1) {
      this.queue.push(queuedMessage);
    } else {
      this.queue.splice(insertIndex, 0, queuedMessage);
    }

    // Enforce max size
    if (this.queue.length > this.maxSize) {
      this.queue.shift();
    }

    if (this.autoSave && this.persistencePath) {
      this.saveToDisk();
    }

    logger.debug(`Message enqueued: ${id}`);
    return id;
  }

  /**
   * Get next message from queue
   */
  dequeue(): QueuedMessage | null {
    if (this.queue.length === 0) {
      return null;
    }

    const message = this.queue.shift()!;
    
    if (this.autoSave && this.persistencePath) {
      this.saveToDisk();
    }

    return message;
  }

  /**
   * Peek at next message without removing
   */
  peek(): QueuedMessage | null {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  /**
   * Remove specific message from queue
   */
  remove(id: string): boolean {
    const index = this.queue.findIndex(m => m.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      
      if (this.autoSave && this.persistencePath) {
        this.saveToDisk();
      }
      
      return true;
    }
    return false;
  }

  /**
   * Update message attempt count
   */
  updateAttempts(id: string): void {
    const message = this.queue.find(m => m.id === id);
    if (message) {
      message.attempts++;
      
      if (this.autoSave && this.persistencePath) {
        this.saveToDisk();
      }
    }
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.queue = [];
    
    if (this.autoSave && this.persistencePath) {
      this.saveToDisk();
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    oldestMessage: number | null;
    newestMessage: number | null;
    byPriority: Record<number, number>;
  } {
    const timestamps = this.queue.map(m => m.timestamp);
    const byPriority: Record<number, number> = {};

    for (const message of this.queue) {
      byPriority[message.priority] = (byPriority[message.priority] || 0) + 1;
    }

    return {
      size: this.queue.length,
      maxSize: this.maxSize,
      oldestMessage: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestMessage: timestamps.length > 0 ? Math.max(...timestamps) : null,
      byPriority,
    };
  }

  /**
   * Save queue to disk asynchronously (fire-and-forget).
   * Using async I/O prevents blocking the event loop on every enqueue/dequeue.
   */
  private saveToDisk(): void {
    if (!this.persistencePath) return;

    const path = this.persistencePath;
    const data = JSON.stringify(this.queue);
    writeFile(path, data, 'utf-8').catch((error) => {
      logger.error('Failed to save message queue to disk', error);
    });
  }

  /**
   * Load queue from disk
   */
  private loadFromDisk(): void {
    if (!this.persistencePath || !existsSync(this.persistencePath)) return;

    try {
      const data = readFileSync(this.persistencePath, 'utf-8');
      this.queue = JSON.parse(data);
      logger.info(`Loaded ${this.queue.length} messages from disk`);
    } catch (error) {
      logger.error('Failed to load message queue from disk', error);
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Process queue with handler function
   */
  async process(handler: (message: QueuedMessage) => Promise<boolean>): Promise<void> {
    if (this.processing) {
      logger.warn('Message queue is already processing');
      return;
    }

    this.processing = true;
    logger.info('Starting message queue processing');

    while (this.queue.length > 0) {
      const message = this.peek();
      if (!message) break;

      // Check max attempts
      if (message.attempts >= message.maxAttempts) {
        logger.warn(`Message ${message.id} exceeded max attempts, removing`);
        this.remove(message.id);
        continue;
      }

      try {
        const success = await handler(message);
        
        if (success) {
          this.remove(message.id);
          logger.debug(`Message ${message.id} processed successfully`);
        } else {
          this.updateAttempts(message.id);
          logger.warn(`Message ${message.id} processing failed, attempt ${message.attempts + 1}/${message.maxAttempts}`);
          
          // Move to end of queue for retry
          const msg = this.dequeue();
          if (msg) {
            this.queue.push(msg);
          }
          
          // Wait before retry
          await this.sleep(1000 * message.attempts);
        }
      } catch (error) {
        this.updateAttempts(message.id);
        logger.error(`Error processing message ${message.id}`, error);
        
        // Move to end of queue for retry
        const msg = this.dequeue();
        if (msg) {
          this.queue.push(msg);
        }
        
        await this.sleep(1000 * message.attempts);
      }
    }

    this.processing = false;
    logger.info('Message queue processing completed');
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
