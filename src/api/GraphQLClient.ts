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
import { GraphQLError, SessionExpiredError } from '../errors/index.js';
import type { RequestHandler } from './RequestHandler.js';
import type { CheckpointGuard } from '../security/CheckpointGuard.js';
import type {
  GraphQLResponse,
  BatchRequest,
  BatchResponse,
  FacebookFormData,
} from '../types/index.js';

/**
 * Callback that returns the latest auth tokens from the active session.
 * Set via setTokenProvider() so GraphQLClient always uses fresh token values
 * rather than potentially stale copies set at login time.
 */
type TokenProvider = () => {
  fbDtsg: string;
  userId: string;
  lsd: string;
};

export class GraphQLClient {
  private requestHandler: RequestHandler;
  private fbDtsg: string = '';
  private userId: string = '';
  private lsd: string = '';
  private checkpointGuard?: CheckpointGuard;
  private tokenProvider?: TokenProvider;

  /**
   * Real Facebook build/revision fingerprint (`__spin_r`/`__spin_b`/`__spin_t`
   * and the haste session id `__hsi`), extracted from live page HTML by
   * Authenticator/SessionManager. Comet-era ajax/GraphQL endpoints validate
   * these against the session — a hardcoded/fake value (e.g. a static
   * `__rev: '100'`) is rejected with "Please try closing and re-opening your
   * browser window." Until a real value has been extracted, these stay
   * empty rather than falling back to a fabricated default.
   */
  private spinR: string = '';
  private spinB: string = '';
  private spinT: string = '';
  private hsi: string = '';

  /**
   * Facebook's simple numeric page revision (`__rev`), extracted via
   * `extractRevision()` (a plain `'revision":'` match). This is a
   * different, much more commonly-available value than the Comet
   * `__spin_r`/`__spin_b`/`__spin_t`/`__hsi` bundle above. Real FCA
   * implementations (fca-unofficial, ws3-fca) send this on every
   * legacy form-encoded request (e.g. `/chat/user_info/`) independent of
   * whether the full Comet fingerprint was ever obtained. Never fabricated;
   * stays empty until real HTML supplies it.
   */
  private revision: string = '';

  constructor(requestHandler: RequestHandler) {
    this.requestHandler = requestHandler;
  }

  /**
   * Set the real, plain numeric Facebook page revision extracted via
   * extractRevision(). Independent from setRevisionInfo()'s Comet
   * spin/hsi bundle — see field docs on `revision`.
   */
  setRevision(revision: string): void {
    this.revision = revision;
  }

  /**
   * Set the real Facebook build/revision fingerprint extracted from page
   * HTML. Must never be called with fabricated values — see field docs.
   */
  setRevisionInfo(info: { spinR: string; spinB: string; spinT: string; hsi: string }): void {
    this.spinR = info.spinR;
    this.spinB = info.spinB;
    this.spinT = info.spinT;
    this.hsi = info.hsi;
  }

  /** Whether a real revision fingerprint has been extracted yet. */
  hasRevisionInfo(): boolean {
    return !!(this.spinR && this.spinB && this.spinT && this.hsi);
  }

  /**
   * Set authentication tokens.
   *
   * `lsd` is optional here for backward compatibility with existing callers
   * that only pass fbDtsg/userId, but must be provided (the real value
   * extracted from Facebook's HTML — see Authenticator/SessionManager) for
   * GraphQL/Comet ajax requests to succeed. Without it, `query()`/
   * `executeBatch()` used to send a fabricated random string and
   * `formPost()` sent no `lsd` at all — both of which Facebook rejects with
   * "Please try closing and re-opening your browser window."
   */
  setAuthTokens(fbDtsg: string, userId: string, lsd?: string): void {
    this.fbDtsg = fbDtsg;
    this.userId = userId;
    if (lsd) {
      this.lsd = lsd;
    }
  }

  /**
   * Register a token provider callback. When set, GraphQLClient calls this
   * before every request to pull the latest `fbDtsg`, `userId`, and `lsd`
   * values from the active session. This ensures stale token copies from
   * login time do not persist across a session refresh cycle.
   *
   * Wire this up in Authenticator's constructor by passing a function that
   * reads directly from SessionManager.getSession().
   */
  setTokenProvider(fn: TokenProvider): void {
    this.tokenProvider = fn;
  }

