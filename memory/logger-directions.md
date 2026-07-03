---
name: Logger logMessage directions
description: Logger.logMessage() only accepts the literal union 'sent' | 'received' — no other strings.
---

The rule: always pass `'sent'` for any outgoing message log call, regardless of the send variant (location, contact, GIF, forward, etc.).

**Why:** `logMessage(direction: 'sent' | 'received', ...)` is strictly typed. Passing `'sent-location'` or `'sent-contact'` causes TS2345 at build time.

**How to apply:** Use `logger.logMessage('sent', threadId, messageId, body)` for all outgoing paths in MessageSender. Sub-type information (location vs contact) can go in the body string or in a separate `logger.debug()` call.
