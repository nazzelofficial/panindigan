---
name: MQTTClient topic sync
description: subscribeToTopics() must contain the full MQTT_TOPICS list; the broker URL no longer carries topics.
---

The rule: whenever a topic is added to `MQTT_TOPICS` in Constants.ts, it must be added to `subscribeToTopics()` in both MQTTClient.ts and FastMQTT.ts.

**Why:** `subscribeToTopics()` sends MQTT SUBSCRIBE packets after CONNACK — that's the only place topics are declared to the broker. (As of 1.2.5, `buildBrokerUrl()` no longer encodes a topic list in the WebSocket URL — see `mqtt-real-protocol.md`. The URL only needs `sid`/`cid`/`region`.)

**How to apply:** The full required topic list as of v1.2.5: MESSAGE_SYNC, RTC, PRESENCE, TYPING, GRAPHQL, MESSAGING_EVENTS, NOTIFY, REGION_HINT, ORCA_PRESENCE, ORCA_TYPING, ORCA_MESSAGES, WEBRTC, WEBRTC_RESPONSE, personal `mqtt_c2b_<userId>`, SUBSCRIPTION, ADMIN_TEXT, PRESENCE_EXTENDED, MESSAGE_BODY, DELTA.
