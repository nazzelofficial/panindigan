---
name: MQTT bulk presence fan-out pattern
description: How to correctly handle /t_p bulk presence maps so all UIDs are emitted, not just the first one.
---

## Rule
Always use `EventParser.parseAll(topic, payload)` in MQTT message handlers, not `parse()`.
Both `MQTTClient.parseAndEmitEvent()` and `FastMQTT.handlePublish()` must iterate the returned array.

**Why:** Facebook's `/t_p` topic sends a single payload that is a bulk map `{ "<uid>": { "p": 2, "lat": … }, … }`.
`parse()` returns only the first PresenceEvent; `parseAll()` returns one per UID.
Using `parse()` silently drops all but the first presence update in a bulk map.

**How to apply:**
```ts
// CORRECT — in any MQTT message handler:
const events = this.eventParser.parseAll(topic, payload);
for (const event of events) {
  this.emit(event.type, event);
  this.emit('event', event);
}

// WRONG — drops bulk presence:
const event = this.eventParser.parse(topic, payload);
if (event) { this.emit(event.type, event); }
```

`parseAll()` is safe for all topics: non-presence topics return 0–1 events same as before.
Only `/t_p` and `/orca_presence` actually return multiple events.
