---
name: Facebook build/revision fingerprint (__spin_r/__spin_b/__spin_t/__hsi)
description: Comet-era Facebook ajax/GraphQL endpoints validate __rev/__spin_r/__spin_b/__spin_t/__hsi against real page HTML; hardcoded or random values are rejected the same way a missing lsd is.
---

Facebook's `/webgraphql/query`, `/webgraphqlbatch`, and other Comet-era ajax
endpoints check a build/revision fingerprint on every POST: `__rev`,
`__spin_r`, `__spin_b`, `__spin_t`, and the haste session id `__hsi`. These
must be extracted from the real HTML Facebook just served (regex on
`"__spin_r":(\d+)`, `"__spin_b":"([^"]+)"`, `"__spin_t":(\d+)`,
`"__hsi":"(\d+)"`), never hardcoded (e.g. `__rev: '100'`) or randomly
generated.

**Why:** A fabricated or stale fingerprint produces the exact same generic
`GraphQLError: Please try closing and re-opening your browser window.` as a
missing/fake `lsd` token — it looks like a session/auth bug but is actually
a build-fingerprint mismatch. This bit Panindigan even after `lsd` was fixed
correctly (see `facebook-lsd-token.md`).

**How to apply:** Treat `__rev`/`__spin_r`/`__spin_b`/`__spin_t`/`__hsi` as
page-load-bound tokens with the same lifecycle as `fb_dtsg`/`lsd`: extract on
login, re-extract on every session refresh, and push into whatever client
issues the ajax/GraphQL requests. If extraction fails, fail loudly (throw)
rather than falling back to a placeholder value.
