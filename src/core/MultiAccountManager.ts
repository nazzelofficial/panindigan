/**
 * Multi-Account Manager
 * Run multiple Facebook accounts simultaneously
 */

import { EventEmitter } from 'events';
import { PanindiganFCA, PanindiganFCAOptions } from './PanindiganFCA.js';
import { logger } from '../utils/Logger.js';
import type { Session, AppState, LoginOptions } from '../types/index.js';

export interface AccountConfig {
  id: string;
  name?: string;
  appState?: AppState;
  credentials?: LoginOptions;
  options?: PanindiganFCAOptions;
  autoConnect?: boolean;
}

export interface AccountInstance {
  id: string;
  name?: string;
  fca: PanindiganFCA;
  session: Session | null;
  connected: boolean;
  lastActive: Date;
}

export class MultiAccountManager extends EventEmitter {
  private accounts: Map<string, AccountInstance> = new Map();
  private defaultAccountId: string | null = null;

  /**
   * Add an account
   */
  async addAccount(config: AccountConfig): Promise<AccountInstance> {
    logger.info('MultiAccount: Adding account', { id: config.id, name: config.name });

    if (this.accounts.has(config.id)) {
      throw new Error(`Account with id ${config.id} already exists`);
    }

    const fca = new PanindiganFCA(config.options || {});

    // Set up event forwarding
    this.setupEventForwarding(config.id, fca);

    const instance: AccountInstance = {
      id: config.id,
      name: config.name,
      fca,
      session: null,
      connected: false,
      lastActive: new Date(),
    };

    this.accounts.set(config.id, instance);

    // Auto-connect if enabled
    if (config.autoConnect !== false) {
      try {
        const loginOptions: LoginOptions = config.appState 
          ? { appState: config.appState } 
          : config.credentials || {};
        const session = await fca.login(loginOptions);
        instance.session = session;
        instance.connected = true;
        instance.lastActive = new Date();
        
        this.emit('account_connected', { accountId: config.id, session });
        logger.info('MultiAccount: Account connected', { id: config.id });
      } catch (error) {
        logger.error('MultiAccount: Failed to connect account', { id: config.id, error });
        this.emit('account_connect_failed', { accountId: config.id, error });
      }
    }

    return instance;
  }

  /**
   * Remove an account
   */
  async removeAccount(accountId: string): Promise<void> {
    logger.info('MultiAccount: Removing account', { accountId });

    const instance = this.accounts.get(accountId);
    if (!instance) {
      throw new Error(`Account ${accountId} not found`);
    }

    try {
      await instance.fca.logout();
    } catch (error) {
      logger.error('MultiAccount: Error during account logout', { accountId, error });
    }

    this.accounts.delete(accountId);

    if (this.defaultAccountId === accountId) {
      this.defaultAccountId = null;
    }

    this.emit('account_removed', { accountId });
  }

  /**
   * Get an account instance
   */
  getAccount(accountId: string): AccountInstance | undefined {
    return this.accounts.get(accountId);
  }

