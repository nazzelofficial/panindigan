/**
 * Helper Utilities for Panindigan
 */

import { randomBytes } from 'crypto';

/**
 * Generate a random string of specified length
 */
export function generateRandomString(length: number = 16): string {
  return randomBytes(length).toString('hex').substring(0, length);
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a client ID for MQTT
 */
export function generateClientId(): string {
  return `mqtt-${generateRandomString(8)}`;
}

/**
 * Generate device ID
 */
export function generateDeviceId(): string {
  return `device-${generateRandomString(16)}`;
}

/**
 * Generate jazoest value from fb_dtsg
 */
export function generateJazoest(fbDtsg: string): string {
  let sum = 0;
  for (let i = 0; i < fbDtsg.length; i++) {
    sum += fbDtsg.charCodeAt(i);
  }
  return `2${sum}`;
}

/**
 * Parse cookie string to object
 */
export function parseCookieString(cookieStr: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieStr.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = rest.join('=');
    }
  });
  return cookies;
}

/**
 * Convert cookies object to string
 */
export function cookiesToString(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/**
 * Extract fb_dtsg from HTML
 */
export function extractFbDtsg(html: string): string | null {
  // Try multiple patterns for fb_dtsg
  const patterns = [
    /"DTSGInitialData",\[],{"token":"([^"]+)"/,
    /"dtsg":{"token":"([^"]+)"/,
    /name="fb_dtsg" value="([^"]+)"/,
    /"fb_dtsg":"([^"]+)"/,
    /DTSGInitData.*token":"([^"]+)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extract user ID from HTML or cookies
 */
export function extractUserId(html: string): string | null {
  const patterns = [
    /"USER_ID":"(\d+)"/,
    /"c_user":"(\d+)"/,
    /"current_user_id":"(\d+)"/,
    /"userID":"(\d+)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extract iris sequence ID from HTML
 */
export function extractIrisSeqId(html: string): string | null {
  const patterns = [
    /"irisSeqId":"(\d+)"/,
    /"seq_id":(\d+)/,
    /"lastSeqId":(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Format thread ID (handle both user and group IDs)
 */
export function formatThreadId(id: string): string {
  // If it's already in the correct format, return as-is
  if (id.startsWith('t_') || id.includes('.com/')) {
    return id;
  }
  // Otherwise, assume it's a valid thread ID
  return id;
}

/**
 * Check if ID is a group/thread ID
 */
export function isGroupId(id: string): boolean {
  // Group IDs typically start with a number and have specific patterns
  return /^\d{15,16}$/.test(id);
}

/**
 * Check if ID is a user ID
 */
export function isUserId(id: string): boolean {
  // User IDs are typically 15 digits
  return /^\d{15}$/.test(id);
}

/**
 * Generate a request ID
 */
export function generateRequestId(): string {
  return generateRandomString(8);
}

/**
 * Generate __req parameter
 */
export function generateReqParam(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  let num = Date.now();
  while (num > 0) {
    result = chars[num % 26] + result;
    num = Math.floor(num / 26);
  }
  return result;
}

/**
 * Sleep/delay utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  maxDelay: number = 30000
): Promise<T> {
  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries - 1) {
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 0.3 * delay;
        await sleep(delay + jitter);
        delay = Math.min(delay * 2, maxDelay);
      }
    }
  }

  throw lastError;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Deep merge objects
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        (target[key] as Record<string, unknown>) || {},
        source[key] as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else {
      result[key] = source[key] as T[Extract<keyof T, string>];
    }
  }
  
  return result;
}

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    zip: 'application/zip',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Parse URL parameters
 */
export function parseUrlParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const urlObj = new URL(url);
  urlObj.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/**
 * Build URL with query parameters
 */
export function buildUrl(baseUrl: string, params: Record<string, string>): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
}
