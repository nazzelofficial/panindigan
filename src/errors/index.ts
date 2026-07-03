/**
 * Typed Error Classes for Panindigan
 * Replace all generic Error throws with domain-specific typed errors.
 */

/** Base error for all Panindigan errors */
export class PanindiganError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly data?: unknown;

  constructor(
    message: string,
    code: string,
    statusCode: number = 0,
    retryable: boolean = false,
    data?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.data = data;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when login fails, session is invalid, or credentials are wrong */
export class AuthenticationError extends PanindiganError {
  constructor(message: string, data?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', 401, false, data);
  }
}

/** Thrown when Facebook requires a security checkpoint approval */
export class CheckpointError extends PanindiganError {
  readonly checkpointUrl: string;

  constructor(message: string, checkpointUrl: string, data?: unknown) {
    super(message, 'CHECKPOINT_ERROR', 401, false, data);
    this.checkpointUrl = checkpointUrl;
  }
}

/** Thrown when MQTT connection fails or drops */
export class MQTTError extends PanindiganError {
  constructor(message: string, retryable: boolean = true, data?: unknown) {
    super(message, 'MQTT_ERROR', 0, retryable, data);
  }
}

/** Thrown when the API returns 429 or the rate limiter rejects a request */
export class RateLimitError extends PanindiganError {
  readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number, data?: unknown) {
    super(message, 'RATE_LIMIT_ERROR', 429, true, data);
    this.retryAfter = retryAfter;
  }
}

/** Thrown for network failures (DNS, TCP reset, timeout) */
export class NetworkError extends PanindiganError {
  constructor(message: string, statusCode: number = 0, data?: unknown) {
    super(message, 'NETWORK_ERROR', statusCode, true, data);
  }
}

/** Thrown when a file upload fails */
export class UploadError extends PanindiganError {
  constructor(message: string, data?: unknown) {
    super(message, 'UPLOAD_ERROR', 0, false, data);
  }
}

/** Thrown when a message operation (send/edit/unsend/react) fails */
export class MessageError extends PanindiganError {
  constructor(message: string, retryable: boolean = false, data?: unknown) {
    super(message, 'MESSAGE_ERROR', 0, retryable, data);
  }
}

/** Thrown when a thread operation fails */
export class ThreadError extends PanindiganError {
  constructor(message: string, data?: unknown) {
    super(message, 'THREAD_ERROR', 0, false, data);
  }
}

/** Thrown when a user/friend operation fails */
export class UserError extends PanindiganError {
  constructor(message: string, data?: unknown) {
    super(message, 'USER_ERROR', 0, false, data);
  }
}

/** Thrown when a GraphQL query or mutation returns an error */
export class GraphQLError extends PanindiganError {
  constructor(message: string, statusCode: number = 0, data?: unknown, code: string = 'GRAPHQL_ERROR') {
    super(message, code, statusCode, false, data);
  }
}

/** Thrown when the session expires and cannot be refreshed */
export class SessionExpiredError extends PanindiganError {
  constructor(data?: unknown) {
    super('Session has expired. Please log in again.', 'SESSION_EXPIRED', 401, false, data);
  }
}

/** Thrown for 2FA / OTP requirement */
export class TwoFactorRequiredError extends PanindiganError {
  constructor(data?: unknown) {
    super('Two-factor authentication is required.', 'TWO_FACTOR_REQUIRED', 401, false, data);
  }
}

/** Thrown when a request times out */
export class TimeoutError extends PanindiganError {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`, 'TIMEOUT_ERROR', 0, true);
  }
}

/** Thrown when an operation is not supported (e.g. no stable Facebook endpoint exists for it) */
export class UnsupportedOperationError extends PanindiganError {
  constructor(operation: string) {
    super(
      `${operation} is not supported — no stable Facebook endpoint is available for this operation.`,
      'UNSUPPORTED_OPERATION',
      0,
      false
    );
  }
}
