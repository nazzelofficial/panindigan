---
name: GraphQL layer audit v1.3.2
description: Findings and decisions from the complete GraphQL layer compatibility audit applied in v1.3.2
---

## Key decisions

**`__rev` vs `__spin_r`**: Both share the same numeric value in practice, but `__rev` must be set to `this.revision` (extractRevision() plain regex) and `__spin_r` to `this.spinR` (Comet fingerprint). Use `this.revision || this.spinR` as the `__rev` value so the semantically correct one is preferred.

**TokenProvider pattern**: Added `setTokenProvider(fn)` + `syncTokens()` to GraphQLClient. Called at the top of every `formPost()`/`query()`/`executeBatch()`. Wired in Authenticator constructor via `sessionManager.getSession()`. This is on top of (not replacing) the push-based `setAuthTokens()` call in SessionManager.refreshSession.

**detectSessionExpiry**: Checks `error === 1357001`, `login_required: true`, `errorDescription` with "must be logged in"/"session expired", nested `errors[].code === 1357001`. Throws `SessionExpiredError` with `{url, operation, requestId, data}` context.

**fb_api_req_friendly_name**: Added to `query()` payload only (not `executeBatch()`). Uses `queryName` argument.

**`GRAPHQL_DOC_IDS`/`GRAPHQL_QUERIES`**: Never used internally. Cannot remove in a 1.3.x patch because `src/index.ts` does `export * as Constants from './utils/Constants.js'` — removal breaks the public API. Marked `@deprecated` instead; actual removal deferred to next major version.

**Why:** Confirmed by code review subagent — removal in patch release is a breaking change.

**FacebookFormData**: Removed phantom `__hs` (never set). Added `av`, `__spin_r`, `__spin_b`, `__spin_t`, optional `fb_api_req_friendly_name` (all actually sent in payloads).
