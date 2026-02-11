/**
 * Logging Utility for Panindigan
 */

import type { LogLevel } from '../types/index.js';

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = 'info';
  private prefix: string = '[Panindigan]';

  private readonly logLevels: Record<LogLevel, number> = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    verbose: 5,
  };

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.logLevels[level] <= this.logLevels[this.logLevel];
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} ${this.prefix} [${level.toUpperCase()}] ${message}`;
  }

  error(message: string, error?: Error | unknown): void {
    if (!this.shouldLog('error')) return;
    console.error(this.formatMessage('error', message));
    if (error) {
      if (error instanceof Error) {
        console.error(`  Stack: ${error.stack}`);
      } else {
        console.error(`  Details:`, error);
      }
    }
  }

  warn(message: string, data?: unknown): void {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatMessage('warn', message));
    if (data && this.logLevel === 'verbose') {
      console.warn('  Data:', data);
    }
  }

  info(message: string, data?: unknown): void {
    if (!this.shouldLog('info')) return;
    console.info(this.formatMessage('info', message));
    if (data && this.logLevel === 'verbose') {
      console.info('  Data:', data);
    }
  }

  debug(message: string, data?: unknown): void {
    if (!this.shouldLog('debug')) return;
    console.debug(this.formatMessage('debug', message));
    if (data) {
      console.debug('  Data:', data);
    }
  }

  verbose(message: string, data?: unknown): void {
    if (!this.shouldLog('verbose')) return;
    console.log(this.formatMessage('verbose', message));
    if (data) {
      console.log('  Data:', typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
    }
  }

  // Specialized loggers for specific events
  logMessage(direction: 'sent' | 'received', threadId: string, messageId: string, body?: string): void {
    if (!this.shouldLog('debug')) return;
    const truncatedBody = body ? (body.length > 50 ? body.substring(0, 50) + '...' : body) : '[no text]';
    this.debug(`Message ${direction}`, { threadId, messageId, body: truncatedBody });
  }

  logEvent(eventType: string, data?: unknown): void {
    if (!this.shouldLog('debug')) return;
    this.debug(`Event: ${eventType}`, data);
  }

  logAPICall(endpoint: string, method: string, duration: number, success: boolean): void {
    if (!this.shouldLog('verbose')) return;
    this.verbose(`API ${method} ${endpoint}`, { duration: `${duration}ms`, success });
  }

  logMQTT(action: string, data?: unknown): void {
    if (!this.shouldLog('debug')) return;
    this.debug(`MQTT ${action}`, data);
  }

  logAuth(stage: string, status: 'started' | 'success' | 'failed', details?: string): void {
    if (!this.shouldLog('info')) return;
    const message = `Auth ${stage}: ${status}${details ? ` - ${details}` : ''}`;
    if (status === 'failed') {
      this.error(message);
    } else {
      this.info(message);
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