  /**
   * Get request handler
   */
  getRequestHandler(): RequestHandler {
    return this.requestHandler;
  }

  /**
   * Attach a CheckpointGuard so response bodies are screened for checkpoint signals.
   * Also wires the guard into the underlying RequestHandler for URL-level screening.
   */
  setCheckpointGuard(guard: CheckpointGuard): void {
    this.checkpointGuard = guard;
    this.requestHandler.setCheckpointGuard(guard);
  }

  /**
   * Sync auth tokens from the registered TokenProvider, if one was set.
   * Only overwrites a stored value when the provider returns a non-empty
   * string, so a partially-populated session does not clear a valid token.
   */
  private syncTokens(): void {
    if (!this.tokenProvider) return;
    const t = this.tokenProvider();
    if (t.fbDtsg) this.fbDtsg = t.fbDtsg;
    if (t.userId) this.userId = t.userId;
    if (t.lsd) this.lsd = t.lsd;
  }

  /**
   * Check a parsed Facebook response payload for known session-expiry signals
   * and throw SessionExpiredError when found. Prevents callers from seeing a
   * confusing generic GraphQLError when the real cause is an expired session.
   *
   * Known signals (all confirmed from real Facebook API traffic):
   *   - `error: 1357001`       — Facebook's canonical "not logged in" error code
   *   - `login_required: true`  — explicit flag on some endpoints
   *   - `errorDescription` containing "must be logged in" or "session expired"
   *   - Nested `errors` array entry whose `code` is 1357001
   */
  private detectSessionExpiry(
    data: Record<string, unknown>,
    context: { url: string; operation?: string; requestId?: string }
  ): void {
    const errCode = data.error as number | string | undefined;
    const errDesc = (data.errorDescription ?? data.error_description) as string | undefined;
    const loginRequired = data.login_required as boolean | undefined;
    const errors = data.errors as Array<{ code?: string | number; message?: string }> | undefined;

    const isExpired =
      loginRequired === true ||
      errCode === 1357001 ||
      errCode === '1357001' ||
      (typeof data.errorCode === 'number' && data.errorCode === 1357001) ||
      (typeof errDesc === 'string' && (
        errDesc.toLowerCase().includes('must be logged in') ||
        (errDesc.toLowerCase().includes('session') && errDesc.toLowerCase().includes('expired'))
      )) ||
      (Array.isArray(errors) && errors.some(
        (e) => e.code === 1357001 || e.code === '1357001'
      ));

    if (isExpired) {
      logger.warn('Session expiry detected in API response', { ...context });
      throw new SessionExpiredError({ ...context, data });
    }
  }

  /**
   * Build the standard base parameters used in all Facebook form requests.
   */
  buildBaseParams(): Record<string, string> {
    const params: Record<string, string> = {
      fb_dtsg: this.fbDtsg,
      __a: '1',
      __user: this.userId,
      __req: generateReqParam(),
      jazoest: this.generateJazoest(),
    };

    // `lsd` is only attached once a real value has been extracted. Real FCA
    // implementations (fca-unofficial, ws3-fca) never send an empty/absent
    // lsd on legacy form endpoints — an explicit empty-string value is not
    // the same as "field omitted" and some Facebook endpoints reject a
    // present-but-empty token the same way they reject a fabricated one.
    if (this.lsd) {
      params.lsd = this.lsd;
    }

    // `__rev` uses the plain numeric page revision (extractRevision(),
    // matching fca-unofficial/ws3-fca's `makeDefaults()`), independent of
    // whether the full Comet spin/hsi fingerprint below was ever obtained.
    // This is why formPost()-based calls like getUserInfo (/chat/user_info/)
    // no longer depend on __spin_r/__spin_b/__spin_t/__hsi at all — real
    // libraries never require that bundle for these legacy endpoints.
    if (this.revision) {
      params.__rev = this.revision;
    }

    // Only attach the full Comet build/revision fingerprint once it has
    // actually been extracted from live HTML (see setRevisionInfo docs) —
    // never a fabricated placeholder. Used by the full api/graphql/
    // query()/executeBatch() calls below, not by formPost().
    if (this.hasRevisionInfo()) {
      params.__spin_r = this.spinR;
      params.__spin_b = this.spinB;
      params.__spin_t = this.spinT;
      params.__hsi = this.hsi;
      if (!params.__rev) {
        params.__rev = this.spinR;
      }
    }

    return params;
  }

