# Changelog

All notable changes to the Panindigan project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.9] - 2026-07-05

### Fixed

#### GraphQL (`src/api/GraphQLClient.ts`, `src/auth/Authenticator.ts`, `src/auth/SessionManager.ts`, `src/utils/Helpers.ts`, `src/types/auth.ts`)
- **Root cause of the remaining `GraphQLError: Please try closing and re-opening your browser window` on `GraphQLClient.query()`/`executeBatch()` (and, by extension, `UserManager.getUserInfo()` when routed through them)** — after 1.2.8 fixed the missing/fabricated `lsd` token, requests were still being rejected because `query()`/`executeBatch()` sent a **hardcoded, fake build/revision fingerprint**: `__rev: '100'` (a static string, not a real Facebook server revision) and `__hsi: generateRandomString(12)` (a random value, not the real haste session id Facebook issued for that page load). Facebook's Comet-era ajax/GraphQL endpoints cross-validate `__rev`/`__spin_r`/`__spin_b`/`__spin_t`/`__hsi` against the session and reject any request whose fingerprint doesn't match a value it actually served — a fabricated or stale fingerprint produces the exact same generic browser-session error as a missing `lsd`.
  - Fix: added `extractRevisionInfo()` (`src/utils/Helpers.ts`), which extracts the real `__spin_r`, `__spin_b`, `__spin_t`, and `__hsi` values straight out of the Facebook HTML returned on login (`Authenticator.loginWithAppState`) and on every periodic session refresh (`SessionManager.refreshSession`). These are stored on `Session.revisionInfo` (new field, `src/types/auth.ts`) and pushed into `GraphQLClient.setRevisionInfo()`, which now supplies the real values to `buildBaseParams()` (used by `formPost()`/`UserManager.getUserInfo`), `query()`, and `executeBatch()` — replacing the hardcoded `__rev: '100'` and randomly generated `__hsi` entirely.
  - `GraphQLClient.query()`/`executeBatch()` now throw a clear, typed `GraphQLError` up front if a real fingerprint hasn't been extracted yet, instead of silently sending a fabricated one and letting Facebook reject it downstream with a misleading message.
  - `SessionManager` now also holds a reference to the shared `GraphQLClient` (`setGraphQLClient()`, wired up in `Authenticator`'s constructor) so that refreshed `fb_dtsg`/`lsd`/revision-fingerprint values are pushed back into the same client instance every manager (`UserManager`, `MessageSender`, `ThreadManager`, `MediaUploader`) already shares — previously a periodic refresh updated the `Session` object but left the live `GraphQLClient` using the original, aging tokens indefinitely.
  - No retries, delays, or workarounds were added. No fake user data, no placeholder GraphQL responses, and no changes to MQTT. The fix is exactly what the audit called for: extract the real per-page build/revision fingerprint Facebook already serves and stop sending a static/random substitute.

## [1.2.8] - 2026-07-05

### Fixed

#### GraphQL (`src/api/GraphQLClient.ts`, `src/auth/Authenticator.ts`, `src/auth/SessionManager.ts`, `src/auth/CookieParser.ts`, `src/api/RequestHandler.ts`, `src/types/auth.ts`)
- **Root cause of `GraphQLError: Please try closing and re-opening your browser window` on `UserManager.getUserInfo()` and all other GraphQL/Comet-ajax calls** — Facebook's `lsd` security token (a real, page-load-bound token distinct from `fb_dtsg`) was never handled correctly:
  - `GraphQLClient.query()`/`executeBatch()` sent a **fabricated** `lsd: generateRandomString(12)` instead of a real token extracted from Facebook.
  - `GraphQLClient.formPost()` (the exact path in the reported stack trace: `formPost → UserManager.getUserInfo`) never sent an `lsd` field at all.
  - `RequestHandler.setLsdToken()` existed to inject the `x-fb-lsd` header but was **never called anywhere** in the codebase, so that header was always empty.
  - Facebook validates `lsd` as a real session-binding token; a missing or fabricated value causes it to treat the request as coming from a stale/invalid browser session and reject it with exactly this message.
  - Fix: `lsd` is now a first-class field on `Session`/`AppState` (`src/types/auth.ts`). It is extracted from real Facebook HTML the same way `fb_dtsg` already was — on AppState login (`Authenticator.loginWithAppState`), credentials login, 2FA, and checkpoint resolution (`Authenticator.ts`), and re-extracted on every periodic session refresh (`SessionManager.refreshSession()`). The real value is pushed into both `RequestHandler.setLsdToken()` (so the `x-fb-lsd` header is sent) and `GraphQLClient.setAuthTokens()` (so `formPost()`'s base params and `query()`/`executeBatch()`'s payload all carry the real token instead of a random string or nothing). `CookieParser.parseAppState()` also now passes through a `lsd` field on object-form AppState input for callers who already capture it themselves.
  - No retries, delays, or workarounds were added — this is a root-cause fix: the real token is captured and reused everywhere it needs to be, exactly like `fb_dtsg` already was. If a real `lsd` genuinely cannot be extracted from Facebook's HTML (e.g. Facebook changes the page's token embedding format), the library now logs a clear warning instead of silently sending a fabricated value.
- No MQTT files were touched, and no login behavior changed except adding the additional `lsd` extraction/propagation alongside the existing `fb_dtsg` extraction.

## [1.2.7] - 2026-07-05

### Audited

#### MQTT CONNACK return code 3 ("Server unavailable") investigation
Investigated a report of `MQTT connection refused / returnCode: 3 / Connection Refused - Server unavailable` on an AppState login that otherwise succeeds (session + HTTP requests work). Audited both MQTT clients (`src/mqtt/MQTTClient.ts`, `src/mqtt/FastMQTT.ts`) against all 20 requested protocol surfaces:

- **WebSocket URL, protocol name/level, CONNECT flags, Remaining Length encoding, UTF-8 string encoding, username JSON payload shape, client ID / device ID / session ID generation, keep alive, clean session flag, QoS handling, WebSocket headers (User-Agent/Origin/Referer/Cookie), `Sec-WebSocket-Protocol` header, `aid`/`cp`/`ecp` fields — all verified already correct and already consistent between `MQTTClient.ts` and `FastMQTT.ts`** (protocol name `MQIsdp`, level 3, connect flags `0x82`, real username-present + clean-session bits, no fabricated password field, real device id always populated via `generateDeviceId()` fallback so the `d` field is never dropped by `JSON.stringify`).

#### Fixed

##### MQTT (`src/mqtt/MQTTClient.ts`)
- **Un-encoded `cid`/`region` query params in `buildBrokerUrl()`** — `MQTTClient.ts` interpolated `this.clientId` and the region string directly into the WebSocket URL query string, while `FastMQTT.ts` correctly wrapped both in `encodeURIComponent()`. Not the cause of the reported return-code-3 (the generated client id/region values never contain characters requiring escaping today), but a real inconsistency between the two client implementations that could corrupt the URL if either value ever changes shape. Brought `MQTTClient.ts` in line with `FastMQTT.ts`.

