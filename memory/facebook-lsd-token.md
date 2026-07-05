---
  name: Facebook lsd token vs fb_dtsg
  description: Facebook GraphQL/comet-ajax calls need a real lsd token separate from fb_dtsg; fabricating, omitting, or mis-extracting it causes "please try closing and re-opening your browser window" errors
  ---

  Facebook's `lsd` token is a real, page-load-bound security token distinct from `fb_dtsg`. It must be extracted from actual HTML and re-extracted on session refresh — never randomly generated and never left empty.

  **Correct extraction pattern:** Facebook does NOT embed `lsd` as a plain JSON key (`"lsd":"..."`) — that pattern never matches real Facebook HTML. It ships as a Haste/Relay module bootstrap tuple: `["LSD",[],{"token":"XXXX"},N]`. The regex must target `"LSD",\[\],\{"token":"([^"]+)"` (module name `"LSD"`, not an object key). Confirmed against a real production FCA library (`@neoaz07/nkxfca`'s buildAPI.js/tokenRefresh.js). A `name="lsd" value="..."` hidden-field fallback covers legacy non-Comet pages.

  **Why:** Sending a missing or fabricated `lsd` on GraphQL/formPost calls makes Facebook treat the request as a stale/invalid browser session, surfacing as: "Please try closing and re-opening your browser window." Using the wrong regex pattern (plain `"lsd":"..."` key) silently fails extraction 100% of the time regardless of network/redirect/compression behavior — don't chase transport-layer causes for this symptom before checking the regex itself.

  **How to apply:** Any new login path or token-refresh path that extracts `fb_dtsg` should extract `lsd` via a shared helper (`extractLsd()` in Helpers.ts) and push it to both the request-header setter (e.g. `RequestHandler.setLsdToken`) and the GraphQL client's auth-token setter. Treat `lsd` and `fb_dtsg` as a pair — a fix to one path without the other reintroduces this bug. If `lsd`/revision fingerprint are missing from the homepage response, fall back to fetching the Messenger inbox page (`/messages/t/`) before giving up — the homepage can serve a stripped-down shell missing the whole bootstrap blob.
  