  /**
   * POST a form-encoded request to any Facebook endpoint.
   * Handles the for(;;); prefix stripping automatically.
   * Syncs tokens from session before sending.
   */
  async formPost<T = unknown>(
    url: string,
    params: Record<string, string>
  ): Promise<T> {
    this.syncTokens();

    const payload: Record<string, string> = {
      ...this.buildBaseParams(),
      ...params,
    };

    logger.debug(`formPost → ${url}`, Object.keys(params));

    const response = await this.requestHandler.post(
      url,
      this.encodeFormData(payload)
    );

    const requestId = response.headers.get('x-fb-request-id') ?? undefined;
    const text = await response.text();

    // Screen body for checkpoint signals before parsing
    this.checkpointGuard?.inspectBody(text, url);

    const jsonStr = text.replace(/^for\s*\(\s*;\s*;\s*\)\s*;\s*/, '');

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      logger.error('formPost: unparseable response', {
        url,
        httpStatus: response.status,
        requestId,
        body: text.substring(0, 500),
      });
      throw this.createGraphQLError(
        ERROR_CODES.API_ERROR,
        `Failed to parse response from ${url}: ${text.substring(0, 200)}`,
        response.status
      );
    }

    // Detect session expiry before surfacing as a generic API error
    this.detectSessionExpiry(data, { url, requestId });

    if (data.error) {
      const errMsg = String(
        data.errorDescription || data.errorSummary || data.error
      );
      logger.error('formPost: Facebook error in response', {
        url,
        httpStatus: response.status,
        requestId,
        error: data.error,
        errorDescription: data.errorDescription,
        errorSummary: data.errorSummary,
      });
      throw this.createGraphQLError(
        ERROR_CODES.API_ERROR,
        errMsg,
        Number(data.error)
      );
    }

