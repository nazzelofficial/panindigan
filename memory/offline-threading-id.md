---
name: Offline threading ID generation
description: How to generate valid Facebook Messenger offline_threading_id values
---

Formula: `(BigInt(Date.now()) << 22n) | BigInt(Math.floor(Math.random() * 0x3FFFFF))`

Upper 42 bits = timestamp in milliseconds. Lower 22 bits = random.
Result must be returned as `.toString()` (decimal string) for the form payload.

**Why:** JavaScript numbers cannot represent 64-bit integers precisely. Using plain
`Date.now() * Math.pow(2, 22)` loses the lower bits due to float precision. BigInt
is mandatory. The function lives in src/utils/Helpers.ts as `generateOfflineThreadingId()`.

**How to apply:** Call generateOfflineThreadingId() in MessageSender.sendMessage() —
one ID per outgoing message. Never reuse the same ID across sends.
