/**
 * API and GraphQL Types
 */

export interface GraphQLRequest {
  method: 'POST' | 'GET';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
}

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: GraphQLError[];
  extensions?: Record<string, unknown>;
}

export interface GraphQLError {
  message: string;
  code?: string;
  path?: string[];
  extensions?: Record<string, unknown>;
}

export interface BatchRequest {
  queries: Array<{
    name: string;
    query: string;
    variables?: Record<string, unknown>;
  }>;
}

export interface BatchResponse {
  responses: Array<{
    name: string;
    data?: unknown;
    error?: GraphQLError;
  }>;
}

export interface APIError extends Error {
  code: string;
  statusCode?: number;
  endpoint?: string;
  retryable: boolean;
  data?: unknown;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
  windowMs: number;
}

export interface RequestOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

export interface FacebookAPIEndpoints {
  base: string;
  graphql: string;
  mqtt: string;
  upload: string;
  login: string;
}

export interface FacebookFormData {
  fb_dtsg: string;
  jazoest: string;
  __user: string;
  __a: string;
  __req: string;
  __hs: string;
  dpr: string;
  __ccg: string;
  __rev: string;
  __s: string;
  __hsi: string;
  __dyn: string;
  __csr: string;
  __comet_req: string;
  lsd?: string;
}
