/**
 * GraphQL Client for Facebook API
 */

import { logger } from '../utils/Logger.js';
import {
  FACEBOOK_WEBGRAPHQL_URL,
  FACEBOOK_BATCH_URL,
  ERROR_CODES,
} from '../utils/Constants.js';
import { generateReqParam, generateRandomString } from '../utils/Helpers.js';
import type { RequestHandler } from './RequestHandler.js';
import type {
  GraphQLResponse,
  BatchRequest,
  BatchResponse,
  FacebookFormData,
} from '../types/index.js';

export class GraphQLClient {
  private requestHandler: RequestHandler;
  private fbDtsg: string = '';
  private userId: string = '';
  private reqCounter: number = 0;

  constructor(requestHandler: RequestHandler) {
    this.requestHandler = requestHandler;
  }

  /**
   * Set authentication tokens
   */
  setAuthTokens(fbDtsg: string, userId: string): void {
    this.fbDtsg = fbDtsg;
    this.userId = userId;
  }

  /**
   * Get request handler
   */
  getRequestHandler(): RequestHandler {
    return this.requestHandler;
  }

  /**
   * Build the standard base parameters used in all Facebook form requests.
   */
  buildBaseParams(): Record<string, string> {
    return {
      fb_dtsg: this.fbDtsg,
      __a: '1',
      __user: this.userId,
      __req: generateReqParam(),
      jazoest: this.generateJazoest(),
    };
  }

  /**
   * POST a form-encoded request to any Facebook endpoint.
   * Handles the for(;;); prefix stripping automatically.
   */
  async formPost<T = unknown>(
    url: string,
    params: Record<string, string>
  ): Promise<T> {
    const payload: Record<string, string> = {
      ...this.buildBaseParams(),
      ...params,
    };

    logger.debug(`formPost → ${url}`, Object.keys(params));

    const response = await this.requestHandler.post(
      url,
      this.encodeFormData(payload)
    );

    const text = await response.text();
    const jsonStr = text.replace(/^for\s*\(\s*;\s*;\s*\)\s*;\s*/, '');

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      throw this.createGraphQLError(
        ERROR_CODES.API_ERROR,
        `Failed to parse response from ${url}: ${text.substring(0, 200)}`,
        0
      );
    }

    if (data.error) {
      throw this.createGraphQLError(
        ERROR_CODES.API_ERROR,
        String(
          (data as Record<string, unknown>).errorDescription ||
            (data as Record<string, unknown>).errorSummary ||
            data.error
        ),
        Number(data.error)
      );
    }

