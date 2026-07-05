---
name: MQTT reconnect pattern
description: MQTTClient.ts is the client wired into PanindiganFCA; its reconnect/health-check logic should mirror FastMQTT.ts's proven pattern.
---

`FastMQTT.ts` already had a robust reconnect implementation (exponential backoff with jitter, a periodic stale-connection health check, `isManuallyDisconnected` tracking so manual disconnects never trigger auto-reconnect). `MQTTClient.ts` is the client actually instantiated by `PanindiganFCA` (`src/core/PanindiganFCA.ts`), and it originally only had a much weaker linear backoff with no health check.

**Why:** relying only on the WebSocket `close` event to trigger reconnect is not enough — Facebook's broker can leave a connection half-open (no close frame ever arrives) after a network hiccup, silently stranding the client in a broken "connected" state with no automatic recovery.

**How to apply:** when touching reconnect/keepalive/health-check behavior in either MQTT client file, keep the two implementations consistent — same exponential-backoff-with-jitter formula, same stale-connection health check (ping after missing packets past 2x keepalive, force-reconnect past 5x keepalive), and the same `isManuallyDisconnected` guard. If one file gets an improvement, check whether the other needs it too.