**Root cause of the return-code-3 report:** not found in the CONNECT packet encoding, WebSocket headers, or username payload — every field matches Facebook's real Messenger Web MQTT protocol as already documented in this codebase (see 1.2.5/1.2.6 CHANGELOG entries) and both client implementations are now byte-for-byte consistent. CONNACK return code 3 is returned by Facebook's broker itself (not a local encoding bug) when it refuses a structurally valid CONNECT — commonly caused by session/cookie state that is valid for HTTP but not (yet, or anymore) valid for the realtime edge (e.g. a very recently created AppState that hasn't propagated to the chat edge, an account already MQTT-connected from another live client, or a region edge outage) rather than by anything this library controls. No workaround, retry, or fabricated fix was introduced to mask this — the codebase does not guess or manufacture a "fix" for a broker-side refusal it cannot verify without a live packet capture from a failing account.

## [1.2.6] - 2026-07-04

### Added

#### MQTT (`src/mqtt/MQTTClient.ts`, `src/core/PanindiganFCA.ts`)
- **Exponential backoff + jitter and stale-connection health check for automatic reconnect** — `MQTTClient` (the client actually used by `PanindiganFCA`) previously only reconnected on a linear delay (`reconnectDelay * attempts`, capped at 30s) and only when the WebSocket emitted a real `close` event. Reconnect scheduling now doubles the delay per attempt up to a 60s cap with up to 30% random jitter (matching the pattern already proven in `FastMQTT.ts`), and a new periodic health check tracks time since the last packet was received — if the connection goes quiet past 2x the keepalive interval it sends an extra ping, and past 5x it force-terminates the socket and reconnects, so a half-open connection that never sends a close frame doesn't leave the client silently stuck. Manual `disconnect()` calls are tracked so they never trigger an unwanted auto-reconnect.
- **`getConnectionStats()` on `MQTTClient` and `getMQTTStats()` on `PanindiganFCA`** — exposes live connection/reconnect diagnostics (connected/connecting state, reconnect attempt count, time since the last packet was received, queued message count, and raw WebSocket ready state) so callers can monitor MQTT health at runtime instead of only reacting to `connect`/`disconnect` events. `isConnected()` was also tightened to check the WebSocket's actual `readyState` in addition to the internal `connected` flag, matching `FastMQTT`'s existing behavior. `getMQTTStats()` returns `null` before the MQTT client has been initialized (i.e. before login/connect).
- **Periodic `mqtt_stats` event** — while connected, `MQTTClient` now emits an `mqtt_stats` event every 30 seconds carrying the same snapshot as `getConnectionStats()`, so consumers can subscribe to live connection health instead of having to poll. The timer starts on CONNACK and is stopped on every disconnect path (manual `disconnect()`, WebSocket `close`, and the stale-connection health-check's forced reconnect) so it never leaks or fires while disconnected. `PanindiganFCA` forwards this event unchanged.
- **`waitForConnection()` on `MQTTClient` and `waitForMQTTConnection()` on `PanindiganFCA`** — resolves once CONNACK is actually received (or immediately if already connected), and rejects on a connection error or after a timeout (default 30s). Lets callers block until MQTT is genuinely ready before sending messages instead of relying on `publish()`'s internal message queue and hoping it flushes before the caller needs a result. `waitForMQTTConnection()` rejects immediately if the MQTT client hasn't been initialized yet (i.e. before `login()`/`connectMQTT()`).

#### Auth (`src/auth/Authenticator.ts`, `src/auth/SessionManager.ts`, `src/utils/Constants.ts`)
- **Messenger inbox fallback for the real Iris sequence id** — the plain `www.facebook.com` homepage rarely embeds the Iris sync sequence id (it normally lives in the Messenger inbox's initial data blob instead). Login now falls back to fetching `https://www.facebook.com/messages/t/` (new `FACEBOOK_MESSAGES_URL` constant) and re-running the existing extraction patterns against that response whenever the homepage doesn't contain it. If a real id is found there, it's used to resume the real backlog via `/messenger_sync_get_diffs`; if it still isn't found, no id is fabricated — MQTT correctly falls back to `/messenger_sync_create_queue` for a fresh sync, exactly as before.
- **Retry/backoff around the inbox fallback fetch** — the Messenger inbox fallback request is now wrapped in `retryWithBackoff` (up to 3 attempts, 500ms initial delay with jitter, capped at 5s), with a non-2xx status treated as a retryable failure. This prevents a single transient network hiccup from silently skipping the real sequence id lookup on that one attempt; if all retries fail, the existing no-fabrication fallback to a fresh sync queue still applies unchanged.

### Fixed

#### Auth (`src/auth/Authenticator.ts`, `src/auth/SessionManager.ts`)
- **Misleading `Could not extract iris sequence ID from homepage` / `...from refreshed HTML` warnings on every AppState login and token refresh** — extraction failing against the general homepage is expected/normal (see above), not a real problem, but both the initial login flow and the periodic token-refresh flow logged it at `warn` level, making a normal, already-handled condition look like an error. Downgraded both to `debug` and reworded to state plainly that MQTT will start a fresh sync queue in this case (unchanged, real behavior — see `sendSyncQueue()` in `MQTTClient.ts`/`FastMQTT.ts`, added in 1.2.5). No sequence id is fabricated; this is a logging-severity fix only, not a behavior change.

## [1.2.5] - 2026-07-03

### Fixed

#### MQTT (`src/mqtt/MQTTClient.ts`, `src/mqtt/FastMQTT.ts`)
- **Root cause of `MQTT connection timeout` / `wsState: CLOSED`** — the client was sending a bare MQTT 3.1.1 CONNECT packet (protocol name `"MQTT"`, level `4`) with no `username` field. Facebook's chat broker (`edge-chat.facebook.com`) only speaks **MQTT 3.1** (protocol name `"MQIsdp"`, level `3`) and requires session/device data to be passed as a JSON object in the CONNECT packet's `username` field; a mismatched protocol name/level with no username causes the broker to close the raw WebSocket before ever sending a CONNACK, which surfaced as an opaque connection timeout with no MQTT-level error. `buildConnectPacket()` now sends protocol name `MQIsdp` / level `3`, sets the username-present connect flag, and encodes a `username` JSON payload (`u`, `s`, `cp`, `ecp`, `chat_on`, `fg`, `d`, `ct`, `aid`, `mqtt_sid`, `st`, `pm`, `dc`, `no_auto_fg`, `gas`, `pack`) built entirely from real session data (`session.userId`, `session.deviceId`) plus Facebook's long-published web Messenger app id — no fabricated or guessed fields.
- **Missing `Sec-WebSocket-Protocol: mqtt` header** — the WebSocket upgrade request never declared the `mqtt` subprotocol, which Facebook's broker requires to accept the connection as an MQTT-over-WebSocket session; the socket would otherwise be dropped post-upgrade. Both clients now send `Sec-WebSocket-Protocol: mqtt` as a raw request header and disable `permessage-deflate` (matching what Messenger Web actually negotiates). It is sent as a plain header rather than via `ws`'s `protocols` constructor argument, because `ws` enforces strict RFC6455 subprotocol negotiation for that argument and throws `Server sent no subprotocol` — Facebook's broker accepts the header but never echoes it back in its 101 response, so strict client-side negotiation must be bypassed.
- **`irisSeqId` misused as a broker URL parameter** — the previous `sid`/`seq` query params on the WebSocket URL were derived from the Iris sync sequence id, which is not a valid MQTT session identifier and is not part of the real protocol's connection URL. `buildBrokerUrl()` now sends a randomly generated per-connection MQTT session id (`sid`), the MQTT `cid`, and a `region` hint (from real session data) — matching Messenger Web's actual WebSocket URL shape.
- **Message backlog never resumed after connect** — there was no post-CONNACK Iris sync request, so the broker had no instruction to start streaming the message backlog over `/t_ms`. Added `sendSyncQueue()`, called right after CONNACK: publishes to `/messenger_sync_create_queue` for a fresh session, or `/messenger_sync_get_diffs` with the real `irisSeqId` (as `last_seq_id`) when one was actually extracted from Facebook. No sequence id is ever fabricated — a fresh queue is created whenever a real one isn't available yet.

#### Utilities (`src/utils/Helpers.ts`, `src/utils/Constants.ts`)
- Added `generateMqttSessionId()` — generates the random per-connection MQTT session id required by the CONNECT `username` payload and the broker URL's `sid` param (distinct from, and no longer conflated with, the Iris sync sequence id).
- Added `MQTT_WEB_APP_ID` (`219994525426954`) — Facebook's fixed, long-published web Messenger MQTT app id, sent as `aid` in every CONNECT username payload.

## [1.2.4] - 2026-07-03

### Fixed

#### Security (`src/security/CheckpointGuard.ts`)
- **False-positive checkpoint on any 302** — `inspectUrl()` was using `statusCode === 302 || url.includes(signal)` meaning *any* redirect (including a successful post-login redirect) triggered a checkpoint error; corrected to `hasCheckpointSignal` only, so a 302 without a known checkpoint path is not treated as a checkpoint

#### Errors (`src/errors/index.ts`)
- **Missing `NotImplementedError`** — added typed `NotImplementedError extends PanindiganError` (code `NOT_IMPLEMENTED`, non-retryable) and exported it from `src/index.ts`

#### API (`src/api/RequestHandler.ts`)
- **Dead `CircuitBreaker` and `RateLimiter`** — `executeRequest()` was completely bypassing both subsystems; now calls `rateLimiter.tryConsume()` before the fetch and wraps the fetch inside `circuitBreaker.execute()` so failures trip the breaker and rate exhaustion throws a typed `RateLimitError`

#### Core (`src/core/PanindiganFCA.ts`)
- **`requireLogin()` throws generic `Error`** — changed to throw `SessionExpiredError` for proper typed error handling
- **Fake GraphQL `createPoll`** — replaced fabricated `CreatePollMutation` with a real form-encoded `POST /messaging/create_poll/` call
- **Fake GraphQL `votePoll`** — replaced fabricated `VotePollMutation` with a real form-encoded `POST /messaging/update_vote/` call
- **Fake GraphQL `getPollResults`** — replaced fabricated `PollQuery` with a real form-encoded `POST /ajax/messaging/poll_info.php` call
- **Fake GraphQL `createEvent`** — replaced fabricated `CreateEventMutation` with a real form-encoded `POST /messaging/create_event/` call
- **Fake GraphQL `rsvpToEvent`** — replaced fabricated `RSVPEventMutation` with a real form-encoded `POST /messaging/update_event_rsvp/` call
- **Fake GraphQL `getStories`** — replaced fabricated `StoriesQuery` with a real form-encoded `POST /ajax/stories/` call
- **Fake GraphQL `viewStory`** — replaced fabricated `ViewStoryMutation` with a real form-encoded `POST /ajax/stories/seen/` call
- **Fake GraphQL `initiateCall`** — replaced fabricated `InitiateCallMutation` with a real form-encoded `POST /messaging/call/` call; WebRTC signaling (ICE/SDP) still flows over MQTT `/t_rtc`

#### User Manager (`src/users/UserManager.ts`)
- **Fake GraphQL `getFriends`** — replaced fabricated `FriendsQuery` with a real form-encoded `POST /ajax/mercury/friends_info.php` call with pagination support
- **Fake GraphQL `getSentFriendRequests`** — replaced fabricated `OutgoingFriendRequestsQuery` with a real form-encoded `POST /ajax/social-privacy/friend-request-page.php` call
- **Fake GraphQL `blockUser` / `unblockUser`** — replaced fabricated `BlockUserMutation` / `UnblockUserMutation` with real form-encoded `POST /ajax/profile/userblockunblock.php` calls using `block_action=block|unblock`
- **Fake GraphQL `getBlockedList`** — replaced fabricated `BlockedUsersQuery` with a real form-encoded `POST /settings/blocking/ajax/` call
- **Fake GraphQL `getBirthdays`** — replaced fabricated `BirthdaysQuery` with a real form-encoded `POST /ajax/birthday/notification/` call
- **Fake GraphQL `getPresence`** — replaced fabricated `PresenceQuery` with a real form-encoded `POST /ajax/mercury/chat_online_presences.php` call; real-time bulk presence still arrives via MQTT `/t_p`

#### Messaging (`src/messaging/MessageSender.ts`)
- **All attachments sent as `image_ids`** — pre-uploaded string IDs were unconditionally sent as `image_ids[N]` regardless of type; now routes to `video_ids`, `audio_ids`, or `file_ids` when an `UploadableFile` with a `mimeType` is passed, matching what Facebook Messenger Web sends

#### MQTT (`src/mqtt/MQTTClient.ts`, `src/mqtt/FastMQTT.ts`)
- **Packet ID 0 (MQTT 3.1.1 violation)** — `getNextPacketId()` used `% 65536` which can return 0 (forbidden by spec §2.3.1); corrected to `% 65535 + 1` (wraps 1–65535) in both clients
- **Deprecated `Buffer.slice()`** — `parsePublishPacket` used `data.slice(offset)` (deprecated in Node 17+); changed to `data.subarray(offset)` in both clients

#### Events (`src/events/EventParser.ts`)
- **`parsePresence()` discards bulk map** — when FB sends a bulk presence map `{ "<uid>": { p, lat }, … }`, only the first UID was processed; added `parseAllPresence()` that returns `PresenceEvent[]` for every UID in the map; `parsePresence()` now delegates to `parseAllPresence()` and returns the first result

#### Thread Manager (`src/threads/ThreadManager.ts`)
- **`parseThread()` always returns empty `participants` and `adminIds`** — now maps `t.all_participants.nodes` and `t.admin_ids` from the response when present, with full `Participant` objects including `nickname`, `isAdmin`, `isUser` fields
- **`createGroup()` missing thread name** — `thread_name` param was not included in the POST body; now included when `options.name` is provided

#### Media (`src/media/MediaUploader.ts`)
- **No MIME/size validation before upload** — all upload methods (`uploadImage`, `uploadVideo`, `uploadAudio`, `uploadDocument`) now call a `validateUpload()` guard that checks against `FILE_SIZE_LIMITS` and `ALLOWED_MIME_TYPES` from Constants before sending the multipart request; throws a typed `UploadError` on violation

#### Utilities (`src/utils/RequestCache.ts`, `src/utils/MessageQueue.ts`)
- **`RequestCache` no auto-clean timer** — `cleanExpired()` existed but was only called on get/insert; constructor now starts a `setInterval` every 5 minutes with `unref()` so the process can exit cleanly; `destroy()` method added to cancel the timer
- **`MessageQueue` blocking sync I/O** — `saveToDisk()` used `writeFileSync` on every enqueue/dequeue/remove, blocking the event loop; replaced with async `writeFile` fire-and-forget from `fs/promises`

#### Constants (`src/utils/Constants.ts`)
- Added missing endpoint constants: `FACEBOOK_FRIENDS_INFO_URL`, `FACEBOOK_SENT_REQUESTS_URL`, `FACEBOOK_BLOCK_URL`, `FACEBOOK_BLOCKED_LIST_URL`, `FACEBOOK_BIRTHDAYS_URL`, `FACEBOOK_PRESENCE_URL`, `FACEBOOK_STORIES_URL`, `FACEBOOK_VIEW_STORY_URL`, `FACEBOOK_CREATE_EVENT_URL`, `FACEBOOK_RSVP_EVENT_URL`, `FACEBOOK_INITIATE_CALL_URL`, `FACEBOOK_POLL_RESULTS_URL`

#### MQTT (`src/mqtt/MQTTClient.ts`, `src/mqtt/FastMQTT.ts`, `src/events/EventParser.ts`)
- **Presence fan-out still dropped in MQTT layer** — `parseAndEmitEvent()` / `handlePublish()` called `eventParser.parse()` which returns only the first PresenceEvent even after `parseAllPresence()` was added; added `EventParser.parseAll()` which returns `PanindiganEvent[]` (bulk presence → one event per UID, all other topics → 0–1 events), and updated both MQTT clients to iterate the result so every UID in a bulk map is emitted

#### API (`src/api/RequestHandler.ts`)
- **Circuit-breaker OPEN throws untyped `Error`** — when the breaker is open, `CircuitBreaker.execute()` throws a plain `Error`; `executeRequest()` now catches that and re-throws as a typed `NetworkError` (retryable, `circuitOpen: true` in `data`) so callers get a predictable instanceof-safe error

#### Public API (`src/core/PanindiganFCA.ts`)
- **`getPresence` missing from main API surface** — `UserManager.getPresence()` was implemented but not delegated through `PanindiganFCA`; added `getPresence(userId): Promise<Presence>` wrapper (spec §13: every manager method must be exposed)

#### Exports (`src/index.ts`)
- Added `NotImplementedError` to the public error class exports

## [1.2.3] - 2026-07-02

### Fixed

#### FastMQTT (`src/mqtt/FastMQTT.ts`)
- **Topic drift** — `subscribeToTopics()` was using a hardcoded list of 12 topic strings that diverged from `MQTTClient`'s canonical set; now uses `MQTT_TOPICS` constants throughout, matching all 19 topics including `/t_notify`, `/t_region_hint`, `/orca_presence`, `/orca_typing_notifications`, `/orca_message_notifications`, `/webrtc`, and `/webrtc_response`
- **Topic drift in `buildBrokerUrl()`** — same hardcoded list was also used for the `subscribe_topics` broker URL parameter; updated to the full `MQTT_TOPICS` set in sync with `subscribeToTopics()`
- **Fabricated `irisSeqId`** — `buildBrokerUrl()` fell back to `Math.floor(Date.now() / 1000).toString()` when no valid `irisSeqId` was present, producing a meaningless timestamp in place of a real Iris sequence number; now omits `sid`/`seq` query parameters entirely when `irisSeqId` is absent or `'0'`, matching `MQTTClient` behaviour, and logs a warning instead
- **Missing `MQTT_TOPICS` import** — added `MQTT_TOPICS` to the import from `../utils/Constants.js`

#### GraphQLClient (`src/api/GraphQLClient.ts`)
- **Untyped error creation** — `createGraphQLError()` was constructing a plain `Error` and tacking on `code`, `statusCode`, and `data` properties via assignment, bypassing the typed error hierarchy; now returns a proper `GraphQLError` instance (from `src/errors/index.ts`) so `instanceof` checks, typed catch clauses, and `PanindiganError` base behaviour work correctly
- **Dead `reqCounter` field** — the `private reqCounter: number` field was incremented in `query()` but never read during `formPost()` routing (each call independently invoked `generateReqParam()`); field removed and `query()` now uses the fixed key `'q0'` for the single-query case, consistent with the batch path which already used index-based keys

#### SessionManager (`src/auth/SessionManager.ts`)
- **Bare `fetch()` in `refreshSession()`** — the token-refresh step issued a raw `fetch('https://www.facebook.com', ...)` with hardcoded headers and no cookie jar, bypassing the authenticated `RequestHandler` entirely; replaced with `this.requestHandler.get(FACEBOOK_BASE_URL)` which carries the full session cookies, default headers, retry policy, and proxy configuration; a `setRequestHandler()` injection method was added to `SessionManager` and called immediately after construction in `Authenticator`

#### Errors (`src/errors/index.ts`)
- **Redundant `Object.setPrototypeOf` calls** — `SessionExpiredError`, `TwoFactorRequiredError`, and `TimeoutError` each called `Object.setPrototypeOf(this, new.target.prototype)` explicitly, but the base `PanindiganError` constructor already performs this call unconditionally; the redundant calls have been removed

#### Constants (`src/utils/Constants.ts`)
- **`Accept-Encoding` header order** — value was `'gzip, deflate, br'` (brotli last); corrected to `'br, gzip, deflate'` so the server-preferred brotli encoding is listed first, matching what Messenger Web sends and what was documented in the `1.2.1` patch notes

---

## [1.2.2] - 2026-07-02

### Added

#### Security Module — EntropyPool (`src/security/EntropyPool.ts`)
- New `EntropyPool` class: CSPRNG-backed 22-bit seed pool for `offline_threading_id` generation
- Pre-fills 256 values on startup using `crypto.randomBytes()` (one syscall per batch)
- `nextOfflineId()` — same format as Messenger Web (`(timestampMs << 22n) | random22bits`) but with cryptographic randomness
- Auto-refills when pool drops below low-water mark (default 48); configurable via `EntropyPoolOptions`
- `rotationInterval` forces full pool regeneration every N draws (default 512)
- `getStats()` — exposes pool depth, draw count, and total refill count for diagnostics

#### Security Module — CheckpointGuard (`src/security/CheckpointGuard.ts`)
- New `CheckpointGuard` class: automated checkpoint detection and burst-send protection
- **URL screening** — every response URL is checked against known checkpoint redirect patterns (`/checkpoint/`, `checkpoint_required`, `/login/checkpoint`, etc.)
- **Body screening** — JSON response body checked for `"checkpoint_required"`, `"checkpoint_url"`, `"verification_required"`, `"CHECKPOINT"`, Facebook error codes `1357007`, `368`
- **Burst tracking** — sliding 60-second window counting outgoing sends; levels: `safe` (< 20/min), `warn` (20–39/min), `critical` (≥ 40/min)
- **Adaptive delays** — `recordSend()` returns the delay (ms) the caller should inject: 0 at `safe`, 1 200 ms at `warn`, 4 000 ms at `critical`
- **State machine** — `'clear' | 'checkpoint' | 'suspended'`; all outgoing sends throw `CheckpointError` when not `'clear'`
- **Critical burst auto-suspend** — configurable `blockOnCriticalBurst` (default `true`) transitions state to `'suspended'` at ≥ 40/min
- `onCheckpoint(cb)` — register one or more callbacks fired on checkpoint detection
- `clearCheckpoint()` — reset state, backoff counter, and burst window after manual challenge resolution
- `backoffMs()` — exponential backoff sequence: 5 s → 15 s → 45 s → 2 min → 5 min
- `getStats()` — full diagnostics snapshot (`GuardStats`)

#### Security Module — index re-export (`src/security/index.ts`)
- Exports `AntiSuspension`, `EntropyPool`, `CheckpointGuard` and all related types

#### Public exports (`src/index.ts`)
- `EntropyPool`, `EntropyPoolOptions`
- `CheckpointGuard`, `CheckpointGuardOptions`, `CheckpointCallback`, `GuardState`, `BurstLevel`, `GuardStats`

### Changed

#### RequestHandler (`src/api/RequestHandler.ts`)
- `setCheckpointGuard(guard)` — new setter; screens every response URL automatically in `executeRequest()`

#### GraphQLClient (`src/api/GraphQLClient.ts`)
- `setCheckpointGuard(guard)` — new setter; screens response body in `formPost()` and wires guard into the underlying `RequestHandler`

#### MessageSender (`src/messaging/MessageSender.ts`)
- `setCheckpointGuard(guard)` / `setEntropyPool(pool)` — new setters
- `sendMessage()` now calls `checkpointGuard.recordSend()` before send (throws `CheckpointError` if blocked; returns adaptive delay which is `await sleep()`'d before the network call)
- `sendLocation()`, `sendContact()`, `forwardMessage()` all use `this.newOfflineId()` (CSPRNG via pool when available, falls back to `generateOfflineThreadingId()`)
- `generateOfflineThreadingId()` import retained as fallback; `sleep` import added

#### PanindiganFCA (`src/core/PanindiganFCA.ts`)
- Instantiates `CheckpointGuard` and `EntropyPool` in constructor
- Wires both into `GraphQLClient`, `MessageSender` on construction
- Forwards checkpoint events to `EventEmitter` as `'checkpoint'` events
- New public methods: `onCheckpoint(cb)`, `isCheckpointed()`, `clearCheckpoint()`, `getBurstLevel()`, `getGuardState()`, `getSecurityStats()`, `getSendsLastMinute()`, `getEntropyStats()`

---

## [1.2.1] - 2026-07-02

### Added

#### Typed Error Classes (`src/errors/index.ts`)
- `PanindiganError` — base class with `code`, `statusCode`, `retryable`, `data` fields
- `AuthenticationError`, `CheckpointError`, `MQTTError`, `RateLimitError`, `NetworkError`
- `UploadError`, `MessageError`, `ThreadError`, `UserError`, `GraphQLError`
- `SessionExpiredError`, `TwoFactorRequiredError`, `TimeoutError`
- All subclasses use `Object.setPrototypeOf` for correct `instanceof` behaviour in ESM

#### MQTT Topics (`src/utils/Constants.ts`)
- Added `MQTT_TOPICS` named constant map covering all topics Messenger Web subscribes to
- New topics added to `subscribeToTopics()` and `buildBrokerUrl()`: `/orca_presence`, `/orca_typing_notifications`, `/orca_message_notifications`, `/t_notify`, `/t_region_hint`, `/webrtc`, `/webrtc_response`
- Added constants: `FB_HEADER_LSD`, `FB_HEADER_ASBD`, `FB_HEADER_RESPONSE_FORMAT`
- Added endpoints: `FACEBOOK_SET_THREAD_IMAGE_URL`, `FACEBOOK_SET_APPROVAL_MODE_URL`, `FACEBOOK_APPROVE_MEMBER_URL`, `FACEBOOK_REJECT_MEMBER_URL`, `FACEBOOK_GET_INVITE_LINK_URL`, `FACEBOOK_JOIN_THREAD_URL`, `FACEBOOK_FOLLOW_URL`, `FACEBOOK_MUTUAL_FRIENDS_URL`, `FACEBOOK_PENDING_REQUESTS_URL`, `FACEBOOK_EDIT_MESSAGE_URL`, `FACEBOOK_FORWARD_MESSAGE_URL`, `FACEBOOK_DELETE_MESSAGE_URL`, `FACEBOOK_SEARCH_MESSAGES_URL`

#### RequestHandler Headers (`src/api/RequestHandler.ts`)
- Auto-injects `x-fb-lsd` and `x-asbd-id` on every request
- `Accept-Encoding: br, gzip, deflate` (brotli first)
- 429 responses now throw `RateLimitError` with `Retry-After` header parsed
- Jitter added to exponential backoff: `delay * (0.5 + Math.random() * 0.5)`
- `AbortController` timeout on every fetch (configurable, default 30 s)

#### Event Types (`src/types/events.ts`)
- `MessageReplyEvent`, `MessageEditEvent`, `MessageUnsendEvent`
- `ThreadApprovalEvent`, `RegionHintEvent`, `RawEvent`
- `PanindiganEvent` union and `EventHandlerMap` updated

#### Message Types (`src/types/messages.ts`)
- `VoiceAttachment`, `ContactAttachment`
- `SendMessageOptions` extended: `gifUrl`, `voice`, `location`, `contact`, `syncGroup`, `ephemeralTtl`, `initiatingSource`, `clientTags`

#### EventParser new topic handlers (`src/events/EventParser.ts`)
- `/orca_presence` → delegates to `parsePresence()`
- `/orca_typing_notifications` → delegates to `parseTypingNotification()`
- `/orca_message_notifications` → delegates to `parseMessageSync()`
- `/t_region_hint` → new `parseRegionHint()` → `RegionHintEvent`
- `/webrtc`, `/webrtc_response` → new `parseWebRTCEvent()` → delegates to `parseRTCEvent()`
- `editmessage` / `editedMessage` delta class → new `parseMessageEditDelta()` → `MessageEditEvent`
- `parseUnsendDelta()` now returns correctly-typed `MessageUnsendEvent` (removed `as unknown as PanindiganEvent` cast)

### Changed

#### MessageSender (`src/messaging/MessageSender.ts`)
- `editMessage(messageId, body)` — real `POST /messaging/edit_message/`
- `forwardMessage(messageId, threadId, isGroup)` — real `POST /messaging/forward_message/`
- `sendLocation()` private helper — location as structured JSON attachment in `POST /messaging/send/`
- `sendContact()` private helper — contact card via `contact_fbid` field in `POST /messaging/send/`
- Added `sync_group`, `ephemeral_ttl_mode`, `ttl`, `animated_image_url`, `client_tags`, `is_silent` to send payload
- `REACTION_EMOJIS` map used for canonical reaction name → emoji conversion

#### ThreadManager (`src/threads/ThreadManager.ts`)
- `setThreadImage(threadId, imageAttachmentId)` — `POST /messaging/set_thread_image/`
- `setApprovalMode(threadId, enabled)` — `POST /messaging/set_approval_mode/`
- `approveMember(threadId, userId)` — `POST /messaging/approve_member/`
- `rejectMember(threadId, userId)` — `POST /messaging/reject_member/`
- `getInviteLink(threadId)` — `POST /messaging/get_invite_link/`
- `joinByInviteLink(link)` — `POST /messaging/join_thread/`
- `deleteMessage(messageId)` — `POST /messaging/delete_message/`
- `searchMessages(options)` — `POST /ajax/mercury/search.php`

#### UserManager (`src/users/UserManager.ts`)
- `followUser(userId)` — `POST /ajax/follow/get_follow.php` with `action: 'follow'`
- `unfollowUser(userId)` — same endpoint with `action: 'unfollow'`
- `getMutualFriends(userId)` — `POST /ajax/mutual_friends/`
- `getPendingFriendRequests()` — `POST /ajax/requests/friend/` with `action: 'get_all'`
- `getSentFriendRequests()` — GraphQL `OutgoingFriendRequestsQuery`
- `getPresence()` now returns full `Presence` type with `status: 'active' | 'idle' | 'offline'`
- `parseProfileFromMercury()` — dedicated parser for `/chat/user_info/` Mercury response shape

#### PanindiganFCA (`src/core/PanindiganFCA.ts`)
- `editMessage()` now delegates to `messageSender.editMessage()` (was calling fake `MessageEditMutation`)
- `forwardMessage()` now delegates to `messageSender.forwardMessage()` (was calling fake `MessageForwardMutation`)
- `handleMQTTMessage()` now emits a properly typed `RawEvent` object instead of `('raw', topic, payload)`
- Added public methods: `searchMessages`, `markAsDelivered`, `changeThreadImage`, `setApprovalMode`, `getInviteLink`, `joinByInviteLink`, `approveMember`, `rejectMember`, `pinMessage`, `unpinMessage`, `deleteMessage`, `deleteThread`, `followUser`, `unfollowUser`, `getMutualFriends`, `getPendingFriendRequests`, `getSentFriendRequests`, `cancelFriendRequest`

#### Types (`src/types/index.ts`)
- Exports `MessageReplyEvent`, `MessageEditEvent`, `MessageUnsendEvent`, `ThreadApprovalEvent`, `RegionHintEvent`, `RawEvent`, `FriendRequest`, `MessageSearchOptions`, `MessageSearchResult`, `User`
- Exports typed error classes via `src/errors/index.ts`
- Added `PanindiganAPI` interface covering the complete public surface

---

## [1.2.0] - 2026-07-01

### Changed

#### Real Facebook API Endpoints (Full Implementation Refactor)

- **MessageSender** (`src/messaging/MessageSender.ts`)
  - Replaced fake `MessageSendMutation` GraphQL call with real `POST /messaging/send/`
  - Added `offline_threading_id` using 64-bit BigInt: `(Date.now() << 22n) | random22bits`
  - Added `client_mutation_id`, `author=fbid:<userId>`, `source=source:chat:web`, `action_type=ma-type:user-generated-message` to every send request
  - Uses `thread_fbid` for group threads and `other_user_fbid` for 1-1 conversations
  - `sendTypingIndicator()` now uses real `POST /ajax/messaging/typ.php`
  - `markAsRead()` now uses real `POST /ajax/mercury/change_read_status.php`
  - `markAsDelivered()` now uses real `POST /ajax/mercury/delivery_receipts.php`
  - `unsendMessage()` now uses real `POST /messaging/unsend_message/`
  - `reactToMessage()` now uses real `POST /messaging/message_reactions/` with actual emoji strings

- **ThreadManager** (`src/threads/ThreadManager.ts`)
  - Replaced all fake `*Mutation` GraphQL names with real form-encoded endpoints
  - `getThreadList()` → `POST /ajax/mercury/threadlist_info.php`
  - `getThreadInfo()` → `POST /ajax/mercury/thread_info.php`
  - `getThreadHistory()` → `POST /ajax/mercury/conversation_info.php`
  - `createGroup()` → `POST /messaging/new_group_thread/`
  - `addParticipants()` → `POST /messaging/add_participants/`
  - `removeParticipants()` → `POST /messaging/remove_participant/` (per user)
  - `promoteParticipants()` / `demoteParticipants()` → `POST /messaging/update_thread_admins/`
  - `setNickname()` → `POST /messaging/set_nickname/`
  - `changeThreadColor()` / `changeThreadEmoji()` → `POST /messaging/set_thread_settings/`
  - `changeThreadName()` → `POST /messaging/set_thread_name/`
  - `leaveGroup()` → `POST /ajax/leave_group/`
  - `archiveThread()` → `POST /ajax/mercury/move_thread.php`
  - `muteThread()` → `POST /ajax/mercury/change_mute_thread.php`
  - `deleteThread()` → `POST /ajax/mercury/delete_thread.php`
  - `pinMessage()` → `POST /messaging/pin_message/`
  - `unpinMessage()` → `POST /messaging/unpin_message/`

- **MediaUploader** (`src/media/MediaUploader.ts`)
  - Replaced fake `ImageUploadMutation` / `VideoUploadMutation` / `AudioUploadMutation` / `DocumentUploadMutation`
  - All uploads now use real multipart `POST https://upload.facebook.com/ajax/mercury/upload.php`
  - Files sent as actual binary `multipart/form-data` (not base64 strings)
  - Response parsing handles Facebook's `for(;;);` JSON prefix
  - Attachment IDs extracted from real `payload.metadata[].image_id` / `video_id` / `audio_id` / `file_id`

- **EventParser** (`src/events/EventParser.ts`)
  - Added binary payload support: tries plain JSON → zlib inflate → raw deflate → stripped prefix
  - Added `UnsendMessage` delta class parsing
  - Added `ReadReceipt` and `DeliveryReceipt` delta class dispatching by class name
  - Added `AdminText` delta parsing (renames, participant add/remove inside `/t_ms`)
  - Added `/t_notify` topic handler
  - Typing events now extracted from both `/t_tn` and inline deltas inside `/t_ms`
  - Presence parsing handles both single-user objects and bulk presence maps (`{ "<uid>": { "p": 2, "lat": ... } }`)
  - `extractThreadId()` now handles all four field variants: `threadFbId`, `thread_fbid`, `otherUserFbId`, `other_user_fbid`

- **GraphQLClient** (`src/api/GraphQLClient.ts`)
  - Added `formPost<T>(url, params)` — generic helper for form-encoded non-GraphQL endpoints
  - Added `buildBaseParams()` — returns `fb_dtsg`, `__a`, `__user`, `__req`, `jazoest` for reuse by all managers
  - Made `encodeFormData()` public so managers can compose payloads independently

- **UserManager** (`src/users/UserManager.ts`)
  - `getUserInfo()` now uses real `POST /chat/user_info/` Mercury endpoint
  - `searchUsers()` now uses real `POST /ajax/typeahead/search.php`
  - `sendFriendRequest()` / `acceptFriendRequest()` / `declineFriendRequest()` / `cancelFriendRequest()` now use `POST /ajax/add_friend/action.php`
  - `unfriend()` now uses `POST /ajax/friends/lists/remove.php`

- **PanindiganFCA** (`src/core/PanindiganFCA.ts`)
  - `MessageSender`, `ThreadManager`, `UserManager`, `MediaUploader` are now singleton instances created once in the constructor
  - Removed all ~30 per-call `await import(...)` dynamic imports
  - `reactToMessage()` now delegates to `MessageSender.reactToMessage()` with real emoji strings via `REACTION_EMOJIS`
  - `unsendMessage()` delegates to `MessageSender.unsendMessage()`
  - `markAsRead()` delegates to `MessageSender.markAsRead()`
  - `sendTypingIndicator()` delegates to `MessageSender.sendTypingIndicator()`
  - `handleMQTTMessage()` forwards raw Buffer directly to EventParser (supports binary payloads)

- **Helpers** (`src/utils/Helpers.ts`)
  - Added `generateOfflineThreadingId()` — `(BigInt(Date.now()) << 22n) | BigInt(random22bits)`
  - Added `generateClientMutationId()` — monotonically incrementing integer per process lifetime
  - Added `parseFacebookResponse<T>()` — strips `for(;;);` prefix and JSON-parses

- **Constants** (`src/utils/Constants.ts`)
  - Added all real Facebook messaging endpoint URLs as named exports
  - Added `GRAPHQL_DOC_IDS` registry for known GraphQL document IDs

## [1.1.1] - 2026-07-02

### Fixed

#### Critical Bug Fixes
- **MQTT User ID Truncation** (`src/mqtt/MQTTClient.ts`)
  - Fixed critical bug where long user IDs were being truncated in MQTT broker URL
  - Removed URLSearchParams encoding which caused precision loss
  - Added explicit String() conversion to prevent numeric precision issues
  - Added detailed logging for URL length and user ID length debugging
  - This was causing MQTT connection failures for accounts with long user IDs

- **Iris Sequence ID Extraction (src/utils/Helpers.ts, src/session/SessionManager.ts)

  - Added 9 additional regex patterns for iris sequence ID extraction in extractIrisSeqId()
  - Patterns now cover: irisSeqId, seq_id, lastSeqId, iris_seq_id, seqId, sequenceId, and URL parameter formats
  - Fixed SessionManager.refreshSession(), which was still calling a single inline regex instead of the new extractIrisSeqId() helper 
  - the 9 additional patterns were being added but never actually run. Now wired up correctly, so all 12 patterns are used.
  - Removed the fallback that generated a fake sequence ID from the current timestamp when no real one was found. A timestamp is not a valid position in Facebook's Iris sync stream, and sending one risked broker rejection or silently skipped messages. If no real sequence ID is available, sid/seq are now omitted and a warning is logged instead.

- **Session User ID Handling (src/session/SessionManager.ts)
  - Added explicit String() conversion for user ID during session creation
  - Prevents numeric precision loss for large user IDs
  - Ensures consistent string type throughout session lifecycle

#### MQTT Connection Improvements (`src/mqtt/MQTTClient.ts`)
  - Added WebSocket compression headers (`Sec-WebSocket-Extensions`)
  - Added WebSocket version header (`Sec-WebSocket-Version: 13`)
  - Added handshake timeout configuration
  - Enhanced connection logging with URL length and user ID length
  - Improved error reporting for connection failures

## [1.1.0] - 2026-07-02

### Added

#### Resilience Patterns (`src/utils/`)
- **Circuit Breaker Pattern** (`CircuitBreaker`)
  - Prevents cascading failures by stopping requests to failing services
  - Three states: CLOSED, OPEN, HALF_OPEN
  - Configurable failure threshold (default: 5) and reset timeout (default: 60s)
  - Automatic recovery with exponential backoff
  - Statistics tracking for monitoring

- **Request Cache** (`RequestCache`)
  - TTL-based caching for GET requests (default: 5 minutes)
  - Configurable max size (default: 1000 entries)
  - Automatic eviction of oldest entries when full
  - Expired entry cleanup
  - Cache statistics and management

- **Token Bucket Rate Limiter** (`RateLimiter`)
  - Token bucket algorithm for precise rate limiting
  - Configurable tokens per interval (default: 30/second)
  - Configurable max tokens (default: 100)
  - Blocking and non-blocking token consumption
  - Wait time calculation for tokens

- **Message Queue with Persistence** (`MessageQueue`)
  - Priority-based message queueing
  - Disk persistence for message durability
  - Automatic retry with exponential backoff
  - Configurable max attempts and queue size
  - Queue statistics and monitoring

#### API Layer (`src/api/`)
- **Integrated Resilience Features** (`RequestHandler`)
  - Circuit breaker protection for all requests
  - Automatic caching for GET requests
  - Rate limiting for all API calls
  - Configurable skip options for cache and rate limit
  - Access to cache, circuit breaker, and rate limiter instances

### Changed

#### Type Definitions (`src/types/`)
- **RequestOptions Interface**
  - Added `skipCache` option to bypass caching
  - Added `skipRateLimit` option to bypass rate limiting
  - Better control over request behavior

## [1.0.9] - 2026-07-02

### Changed

#### API Layer (`src/api/`)
- **Advanced Retry Mechanism** (`RequestHandler`)
  - Implemented exponential backoff retry strategy (2x multiplier)
  - Automatic retry for network errors, timeouts, and 5xx HTTP errors
  - Configurable max retries (default: 3) and retry delay (default: 1000ms)
  - Better error recovery and resilience against temporary failures
  - Detailed retry logging for debugging

- **GraphQL Batch Query Optimization** (`GraphQLClient`)
  - Automatic batch splitting for large queries (max 50 queries per batch)
  - Parallel execution of split batches for improved performance
  - Enhanced error handling per query in batch
  - Optimized __comet_req parameter for better Facebook compatibility
  - Improved response parsing with null safety

#### Logging System (`src/utils/Logger.ts`)
- **Performance Metrics Tracking**
  - Automatic tracking of API call durations and counts
  - Average response time calculation per endpoint
  - Last response time tracking
  - Metrics logging and reset capabilities
  - Better performance monitoring and debugging

## [1.0.8] - 2026-07-02

### Added

#### Security Features (`src/security/`)
- **Anti-Suspension System** (`AntiSuspension`)
  - Human-behavior simulation to avoid Facebook bans
  - Configurable delays for messages, typing, and actions
  - Random typing pattern simulation
  - Rate limit monitoring (30 messages/minute, 60 actions/minute)
  - Session statistics tracking
  - Enable/disable functionality
  - Helps prevent account suspension by mimicking human behavior

#### MQTT Enhancements (`src/mqtt/`)
- **Fast MQTT Client** (`FastMQTT`)
  - Optimized connection with auto-restart capability
  - Health check system with 30-second intervals
  - Automatic stale connection detection and reconnection
  - Exponential backoff reconnection strategy (1.5x multiplier)
  - Infinite reconnection attempts by default
  - WebSocket ping/pong handling for connection monitoring
  - Connection statistics tracking
  - Configurable health check and timeout settings
  - Improved stability for long-running bots

#### Multi-Account Support (`src/core/`)
- **Multi-Account Manager** (`MultiAccountManager`)
  - Run multiple Facebook accounts simultaneously
  - Add/remove accounts with individual configurations
  - Default account selection for operations
  - Broadcast messages to all connected accounts
  - Execute functions on all accounts
  - Account connection/disconnection management
  - Event forwarding from all accounts to manager
  - Statistics tracking for all accounts
  - Batch operations support

#### Authentication Enhancements (`src/auth/`)
- **Auto Token Refresh** (`SessionManager.refreshSession()`)
  - Automatic fb_dtsg token refresh from Facebook homepage
  - Automatic iris sequence ID extraction
  - Token refresh during session refresh cycle
  - Graceful fallback if token refresh fails
  - Prevents session expiry due to stale tokens
  - Improved session longevity

#### Configuration (`src/utils/`)
- **Anti-Suspension Settings** (`ANTI_SUSPENSION_SETTINGS`)
  - Typing delay range (500-3000ms)
  - Message delay range (1000-5000ms)
  - Action delay range (200-1000ms)
  - Rate limits (30 messages/minute, 60 actions/minute)

- **Fast MQTT Settings** (`FAST_MQTT_SETTINGS`)
  - Keep-alive interval (60 seconds)
  - Health check interval (30 seconds)
  - Connection timeout (60 seconds)
  - Max reconnect delay (60 seconds)
  - Stale connection threshold (5 minutes)

### Changed

#### MQTT Connection (`src/mqtt/MQTTClient.ts`)
- **Fixed User ID Truncation in Broker URL**
  - Changed from URLSearchParams to manual URL parameter building
  - Prevents user ID truncation (was `6155938173049` instead of `61559381730491`)
  - Uses encodeURIComponent for proper encoding
  - Fixes MQTT connection timeout issues
  - Resolves WebSocket state CLOSED errors

#### Reconnection Strategy (`src/utils/Constants.ts`)
- **Infinite Reconnection Attempts**
  - Changed max reconnect attempts from 10 to Infinity
  - Initial delay increased to 3000ms (from 1000ms)
  - Backoff multiplier changed to 1.5 (from 2.0)
  - Max delay set to 60000ms (from 30000ms)
  - Better recovery from network issues

#### Session Refresh (`src/utils/Constants.ts`)
- **Optimized Refresh Intervals**
  - Session refresh interval reduced to 15 minutes (from 30 minutes)
  - Validity check interval reduced to 3 minutes (from 5 minutes)
  - More frequent token updates for better stability

### Fixed

#### MQTT Connection Timeout (`src/mqtt/MQTTClient.ts`)
- **Critical Bug: User ID Truncation**
  - URLSearchParams was truncating long user IDs
  - Manual URL building with encodeURIComponent fixes the issue
  - Facebook now receives complete user ID for authentication
  - Resolves "MQTT connection timeout" errors
  - WebSocket now successfully connects to broker

## [1.0.7] - 2026-07-01

### Fixed

- **Message Sending Data Structure** (`src/messaging/MessageSender.ts`)
  - Fixed message sending by updating GraphQL mutation data structure to match Facebook's expected format
  - Wrapped message data in `message` object with proper fields: `text`, `metadata_sender_id`, `thread_id`
  - Added `clientId` field for message tracking
  - Changed from flat structure to nested message object structure
  - Fixes issue where messages could not be sent to group chats
  - Ensures compatibility with Facebook's webgraphql/query endpoint for personal accounts

## [1.0.6] - 2026-02-11

### Fixed

- **Cookie Parsing & Authentication** (`src/auth/CookieParser.ts`, `src/auth/Authenticator.ts`)
  - Improved browser extension cookie format support (EditThisCookie, Cookie-Editor)
  - Added proper handling for `expirationDate` by converting it to ISO string
  - Fixed `hostOnly` detection to support both boolean and string values from different exporters
  - Enhanced cookie normalization with better error logging instead of throwing on minor issues
  - Improved login failure error messages to be more user-friendly when cookies are missing
  - Added detailed logging of available cookies when validation fails to help with troubleshooting

## [1.0.5] - 2026-02-11

### Fixed

- **MQTT Group Chat Support** (`src/mqtt/MQTTClient.ts`)
  - Increased MQTT connection timeout to 180 seconds for better group chat stability
  - Added mandatory URL parameters for initial MQTT connection (`device_id`, `initial_connection`, `bus_version`, `subscribe_topics`)
  - Improved group chat message synchronization by including topics in the initial connection URL
  - Fixed "MQTT connection timeout" issues reported by users when connecting to large group chats
  - Optimized broker URL construction with full parameter set for better reliability

## [1.0.4] - 2026-02-11

### Fixed

- **MQTT WebSocket Connection Stability** (`src/mqtt/MQTTClient.ts`)
  - Added comprehensive debug logging for WebSocket open/error events
  - Improved error handling with WebSocket state detection (CONNECTING, OPEN, CLOSING, CLOSED)
  - Fixed race condition in timeout handler with `resolved` flag
  - Added more browser-like headers to WebSocket connection (Referer, Connection, Upgrade)
  - Better error messages showing WebSocket state when timeout occurs
  - Prevents double-callback on connection completion

- **MQTT CONNECT Packet Handling** (`src/mqtt/MQTTClient.ts`)
  - Added detailed logging when sending CONNECT packet with packet size info
  - Improved error handling in sendConnect() method with try-catch
  - Added null check for WebSocket before sending CONNECT
  - Better error propagation when CONNECT packet fails
  - Detailed logging of CONNECT packet success

- **MQTT CONNACK Packet Parsing** (`src/mqtt/MQTTClient.ts`)
  - Added clear error messages for MQTT connection refusal codes (1-5)
  - Maps refusal codes to human-readable reasons
  - Distinguishes between protocol errors (codes 1-3) and authentication errors (codes 4-5)
  - Better logging showing exact reason for connection failure
  - Helps identify cookie validity issues vs network issues

## [1.0.3] - 2026-02-11

### Fixed

- **MQTT Packet Variable-Length Encoding** (`src/mqtt/MQTTClient.ts`)
  - Fixed critical bug where MQTT CONNECT, SUBSCRIBE, and PUBLISH packets used single-byte remaining-length encoding
  - Implemented proper MQTT variable-length encoding to support packet sizes > 127 bytes
  - Added `encodeRemainingLength()` method following MQTT v3.1.1 specification
  - Fixes 60-second timeout errors when connecting to Facebook MQTT broker
  - Proper handling of 7-bit values with continuation bits for multi-byte encoding

- **Group Chat Message Parsing** (`src/events/EventParser.ts`)
  - Fixed `parseMessageSync()` to handle both single and array delta structures from Facebook
  - Improved thread ID extraction to work for both 1-1 chats (`otherUserFbId`) and group chats (`threadFbId`)
  - Added support for message attachments and mentions parsing from delta
  - Proper `isGroup` flag detection based on thread key structure
  - Added helper methods: `parseDelta()`, `parseDirectDelta()`, `extractThreadId()`, `parseAttachments()`, `parseMentions()`
  - Better error handling with detailed logging for parsing failures

- **MQTT Topic Subscriptions for Group Chats** (`src/mqtt/MQTTClient.ts`)
  - Added subscription to additional critical topics: `/t_sb`, `/t_admin_text`, `/t_presence`, `/t_msg_body`, `/t_delta`
  - Per-subscription error handling prevents total failure if one subscription fails
  - Improved logging for subscription status per topic
  - Ensures complete coverage for group chat events and updates

- **MQTT Connection Timeout for Group Chats** (`src/mqtt/MQTTClient.ts`)
  - Increased connection timeout from 60 to 120 seconds to accommodate group chat setup and cookie validation
  - Better handling of slow network conditions during MQTT broker authentication
  - Prevents premature timeouts when connecting with valid but slow connections

- **MQTT Message Event Logging** (`src/core/PanindiganFCA.ts`)
  - Added comprehensive debug logging in `handleMQTTMessage()` to help diagnose group chat issues
  - Logs payload preview (first 200 characters) for debugging without exposing full payloads
  - Logs JSON parsing status, event type, and thread ID for each received message
  - Detailed error logging with context when message handling fails
  - Enables easier troubleshooting of group chat problems through debug logs

## [1.0.2] - 2026-02-11

### Added

#### Authentication Features (`src/auth/`)
- **Real Credential Login Implementation** (`Authenticator.loginWithCredentials()`)
  - Full email/password authentication flow
  - Automatic extraction of login tokens (fb_dtsg, lsd) from login page
  - Proper form data encoding for login requests
  - Automatic 2FA detection and handling during login
  - Security checkpoint detection
  - Automatic cookie jar management

- **2FA (Two-Factor Authentication) Implementation** (`Authenticator.handleTwoFactor()`)
  - Support for TOTP, SMS, and email 2FA methods
  - Automatic form token extraction
  - 2FA code submission and validation
  - Session cookie update after successful verification
  - Proper error handling for invalid codes

- **Security Checkpoint Resolution** (`Authenticator.handleCheckpoint()`)
  - Security checkpoint detection and handling
  - Multiple verification methods support (email, SMS, authenticator)
  - Device listing from checkpoint
  - Automatic session recovery after checkpoint resolution
  - User-friendly error messages with next steps

#### Media System (`src/media/`)
- **Real Attachment Download Implementation** (`MediaUploader.downloadAttachment()`)
  - Full HTTP REST API-based file downloading
  - Proper Content-Type and filename extraction
  - Graceful filename fallback from URL
  - Full error handling and logging
  - Support for all attachment types (images, videos, documents, etc.)

#### API Enhancements (`src/api/`)
- **GraphQL Client Enhancement**
  - Added `getRequestHandler()` method to expose request handler for other components
  - Enables cleaner separation of concerns for media operations

### Changed

#### Cookie Handling
- **Improved Cookie Parser Detection** (`CookieParser.detectFormat()`)
  - Browser extension format now has priority detection for `expirationDate` property
  - Better detection of EditThisCookie and Cookie-Editor formats
  - Enhanced type checking for all format variations

- **Enhanced Cookie Normalization** (`CookieParser.normalizeCookie()`)
  - Better handling of value type coercion
  - Improved string conversion for various value types
  - More robust parsing of different cookie object structures

#### Authentication Logging
- **Enhanced Logging in Authentication** (`Authenticator.loginWithAppState()`)
  - Debug logging of parsed cookies with cookie names list
  - Validation result logging showing required vs found cookies
  - fb_dtsg and iris sequence ID extraction logging
  - Warning logs for missing iris sequence ID with fallback explanation

- **Improved MQTT Connection Error Messages** (`MQTTClient.connect()`)
  - Detailed timeout error messages with debugging suggestions
  - Connection failure logging includes clientId and userId for diagnostics
  - Helpful error messages guiding users to check cookie validity

### Fixed

- **Cookie Encoding in MQTT WebSocket Headers**
  - Removed incorrect URL encoding from cookie header
  - HTTP Cookie header format now follows RFC 6265 standard
  - Cookies sent as plain name=value format without encoding

- **MQTT irisSeqId Fallback**
  - Added intelligent fallback when irisSeqId is not available
  - Uses Unix timestamp as sequence ID if irisSeqId is '0' or missing
  - Improves MQTT connection reliability

- **TypeScript Compilation Errors**
  - Fixed regex pattern line break issue in 2FA implementation
  - Removed unused variable declarations
  - Full type compliance with no compiler errors

## [1.0.1] - 2026-02-11

### Added

#### Event System (`src/events/`)
- **EventParser class** - Fully implemented event parsing system for MQTT messages
  - Parse message sync events (`/t_ms`) into typed MessageEvent objects
  - Parse RTC/call events (`/t_rtc`) into CallEvent objects
  - Parse presence updates (`/t_p`) into PresenceEvent objects
  - Parse typing notifications (`/t_tn`) into TypingEvent objects
  - Parse GraphQL events (`/t_graphql`) for thread updates (rename, color, emoji, image, nickname)
  - Parse participant events (add/remove participants, promote/demote admins)
  - Parse messaging events for read/delivery receipts
  - Parse C2B (Client to Business) events for personal messages
  - Proper TypeScript typing for all event types with full type safety

#### Media Handling (`src/media/`)
- **MediaUploader class** - Fully implemented media upload system
  - `uploadImage()` - Upload images with base64 encoding, supports width/height/quality options
  - `uploadVideo()` - Upload videos with optional thumbnail support
  - `uploadAudio()` - Upload audio files with voice mail support
  - `uploadDocument()` - Upload documents (PDF, DOC, etc.)
  - All methods use real GraphQL mutations (ImageUploadMutation, VideoUploadMutation, etc.)
  - Proper error handling and fallback attachment IDs

### Changed

#### Code Architecture
- **Refactored MQTTClient** to use EventParser for all event parsing
  - Removed duplicate parsing logic from MQTTClient
  - Added `getEventParser()` and `parseEvent()` methods for external access
  - Events now properly typed and emitted with correct event types
- **Refactored PanindiganFCA** to use MediaUploader for all media operations
  - Removed duplicate upload logic from PanindiganFCA
  - Added `getMediaUploader()` private method
  - All upload methods (uploadImage, uploadVideo, uploadAudio, uploadDocument) now delegate to MediaUploader

### Fixed

#### MQTT Connection Stability
- **Increased connection timeout** from 30 seconds to 60 seconds to accommodate slower network conditions
- **Fixed memory leak warnings** by setting max listeners to 50 in MQTTClient constructor
- **Improved connection error handling** with better cleanup of event listeners on timeout
- **Enhanced error messages** to provide more helpful guidance when connection fails
- **Added debug logging** for MQTT connection details to help diagnose connection issues
- **Fixed cookie encoding** in MQTT WebSocket connection - cookies are now properly URL-encoded
- **Improved WebSocket headers** with additional browser-like headers for better compatibility
- **Added cookie validation** to filter out invalid cookies before building cookie header

## [1.0.0] - 2026-02-10

### Important Note

**This release is specifically for Facebook Messenger USER ACCOUNTS and GROUP CHATS.**

This library is NOT for Facebook Pages. It uses the `webgraphql/query` endpoint designed for personal Facebook accounts, not the `api/graphql` endpoint used by Facebook Pages.

Supported:
- Personal Facebook account messaging
- Messenger group chats
- Direct messages between users

Not Supported:
- Facebook Page messaging
- Business account messaging

### Added

#### Core Infrastructure
- **TypeScript First Architecture**: Complete type safety with comprehensive type definitions for all API methods, events, and data structures
- **Node.js 22.22.0 Support**: Optimized for latest Node.js with native ESM support and modern JavaScript features
- **Project Structure**: Modular architecture with separate directories for auth, mqtt, api, messaging, media, threads, users, events, types, and utils

#### Authentication System
- **Universal Cookie Parser** (`CookieParser`): Support for all cookie formats including:
  - c3c-fbstate format
  - fca-unofficial/facebook-chat-api format
  - EditThisCookie browser extension
  - Cookie-Editor browser extension
  - J2Team Cookies
  - Raw cookie strings
  - Auto-detection of cookie formats
- **Session Manager** (`SessionManager`): Full session persistence with:
  - Automatic session validation
  - Session refresh every 30 minutes
  - Multi-account support
  - Session recovery from file
- **Authenticator** (`Authenticator`): Main authentication handler with:
  - AppState-based login (primary method)
  - Environment variable support (`FACEBOOK_APPSTATE`) for secure hosting
  - Automatic fb_dtsg and irisSeqId extraction

#### MQTT Real-Time System
- **True MQTT Implementation** (`MQTTClient`): Genuine MQTT over WebSocket (not HTTP polling)
  - WebSocket connection to Facebook MQTT brokers
  - MQTT protocol implementation (CONNECT, SUBSCRIBE, PUBLISH, PING)
  - Binary packet parsing for Facebook-specific formats
  - Keep-alive handling
- **Connection Management**:
  - Automatic reconnection with exponential backoff
  - Connection state monitoring
  - Message queuing for offline messages
  - Configurable max reconnect attempts (default: 10)
- **Event Subscription**: Automatic subscription to:
  - `/t_ms` - Message sync
  - `/t_rtc` - Real-time calls
  - `/t_p` - Presence updates
  - `/t_tn` - Typing notifications
  - `/t_graphql` - GraphQL events
  - `/t_messaging_events` - Messaging events
  - Personal C2B topic for user

#### API Layer
- **Request Handler** (`RequestHandler`): HTTP client with:
  - Cookie jar integration (tough-cookie)
  - Automatic cookie storage from responses
  - Timeout handling with AbortController
  - Retry logic for network errors
  - User-Agent customization
- **GraphQL Client** (`GraphQLClient`): Facebook GraphQL API client
  - WebGraphQL endpoint support (`/webgraphql/query`) for user accounts
  - Batch query support via `/webgraphqlbatch`
  - Automatic form data encoding with Facebook-specific parameters
  - fb_dtsg and jazoest generation
  - Error handling with retryable detection

#### Messaging
- **Message Sender** (`MessageSender`):
  - Send text messages with full Unicode support
  - Rich text formatting (bold, italic, strikethrough, monospace)
  - @mentions with user tagging
  - Reply to messages
  - Message forwarding
  - Silent messages
  - Sticker sending
  - Emoji reactions
  - Typing indicators
  - Mark as read/delivered
- **Message Operations**:
  - Edit messages
  - Unsend/delete messages
  - React to messages (7 reaction types: like, love, haha, wow, sad, angry, care)
  - Message history retrieval with pagination

#### Thread & Group Management
- **Thread Manager** (`ThreadManager`):
  - Get thread list (inbox, archive, pending, other folders)
  - Get thread info and metadata
  - Create new groups
  - Add/remove participants
  - Promote/demote admins
  - Set nicknames
  - Change thread color (30+ color options)
  - Change thread emoji
  - Change thread name
  - Pin/unpin messages
  - Archive/unarchive threads
  - Mute/unmute threads
  - Leave groups
  - Delete threads
  - Message history with pagination

#### User Management
- **User Manager** (`UserManager`):
  - Get user info/profiles
  - Search for users
  - Get friends list
  - Send/accept/decline/cancel friend requests
  - Unfriend users
  - Block/unblock users
  - Get blocked list
  - Get birthdays (today, upcoming, recent)
  - Get user presence/online status

#### Event System
- **Comprehensive Event Types**:
  - `message` - New message received
  - `message_reaction` - Message reaction added/removed
  - `typ` - Typing indicator
  - `read_receipt` - Message read
  - `delivery_receipt` - Message delivered
  - `presence` - User online status change
  - `thread_rename` - Thread name changed
  - `thread_color` - Thread color changed
  - `thread_emoji` - Thread emoji changed
  - `thread_image` - Thread image changed
  - `thread_nickname` - Nickname changed
  - `thread_add_participants` - Participants added
  - `thread_remove_participants` - Participants removed
  - `thread_promote` - Admin promoted
  - `thread_demote` - Admin demoted
  - `thread_leave` - User left group
  - `friend_request` - New friend request
  - `friend_accept` - Friend request accepted
  - `friend_remove` - Friend removed
  - `block` / `unblock` - Block events
  - `call` - Voice/video call events
  - `story` - Story updates
  - `poll` - Poll events
  - `event` - Event planner events
  - `connect` / `disconnect` - Connection events
  - `error` - Error events
- **EventEmitter Integration**: Standard Node.js EventEmitter with typed events

#### Utilities
- **Logger** (`Logger`): Comprehensive logging system
  - Log levels: silent, error, warn, info, debug, verbose
  - Specialized loggers for messages, events, API calls, MQTT, auth
  - Timestamp and prefix support
- **Constants** (`Constants`): 
  - Facebook API endpoints
  - MQTT broker URLs
  - Error codes
  - Thread colors
  - Reaction emojis and IDs
  - File size limits
  - Rate limits
  - Reconnection settings
- **Helpers** (`Helpers`):
  - Random string/UUID generation
  - fb_dtsg extraction from HTML
  - User ID extraction
  - Cookie parsing
  - URL building
  - Retry with backoff
  - MIME type detection

#### Type Definitions
- Complete TypeScript definitions for:
  - Authentication types (Cookie, AppState, Session, Credentials)
  - Message types (Message, Attachment, Reaction, Mention)
  - Thread types (Thread, Participant, ThreadColor)
  - User types (User, Profile, FriendRequest)
  - Media types (Upload options, Sticker, GIF)
  - Event types (All 30+ event types)
  - API types (GraphQL request/response, errors)

#### Media Handling
- **Image Upload**: Full implementation with base64 encoding
  - Support for JPG, PNG, GIF, WebP formats
  - Width/height/quality options
  - Automatic MIME type detection
- **Video Upload**: Complete video upload functionality
  - Support for MP4, MOV, AVI formats
  - Thumbnail support
  - Duration metadata
- **Audio Upload**: Voice messages and audio files
  - Voice mail support
  - Duration tracking
- **Document Upload**: All document types
  - PDF, DOC, XLS, PPT, TXT, ZIP support
- **Download Attachment**: Full download implementation
  - Buffer-based download
  - Content-Type detection
  - Filename extraction from headers

#### Polls
- **Create Poll**: Full poll creation with:
  - Multiple choice options
  - Question and duration settings
  - Multiple choice support
- **Vote Poll**: Complete voting system
- **Get Poll Results**: Retrieve poll statistics with voter information

#### Events
- **Create Event**: Full event creation with:
  - Name, description, location
  - Start/end time support
  - Cover image support
  - Guest count tracking
- **RSVP to Event**: Complete RSVP system (going, maybe, can't go)

#### Stories
- **Get Stories**: Retrieve stories from users
  - Image, video, text story types
  - Author information
  - Expiration tracking
  - Seen by list
  - Reactions support
- **View Story**: Mark stories as viewed

#### Calls
- **Initiate Call**: Full call initiation
  - Voice and video call support
  - Call ID generation
  - Status tracking

#### Security Features
- Environment variable support for `FACEBOOK_APPSTATE`
- No hardcoded credentials
- Session persistence optional
- Cookie validation

### Changed
- N/A (Initial release)

### Deprecated
- N/A (Initial release)

### Removed
- N/A (Initial release)

### Fixed
- N/A (Initial release)

### Security
- AppState can be provided via environment variable (`FACEBOOK_APPSTATE`) for secure hosting
- Session files are optional
- Cookie validation before use

---

## Release Notes

### v1.0.0 - Initial Release

This is the first stable release of Panindigan, a fully-featured unofficial Facebook Chat API library for TypeScript. The library provides:

1. **True MQTT Implementation**: Unlike other libraries that use HTTP polling, Panindigan uses genuine MQTT over WebSocket for real-time messaging.

2. **Universal Cookie Support**: Accepts cookies from any source without conversion - browser extensions, other FCA libraries, or manual extraction.

3. **TypeScript First**: Built from the ground up with TypeScript for maximum type safety and developer experience.

4. **Production Ready**: Designed for 24/7 uptime with automatic reconnection, error recovery, and comprehensive logging.

5. **Secure Hosting**: Support for environment variables to keep credentials safe on hosting platforms.

### Migration from other FCA libraries

To migrate from `fca-unofficial` or `facebook-chat-api`:

```typescript
// Old way (fca-unofficial)
const login = require('fca-unofficial');
login({ appState: JSON.parse(fs.readFileSync('appstate.json')) }, (err, api) => {
  // ...
});

// New way (panindigan)
import { login } from 'panindigan';
const api = await login({
  appState: process.env.FACEBOOK_APPSTATE // or JSON from file
});
```

### Known Limitations

- Credential login (email/password) is not implemented due to Facebook's complex login flow. Use AppState/cookies instead.
- 2FA and checkpoint handling are placeholders for future implementation.

### Completed Features

- [x] Full media upload implementation (images, videos, audio, documents)
- [x] Complete poll management (create, vote, get results)
- [x] Event planner integration (create events, RSVP)
- [x] Story viewing
- [x] Voice/video call initiation

### Future Roadmap

- [ ] Marketplace integration
- [ ] Page messaging support (currently user accounts only)
