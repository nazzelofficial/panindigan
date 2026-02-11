/**
 * GraphQL Client for Facebook API
 */

import { logger } from '../utils/Logger.js';
import { FACEBOOK_WEBGRAPHQL_URL, FACEBOOK_BATCH_URL, ERROR_CODES } from '../utils/Constants.js';
import { generateReqParam, generateRandomString } from '../utils/Helpers.js';
import type { RequestHandler } from './RequestHandler.js';
import type { 
  GraphQLResponse, 
  BatchRequest, 
  BatchResponse,
  FacebookFormData 
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

    const response = await this.requestHandler.post(FACEBOOK_WEBGRAPHQL_URL, this.encodeFormData(payload));
    
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
    } catch (e) {
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
   * Make a batch of GraphQL queries
   */
  async batchQuery(batch: BatchRequest): Promise<BatchResponse> {
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

    // Add batch queries
    batch.queries.forEach((q, index) => {
      const queryKey = `q${index}`;
      payload[queryKey] = JSON.stringify({
        name: q.name,
        variables: JSON.stringify(q.variables || {}),
      });
    });

    logger.debug(`GraphQL Batch: ${batch.queries.map(q => q.name).join(', ')}`);

    const response = await this.requestHandler.post(FACEBOOK_BATCH_URL, this.encodeFormData(payload));
    
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
    } catch (e) {
      throw this.createGraphQLError(
        ERROR_CODES.GRAPHQL_ERROR,
        'Failed to parse batch response',
        0,
        { response: text.substring(0, 500) }
      );
    }

    // Parse responses
    const responses: BatchResponse['responses'] = batch.queries.map((q, index) => {
      const key = `q${index}`;
      const responseData = data[key] as GraphQLResponse<unknown>;
      
      return {
        name: q.name,
        data: responseData?.data,
        error: responseData?.errors?.[0],
      };
    });

    return { responses };
  }

  /**
   * Make a GraphQL mutation
   */
  async mutation<T = unknown>(
    mutationName: string,
    variables: Record<string, unknown> = {},
    mutationDoc?: string
  ): Promise<T> {
    return this.query<T>(mutationName, variables, mutationDoc);
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
   * Encode form data for POST request
   */
  private encodeFormData(data: Record<string, string>): string {
    return Object.entries(data)
      .map(([key, value]) => {
        const encodedKey = encodeURIComponent(key);
        const encodedValue = encodeURIComponent(value);
        return `${encodedKey}=${encodedValue}`;
      })
      .join('&');
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
    // This is a simplified version - Facebook's __dyn is complex
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
    const error = new Error(message) as Error & { code: string; statusCode: number; data?: unknown };
    error.code = code;
    error.statusCode = statusCode;
    error.data = data;
    return error;
  }
}