    return data as T;
  }

  /**
   * Make a single GraphQL query against /api/graphql/
   */
  async query<T = unknown>(
    queryName: string,
    variables: Record<string, unknown> = {},
    queryDoc?: string
  ): Promise<T> {
    this.syncTokens();

    if (!this.hasRevisionInfo()) {
      throw this.createGraphQLError(
        ERROR_CODES.GRAPHQL_ERROR,
        'Cannot issue GraphQL query: real Facebook __spin_r/__spin_b/__spin_t/__hsi have not been extracted yet. ' +
          'This requires a successful homepage fetch during login/session refresh — retry after login completes.',
        0
      );
    }

    // Built from buildFormData() first, then Comet-specific fields override
    // on top so extracted fingerprint values like __spin_r are never
    // clobbered by stale base defaults.
    const payload: Record<string, string> = {
      ...this.buildFormData(),
      av: this.userId,
      __user: this.userId,
      __req: generateReqParam(),
      // __rev: prefer the plain page revision; fall back to __spin_r
      // (they are the same value in practice, but __rev should be the
      // dedicated plain numeric revision, not the spin fingerprint).
      __rev: this.revision || this.spinR,
      __spin_r: this.spinR,
      __spin_b: this.spinB,
      __spin_t: this.spinT,
      __s: generateRandomString(6),
      __hsi: this.hsi,
      __dyn: this.generateDyn(),
      __csr: '',
      __comet_req: '0',
      fb_dtsg: this.fbDtsg,
      jazoest: this.generateJazoest(),
      lsd: this.lsd,
      fb_api_req_friendly_name: queryName,
    };

    // Add the query (key is always q0 for a single-query call)
    payload['q0'] = JSON.stringify({
      name: queryName,
      variables: JSON.stringify(variables),
      ...(queryDoc && { doc_id: queryDoc }),
    });

    logger.debug(`GraphQL Query: ${queryName}`, variables);

    const response = await this.requestHandler.post(
      FACEBOOK_WEBGRAPHQL_URL,
      this.encodeFormData(payload)
    );

    const requestId = response.headers.get('x-fb-request-id') ?? undefined;

    if (!response.ok) {
      logger.error('GraphQL query: non-2xx response', {
        operation: queryName,
        url: FACEBOOK_WEBGRAPHQL_URL,
        httpStatus: response.status,
        requestId,
      });
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
      logger.error('GraphQL query: failed to parse response', {
        operation: queryName,
        url: FACEBOOK_WEBGRAPHQL_URL,
        httpStatus: response.status,
        requestId,
        body: text.substring(0, 500),
      });
      throw this.createGraphQLError(
        ERROR_CODES.GRAPHQL_ERROR,
        'Failed to parse GraphQL response',
        0,
        { response: text.substring(0, 500) }
      );
    }

    // Detect session expiry before surfacing as a generic GraphQL error
    this.detectSessionExpiry(
      data as unknown as Record<string, unknown>,
      { url: FACEBOOK_WEBGRAPHQL_URL, operation: queryName, requestId }
    );

    if (data.errors && data.errors.length > 0) {
      const error = data.errors[0];
      logger.error('GraphQL query: error in response', {
        operation: queryName,
        url: FACEBOOK_WEBGRAPHQL_URL,
        httpStatus: response.status,
        requestId,
        errors: data.errors,
      });
      throw this.createGraphQLError(
        error.code || ERROR_CODES.GRAPHQL_ERROR,
        error.message,
        0,
        { errors: data.errors }
      );
    }

    if (!data.data) {
      logger.error('GraphQL query: empty data in response', {
        operation: queryName,
        url: FACEBOOK_WEBGRAPHQL_URL,
        httpStatus: response.status,
        requestId,
        body: text.substring(0, 500),
      });
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
   * Make a batch of GraphQL queries (optimized).
   * Automatically splits large batches into smaller chunks.
   */
  async batchQuery(batch: BatchRequest): Promise<BatchResponse> {
    const MAX_BATCH_SIZE = 50;

    if (batch.queries.length <= MAX_BATCH_SIZE) {
      return this.executeBatch(batch);
    }

    const chunks: BatchRequest[] = [];
    for (let i = 0; i < batch.queries.length; i += MAX_BATCH_SIZE) {
      chunks.push({
        queries: batch.queries.slice(i, i + MAX_BATCH_SIZE),
      });
    }

    logger.debug(
      `Splitting ${batch.queries.length} queries into ${chunks.length} batches`
    );

    const results = await Promise.all(
      chunks.map((chunk) => this.executeBatch(chunk))
    );

    const allResponses: BatchResponse['responses'] = [];
    for (const result of results) {
      allResponses.push(...result.responses);
    }

    return { responses: allResponses };
  }

  /**
   * Execute a single batch of GraphQL queries against /api/graphqlbatch/
   */
  private async executeBatch(batch: BatchRequest): Promise<BatchResponse> {
    this.syncTokens();

    if (!this.hasRevisionInfo()) {
      throw this.createGraphQLError(
        ERROR_CODES.GRAPHQL_ERROR,
        'Cannot issue GraphQL batch query: real Facebook __spin_r/__spin_b/__spin_t/__hsi have not been extracted yet. ' +
          'This requires a successful homepage fetch during login/session refresh — retry after login completes.',
        0
      );
    }

    // buildFormData() spreads first so Comet-specific fields always win,
    // never get clobbered by a stale base default.
    const payload: Record<string, string> = {
      ...this.buildFormData(),
      av: this.userId,
      __user: this.userId,
      __req: generateReqParam(),
      __rev: this.revision || this.spinR,
      __spin_r: this.spinR,
      __spin_b: this.spinB,
      __spin_t: this.spinT,
      __s: generateRandomString(6),
      __hsi: this.hsi,
      __dyn: this.generateDyn(),
      __csr: '',
      __comet_req: '7',
      fb_dtsg: this.fbDtsg,
      jazoest: this.generateJazoest(),
      lsd: this.lsd,
    };

    batch.queries.forEach((q, index) => {
      payload[`q${index}`] = JSON.stringify({
        name: q.name,
        variables: JSON.stringify(q.variables || {}),
      });
    });

    const operationNames = batch.queries.map((q) => q.name).join(', ');
    logger.debug(`GraphQL Batch: ${operationNames}`);

    const response = await this.requestHandler.post(
      FACEBOOK_BATCH_URL,
      this.encodeFormData(payload)
    );

    const requestId = response.headers.get('x-fb-request-id') ?? undefined;

    if (!response.ok) {
      logger.error('GraphQL batch: non-2xx response', {
        operations: operationNames,
        url: FACEBOOK_BATCH_URL,
        httpStatus: response.status,
        requestId,
      });
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
      logger.error('GraphQL batch: failed to parse response', {
        operations: operationNames,
        url: FACEBOOK_BATCH_URL,
        httpStatus: response.status,
        requestId,
        body: text.substring(0, 500),
      });
      throw this.createGraphQLError(
        ERROR_CODES.GRAPHQL_ERROR,
        'Failed to parse batch response',
        0,
        { response: text.substring(0, 500) }
      );
    }

    // Detect session expiry in batch response
    this.detectSessionExpiry(data, {
      url: FACEBOOK_BATCH_URL,
      operation: operationNames,
      requestId,
    });

    const responses: BatchResponse['responses'] = batch.queries.map((q, index) => {
      const key = `q${index}`;
      const responseData = data[key] as GraphQLResponse<unknown>;

      if (!responseData) {
        return {
          name: q.name,
          data: null,
          error: { message: `No response for query ${q.name}` },
        };
      }

      if (responseData?.errors?.length) {
        logger.debug('GraphQL batch: per-query error', {
          operation: q.name,
          requestId,
          errors: responseData.errors,
        });
      }

      return {
        name: q.name,
        data: responseData?.data,
        error: responseData?.errors?.[0],
      };
    });

    return { responses };
  }

  /**
   * Make a GraphQL mutation.
   * Uses /api/graphql/ for personal Facebook accounts (same endpoint as queries).
   */
  async mutation<T = unknown>(
    mutationName: string,
    variables: Record<string, unknown> = {},
    mutationDoc?: string
  ): Promise<T> {
    return this.query<T>(mutationName, variables, mutationDoc);
  }

  /**
   * Encode form data as application/x-www-form-urlencoded string.
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
   * Build base form data shared across query()/executeBatch().
   */
  private buildFormData(): Partial<FacebookFormData> {
    const data: Partial<FacebookFormData> = {
      __a: '1',
      __req: generateReqParam(),
      dpr: '1',
      __ccg: 'EXCELLENT',
    };

    // Real __rev (extractRevision()), never a fabricated placeholder.
    // Only set here as a base default; query()/executeBatch() override it
    // with the real revision or Comet __spin_r fingerprint when available.
    if (this.revision) {
      data.__rev = this.revision;
    }

    return data;
  }

  /**
   * Generate jazoest value — sum of fb_dtsg char codes prefixed with "2".
   * This is how the real Messenger Web client computes it.
   */
  private generateJazoest(): string {
    let sum = 0;
    for (let i = 0; i < this.fbDtsg.length; i++) {
      sum += this.fbDtsg.charCodeAt(i);
    }
    return `2${sum}`;
  }

  /**
   * Generate __dyn parameter.
   * This is a compressed representation of Facebook's lazy-loaded module
   * graph for the current client build. The exact value rotates with each
   * Facebook deploy. Facebook's servers are generally tolerant of a
   * slightly-stale __dyn (it is a performance hint, not a security gate),
   * but this should be updated whenever a new major Facebook web build ships.
   */
  private generateDyn(): string {
    return '7xeUmFoG3Ejy4QjG1mEhy4Q2qewKewSwMxu0SU1szU6U6O12wOx62G1uwJwpUe8hwaQ0z8cE7S0jq0Lk2K0vwbS1Lw9C0le0L83hw6aw8O0jq0wqo4C2m0jq78cE1JwqE2y0gq0N5o4aE3C0Do1swGwQwo8a8462xa';
  }

  /**
   * Create a typed GraphQL error, preserving the caller-supplied error code.
   */
  private createGraphQLError(
    code: string,
    message: string,
    statusCode: number = 0,
    data?: unknown
  ): GraphQLError {
    return new GraphQLError(message, statusCode, data, code);
  }
}
