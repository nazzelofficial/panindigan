---
  name: Facebook lsd token vs fb_dtsg
  description: Facebook GraphQL/comet-ajax calls need a real lsd token separate from fb_dtsg; fabricating or omitting it causes "please try closing and re-opening your browser window" errors
  ---

  Facebook's `lsd` token is a real, page-load-bound security token distinct from `fb_dtsg`. It must be extracted from actual HTML (regex against `"lsd":\s*"([a-zA-Z0-9_-]+)"`) the same way `fb_dtsg` is, and re-extracted on session refresh — never randomly generated and never left empty.

  **Why:** Sending a missing or fabricated `lsd` on GraphQL/formPost calls makes Facebook treat the request as a stale/invalid browser session, surfacing as: "Please try closing and re-opening your browser window."

  **How to apply:** Any new login path or token-refresh path that extracts `fb_dtsg` should extract `lsd` the same way and push it to both the request-header setter (e.g. `RequestHandler.setLsdToken`) and the GraphQL client's auth-token setter. Treat `lsd` and `fb_dtsg` as a pair — a fix to one path without the other reintroduces this bug.
  