    return data as T;
  }

  /**
   * Make a single GraphQL query
   */
  async query<T = unknown>(
    queryName: string,
    variables: Record<string, unknown> = {},
    queryDoc?: string
  ): Promise<T> {
    const formData = this.buildFormData();

    const payload: Record<string, string> = {
      av: this.userId,
      __user: this.userId,
      __a: '1',
      __req: generateReqParam(),
      dpr: '1',
      __ccg: 'EXCELLENT',
      __rev: '100',
      __s: generateRandomString(6),
      __hsi: generateRandomString(12),
      __dyn: this.generateDyn(),
      __csr: '',
      __comet_req: '0',
      fb_dtsg: this.fbDtsg,
      jazoest: this.generateJazoest(),
      lsd: generateRandomString(12),
      ...formData,
    };

    // Add the query
    const queryKey = `q${this.reqCounter++}`;
    payload[queryKey] = JSON.stringify({
      name: queryName,
      variables: JSON.stringify(variables),
      ...(queryDoc && { doc_id: queryDoc }),
    });

    logger.debug(`GraphQL Query: ${queryName}`, variables);

    const response = await this.requestHandler.post(
      FACEBOOK_WEBGRAPHQL_URL,
      this.encodeFormData(payload)
    );

    if (!response.ok) {
      throw this.createGraphQLError(
        ERROR_CODES.GRAPHQL_ERROR,
        `GraphQL request failed: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    const text = await response.text();

    // Facebook returns JSON with a for-loop prefix that needs to be stripped
    const jsonStr = text.replace(/^for\s*\(\s*;\s*;\s*\)\s*;\s*/, '');

    let data: GraphQLResponse<T>;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      throw this.createGraphQLError(
        ERROR_CODES.GRAPHQL_ERROR,
        'Failed to parse GraphQL response',
        0,
        { response: text.substring(0, 500) }
      );
    }

    if (data.errors && data.errors.length > 0) {
      const error = data.errors[0];
      throw this.createGraphQLError(
        error.code || ERROR_CODES.GRAPHQL_ERROR,
        error.message,
        0,
        { errors: data.errors }
      );
    }

    if (!data.data) {
      throw this.createGraphQLError(
        ERROR_CODES.GRAPHQL_ERROR,
        'No data in GraphQL response',
        0,
        { response: data }
      );
    }

    return data.data;
  }

  /**
   * Make a batch of GraphQL queries (optimized)
   * Automatically splits large batches into smaller chunks for better performance
   */
  async batchQuery(batch: BatchRequest): Promise<BatchResponse> {
    const MAX_BATCH_SIZE = 50; // Facebook's recommended batch size

    if (batch.queries.length <= MAX_BATCH_SIZE) {
      return this.executeBatch(batch);
    }

    // Split into multiple batches if too large
    const chunks: BatchRequest[] = [];
    for (let i = 0; i < batch.queries.length; i += MAX_BATCH_SIZE) {
      chunks.push({
        queries: batch.queries.slice(i, i + MAX_BATCH_SIZE),
      });
    }

    logger.debug(
      `Splitting ${batch.queries.length} queries into ${chunks.length} batches`
    );

    // Execute all batches in parallel
    const results = await Promise.all(
      chunks.map((chunk) => this.executeBatch(chunk))
    );

    // Combine results
    const allResponses: BatchResponse['responses'] = [];
    for (const result of results) {
      allResponses.push(...result.responses);
    }

    return { responses: allResponses };
  }

  /**
   * Execute a single batch query
   */
  private async executeBatch(batch: BatchRequest): Promise<BatchResponse> {
    const formData = this.buildFormData();

    const payload: Record<string, string> = {
      av: this.userId,
      __user: this.userId,
      __a: '1',
      __req: generateReqParam(),
      dpr: '1',
      __ccg: 'EXCELLENT',
      __rev: '100',
      __s: generateRandomString(6),
      __hsi: generateRandomString(12),
      __dyn: this.generateDyn(),
      __csr: '',
      __comet_req: '7',
      fb_dtsg: this.fbDtsg,
      jazoest: this.generateJazoest(),
      lsd: generateRandomString(12),
      ...formData,
    };

    // Add batch queries with optimized indexing
    batch.queries.forEach((q, index) => {
      const queryKey = `q${index}`;
      payload[queryKey] = JSON.stringify({
        name: q.name,
        variables: JSON.stringify(q.variables || {}),
      });
    });

    logger.debug(
      `GraphQL Batch: ${batch.queries.map((q) => q.name).join(', ')}`
    );

    const response = await this.requestHandler.post(
      FACEBOOK_BATCH_URL,
      this.encodeFormData(payload)
    );

    if (!response.ok) {
      throw this.createGraphQLError(
        ERROR_CODES.GRAPHQL_ERROR,
        `Batch request failed: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    const text = await response.text();
    const jsonStr = text.replace(/^for\s*\(\s*;\s*;\s*\)\s*;\s*/, '');

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      throw this.createGraphQLError(
        ERROR_CODES.GRAPHQL_ERROR,
        'Failed to parse batch response',
        0,
        { response: text.substring(0, 500) }
      );
    }

    // Parse responses with error handling per query
    const responses: BatchResponse['responses'] = batch.queries.map(
      (q, index) => {
        const key = `q${index}`;
        const responseData = data[key] as GraphQLResponse<unknown>;

        if (!responseData) {
          return {
            name: q.name,
            data: null,
            error: { message: `No response for query ${q.name}` },
          };
        }

        return {
          name: q.name,
          data: responseData?.data,
          error: responseData?.errors?.[0],
        };
      }
    );

    return { responses };
  }

  /**
   * Make a GraphQL mutation
   * Uses /webgraphql/query endpoint for personal Facebook accounts (same as queries)
   */
  async mutation<T = unknown>(
    mutationName: string,
    variables: Record<string, unknown> = {},
    mutationDoc?: string
  ): Promise<T> {
    return this.query<T>(mutationName, variables, mutationDoc);
  }

  /**
   * Encode form data for POST request
   */
  encodeFormData(data: Record<string, string>): string {
    return Object.entries(data)
      .map(([key, value]) => {
        const encodedKey = encodeURIComponent(key);
        const encodedValue = encodeURIComponent(value);
        return `${encodedKey}=${encodedValue}`;
      })
      .join('&');
  }

  /**
   * Build base form data
   */
  private buildFormData(): Partial<FacebookFormData> {
    return {
      __a: '1',
      __req: generateReqParam(),
      dpr: '1',
      __ccg: 'EXCELLENT',
      __rev: '100',
    };
  }

  /**
   * Generate jazoest value
   */
  private generateJazoest(): string {
    let sum = 0;
    for (let i = 0; i < this.fbDtsg.length; i++) {
      sum += this.fbDtsg.charCodeAt(i);
    }
    return `2${sum}`;
  }

  /**
   * Generate __dyn parameter
   */
  private generateDyn(): string {
    return '7xeUmFoG3Ejy4QjG1mEhy4Q2qewKewSwMxu0SU1szU6U6O12wOx62G1uwJwpUe8hwaQ0z8cE7S0jq0Lk2K0vwbS1Lw9C0le0L83hw6aw8O0jq0wqo4C2m0jq78cE1JwqE2y0gq0N5o4aE3C0Do1swGwQwo8a8462xa';
  }

  /**
   * Create a GraphQL error
   */
  private createGraphQLError(
    code: string,
    message: string,
    statusCode: number = 0,
    data?: unknown
  ): Error {
    const error = new Error(message) as Error & {
      code: string;
      statusCode: number;
      data?: unknown;
    };
    error.code = code;
    error.statusCode = statusCode;
    error.data = data;
    return error;
  }
}
