---
name: Error subclass readonly fields
description: PanindiganError base class marks code/statusCode/retryable as readonly — subclasses cannot reassign after super().
---

The rule: pass the specific code string as the second argument to `super()`. Do NOT assign `this.code = '...'` in a subclass constructor — TypeScript will refuse it because the field is `readonly`.

**Why:** `PanindiganError` declares `readonly code: string` so the value is frozen after the base constructor runs. Reassignment in a subclass body fires TS2540 at compile time.

**How to apply:** Every specialised error subclass (`SessionExpiredError`, `TwoFactorRequiredError`, `TimeoutError`, etc.) must supply its error code as the second positional argument to `super(message, 'MY_CODE', statusCode, retryable, data)`. Also call `Object.setPrototypeOf(this, new.target.prototype)` for correct `instanceof` in ESM.
