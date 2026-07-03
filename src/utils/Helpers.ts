/**
 * Helper Utilities for Panindigan
 */

import { randomBytes, randomUUID } from 'crypto';

let _clientMutationId = 0;

/**
 * Generate a random string of specified length
 */
export function generateRandomString(length: number = 16): string {
  return randomBytes(length).toString('hex').substring(0, length);
}

/**
 * Generate a UUID v4 using Node.js built-in CSPRNG.
 */
export function generateUUID(): string {
  return randomUUID();
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
 * Generate a random MQTT session identifier ("s" / "mqtt_sid" field and
 * the broker URL's "sid" param).
 *
 * Facebook's Messenger MQTT broker expects a random per-connection integer
 * here — it is NOT the Iris sync sequence id. Using a random 53-bit-safe
 * integer mirrors what the real Messenger Web client generates on every
 * fresh MQTT connect.
 */
export function generateMqttSessionId(): number {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
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
 * Generate a real Messenger offline threading ID.
 * Upper 42 bits = current time in ms, lower 22 bits = random.
 * This matches the format Facebook's own clients generate.
 * Prefer EntropyPool.nextOfflineId() in hot paths — it uses CSPRNG pre-fill.
 */
export function generateOfflineThreadingId(): string {
  const now = BigInt(Date.now());
  const random = BigInt(randomBytes(3).readUIntBE(0, 3) & 0x3FFFFF);
  return ((now << 22n) | random).toString();
}

/**
 * Generate an incrementing client mutation ID
 */
export function generateClientMutationId(): number {
  return ++_clientMutationId;
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
  const patterns = [
    /"DTSGInitialData",\[],{"token":"([^"]+)"/,
    /"dtsg":{"token":"([^"]+)"/,
    /name="fb_dtsg" value="([^"]+)"/,
    /"fb_dtsg":"([^"]+)"/,
    /DTSGInitData.*token":"([^"]+)"/,
    /"DTSGInitData",\[\],\{"token":"([^"]+)"/,
    /"token":"([^"]+)","expires_at"/,
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
    /"iris_seq_id":(\d+)/,
    /"seqId":(\d+)/,
    /"sequenceId":(\d+)/,
    /seq_id=(\d+)/,
    /iris_seq_id=(\d+)/,
    /"iris_seq_id":"(\d+)"/,
    /"seq_id":"(\d+)"/,
    /irisSeqId=(\d+)/,
    /seqId=(\d+)/,
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
  if (id.startsWith('t_') || id.includes('.com/')) {
    return id;
  }
  return id;
}

/**
 * Check if ID looks like a group thread ID (17+ digits)
 */
export function isGroupId(id: string): boolean {
  return /^\d{17,}$/.test(id);
}

/**
 * Check if ID looks like a user ID (numeric, reasonable length)
 */
export function isUserId(id: string): boolean {
  return /^\d{8,20}$/.test(id);
}

/**
 * Generate a request ID
 */
export function generateRequestId(): string {
  return generateRandomString(8);
}

/**
 * Generate __req parameter — base-26 representation of (timestamp + random jitter)
 * so two rapid calls within the same millisecond still produce different values.
 */
export function generateReqParam(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  let num = Date.now() + Math.floor(Math.random() * 9999);
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

/**
 * Strip Facebook's for(;;); JSON prefix and parse
 */
export function parseFacebookResponse<T>(text: string): T {
  const jsonStr = text.replace(/^for\s*\(\s*;\s*;\s*\)\s*;\s*/, '');
  return JSON.parse(jsonStr) as T;
}