  /**
   * Get all accounts
   */
  getAllAccounts(): AccountInstance[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Get connected accounts
   */
  getConnectedAccounts(): AccountInstance[] {
    return this.getAllAccounts().filter(acc => acc.connected);
  }

  /**
   * Set default account
   */
  setDefaultAccount(accountId: string): void {
    if (!this.accounts.has(accountId)) {
      throw new Error(`Account ${accountId} not found`);
    }
    this.defaultAccountId = accountId;
    logger.info('MultiAccount: Default account set', { accountId });
  }

  /**
   * Get default account
   */
  getDefaultAccount(): AccountInstance | undefined {
    if (this.defaultAccountId) {
      return this.accounts.get(this.defaultAccountId);
    }
    // Return first connected account if no default set
    return this.getConnectedAccounts()[0];
  }

  /**
   * Connect an account
   */
  async connectAccount(accountId: string): Promise<Session> {
    const instance = this.accounts.get(accountId);
    if (!instance) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (instance.connected) {
      return instance.session!;
    }

    logger.info('MultiAccount: Connecting account', { accountId });

    try {
      const session = await instance.fca.login();
      instance.session = session;
      instance.connected = true;
      instance.lastActive = new Date();
      
      this.emit('account_connected', { accountId, session });
      return session;
    } catch (error) {
      logger.error('MultiAccount: Failed to connect account', { accountId, error });
      this.emit('account_connect_failed', { accountId, error });
      throw error;
    }
  }

  /**
   * Disconnect an account
   */
  async disconnectAccount(accountId: string): Promise<void> {
    const instance = this.accounts.get(accountId);
    if (!instance) {
      throw new Error(`Account ${accountId} not found`);
    }

    logger.info('MultiAccount: Disconnecting account', { accountId });

    instance.fca.disconnect();
    instance.connected = false;
    instance.lastActive = new Date();

    this.emit('account_disconnected', { accountId });
  }

  /**
   * Reconnect an account
   */
  async reconnectAccount(accountId: string): Promise<Session> {
    const instance = this.accounts.get(accountId);
    if (!instance) {
      throw new Error(`Account ${accountId} not found`);
    }

    logger.info('MultiAccount: Reconnecting account', { accountId });

    instance.fca.disconnect();
    instance.connected = false;

    return this.connectAccount(accountId);
  }

  /**
   * Connect all accounts
   */
  async connectAllAccounts(): Promise<void> {
    logger.info('MultiAccount: Connecting all accounts');

    const promises = Array.from(this.accounts.keys()).map(accountId =>
      this.connectAccount(accountId).catch(error => {
        logger.error('MultiAccount: Failed to connect account', { accountId, error });
      })
    );

    await Promise.all(promises);
  }

  /**
   * Disconnect all accounts
   */
  async disconnectAllAccounts(): Promise<void> {
    logger.info('MultiAccount: Disconnecting all accounts');

    const promises = Array.from(this.accounts.keys()).map(accountId =>
      this.disconnectAccount(accountId).catch(error => {
        logger.error('MultiAccount: Failed to disconnect account', { accountId, error });
      })
    );

    await Promise.all(promises);
  }

  /**
   * Get account statistics
   */
  getStats(): {
    totalAccounts: number;
    connectedAccounts: number;
    disconnectedAccounts: number;
    defaultAccountId: string | null;
  } {
    const all = this.getAllAccounts();
    const connected = this.getConnectedAccounts();

    return {
      totalAccounts: all.length,
      connectedAccounts: connected.length,
      disconnectedAccounts: all.length - connected.length,
      defaultAccountId: this.defaultAccountId,
    };
  }

  /**
   * Setup event forwarding from FCA to MultiAccountManager
   */
  private setupEventForwarding(accountId: string, fca: PanindiganFCA): void {
    const events: string[] = [
      'message',
      'message_reaction',
      'typ',
      'read_receipt',
      'delivery_receipt',
      'presence',
      'thread_rename',
      'thread_color',
      'thread_emoji',
      'thread_image',
      'thread_nickname',
      'thread_add_participants',
      'thread_remove_participants',
      'thread_promote',
      'thread_demote',
      'thread_leave',
      'friend_request',
      'friend_accept',
      'friend_remove',
      'block',
      'unblock',
      'call',
      'story',
      'poll',
      'event',
      'connect',
      'disconnect',
      'error',
    ];

    for (const event of events) {
      (fca as any).on(event, (...args: unknown[]) => {
        const eventData = args[0];
        if (eventData && typeof eventData === 'object') {
          this.emit(event, { accountId, ...eventData });
        } else {
          this.emit(event, { accountId, data: eventData });
        }
      });
    }
  }

  /**
   * Broadcast a message to all connected accounts
   */
  async broadcastMessage(threadId: string, text: string): Promise<Map<string, unknown>> {
    const results = new Map<string, unknown>();
    const connected = this.getConnectedAccounts();

    for (const account of connected) {
      try {
        const result = await account.fca.sendText(threadId, text);
        results.set(account.id, { success: true, result });
      } catch (error) {
        results.set(account.id, { success: false, error });
      }
    }

    return results;
  }

  /**
   * Execute a function on all accounts
   */
  async executeOnAll<T>(
    fn: (account: AccountInstance) => Promise<T>
  ): Promise<Map<string, { success: boolean; result?: T; error?: unknown }>> {
    const results = new Map<string, { success: boolean; result?: T; error?: unknown }>();

    for (const account of this.getAllAccounts()) {
      try {
        const result = await fn(account);
        results.set(account.id, { success: true, result });
      } catch (error) {
        results.set(account.id, { success: false, error });
      }
    }

    return results;
  }

  /**
   * Cleanup all accounts
   */
  async cleanup(): Promise<void> {
    logger.info('MultiAccount: Cleaning up all accounts');

    const promises = Array.from(this.accounts.entries()).map(([id]) =>
      this.removeAccount(id).catch(error => {
        logger.error('MultiAccount: Error removing account during cleanup', { id, error });
      })
    );

    await Promise.all(promises);
    this.accounts.clear();
    this.defaultAccountId = null;
  }
}
