---
name: CircuitBreaker typed error wrapping
description: CircuitBreaker.execute() throws a plain Error when OPEN; must be caught and re-thrown as NetworkError in RequestHandler.
---

## Rule
Wrap `circuitBreaker.execute()` in a try/catch in `RequestHandler.executeRequest()`.
When caught error message contains `'Circuit breaker is OPEN'`, re-throw as `new NetworkError(msg, 0, { circuitOpen: true })`.

**Why:** `CircuitBreaker.execute()` throws `new Error('Circuit breaker is OPEN for …')` — a plain, untyped error.
Callers that check `error instanceof NetworkError` or `error.retryable` get wrong results, breaking retry logic.

**How to apply:**
```ts
try {
  return await this.circuitBreaker.execute(fn, context);
} catch (error: unknown) {
  if (error instanceof Error && error.message.includes('Circuit breaker is OPEN')) {
    throw new NetworkError(error.message, 0, { circuitOpen: true });
  }
  throw error;
}
```

Do NOT modify CircuitBreaker itself — it is a generic utility that shouldn't depend on Panindigan error types.
