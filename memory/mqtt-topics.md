---
name: MQTTClient topic sync
description: subscribeToTopics() and buildBrokerUrl() must contain the same MQTT_TOPICS list or the broker drops some event streams.
---

The rule: whenever a topic is added to `MQTT_TOPICS` in Constants.ts, it must be added to **both** `subscribeToTopics()` and the topics array inside `buildBrokerUrl()` in MQTTClient.ts.

**Why:** `buildBrokerUrl()` encodes the topic list as URL query params used during the WebSocket handshake. `subscribeToTopics()` sends MQTT SUBSCRIBE packets after CONNACK. They must match or the broker only delivers events for topics that appear in both places.

**How to apply:** The full required topic list as of v1.3.0: MESSAGE_SYNC, RTC, PRESENCE, TYPING, GRAPHQL, MESSAGING_EVENTS, NOTIFY, REGION_HINT, ORCA_PRESENCE, ORCA_TYPING, ORCA_MESSAGES, WEBRTC, WEBRTC_RESPONSE, personal `mqtt_c2b_<userId>`, SUBSCRIPTION, ADMIN_TEXT, PRESENCE_EXTENDED, MESSAGE_BODY, DELTA.
