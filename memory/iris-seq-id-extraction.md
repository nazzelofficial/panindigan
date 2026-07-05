---
name: Iris sequence id extraction
description: The real Iris sync sequence id is normally only present in the Messenger inbox page, not the plain Facebook homepage.
---

Facebook's general homepage (`www.facebook.com`) rarely embeds the Iris sync sequence id in its initial data blob — that value normally lives in the Messenger inbox page's data blob instead (`www.facebook.com/messages/t/`).

**Why:** early implementations only fetched the homepage and logged a `warn` when the id wasn't found there, which made a normal, expected condition look like a bug. Iris seq id absence on a homepage-only fetch is NOT an error — MQTT already handles it correctly by starting a fresh sync queue (`/messenger_sync_create_queue`) instead of fabricating a value.

**How to apply:** When extracting the Iris seq id (login, session refresh, etc.), try the homepage first, then fall back to fetching the Messenger inbox page and re-run the same extraction patterns before giving up. Log a homepage-only miss at `debug`, not `warn` — it's expected. Never fabricate a sequence id if both fetches miss; let MQTT fall back to a fresh sync queue.
