/**
 * Authentication and Session Types
 */

export interface Cookie {
  key: string;
  value: string;
  domain: string;
  path: string;
  hostOnly?: boolean;
  creation?: string;
  lastAccessed?: string;
}

export type CookieFormat = 'c3c-fbstate' | 'fca-unofficial' | 'facebook-chat-api' | 'editthiscookie' | 'cookie-editor' | 'j2team' | 'browser' | 'raw';

export interface AppState {
  cookies: Cookie[];
  fbDtsg?: string;
  userId?: string;
  token?: string;
  region?: string;
  deviceId?: string;
  irisSeqId?: string;
  [key: string]: unknown;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface Session {
  userId: string;
  fbDtsg: string;
  cookies: Cookie[];
  token?: string;
  region: string;
  deviceId: string;
  clientId: string;
  irisSeqId: string;
  loggedIn: boolean;
  createdAt: Date;
  lastActive: Date;
}

export interface TwoFactorAuth {
  type: 'totp' | 'sms' | 'email';
  code: string;
  rememberDevice?: boolean;
}

export interface CheckpointData {
  url: string;
  securityCode?: string;
  method?: 'email' | 'sms' | 'authenticator';
  devices?: Array<{
    name: string;
    location: string;
    time: string;
  }>;
}

export interface LoginOptions {
  appState?: AppState | Cookie[] | string;
  credentials?: Credentials;
  twoFactor?: TwoFactorAuth;
  forceLogin?: boolean;
  logLevel?: LogLevel;
  userAgent?: string;
  proxy?: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  sessionPath?: string;
}

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'verbose';

export interface AuthError extends Error {
  code: string;
  type: 'login' | 'checkpoint' | '2fa' | 'captcha' | 'session' | 'network';
  data?: unknown;
}

export interface SessionValidationResult {
  valid: boolean;
  expired: boolean;
  userId?: string;
  error?: string;
}
