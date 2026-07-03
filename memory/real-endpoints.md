---
name: Panindigan real Facebook endpoints
description: All Facebook form-encoded REST endpoints used by the library; which GraphQL fakes were replaced and with what real URLs.
---

## Rule
All Facebook operations use `formPost()` with real form-encoded POST endpoints.
Never use fabricated GraphQL query/mutation names — they do not exist server-side.

**Why:** The old code had fake GraphQL names (e.g. `FriendsQuery`, `BlockUserMutation`) that silently returned empty/synthetic data on every request.

**How to apply:** When adding a new operation, find the real Messenger Web endpoint in `Constants.ts` or add one. Never call `graphqlClient.query()` / `graphqlClient.mutation()` with an invented name.

## Real endpoint map (as of 1.2.4)

### Messaging
- Send: `POST /messaging/send/`
- Unsend: `POST /messaging/unsend_message/`
- Edit: `POST /messaging/edit_message/`
- Forward: `POST /messaging/forward_message/`
- Reaction: `POST /messaging/message_reactions/`

### Polls
- Create poll: `POST /messaging/create_poll/`
- Vote: `POST /messaging/update_vote/`
- Results: `POST /ajax/messaging/poll_info.php` (`poll_id=<id>`)

### Messenger Event Planner
- Create: `POST /messaging/create_event/` (params: `thread_fbid`, `title`, `start_time` in seconds, `end_time`, `location`, `note`)
- RSVP: `POST /messaging/update_event_rsvp/` (params: `event_id`, `rsvp_status`: going|maybe|cant_go)

### Calls
- Initiate: `POST /messaging/call/` (params: `thread_fbid`, `call_type`: video|audio)
- Signaling: MQTT `/t_rtc` and `/webrtc` topics

### Stories
- Get: `POST /ajax/stories/` (params: `action=get_stories`, optionally `user_id`)
- View: `POST /ajax/stories/seen/` (params: `story_ids[0]=<id>`)

### User / Social
- User info: `POST /chat/user_info/` (params: `ids[N]=<uid>`)
- Friends list: `POST /ajax/mercury/friends_info.php` (params: `order=top_friends`, `start_index`, `num_friends`)
- Sent friend requests: `POST /ajax/social-privacy/friend-request-page.php` (params: `type=outgoing`, `offset`, `count`)
- Block/unblock: `POST /ajax/profile/userblockunblock.php` (params: `uid`, `block_action=block|unblock`, `block_surface_id=2`)
- Blocked list: `POST /settings/blocking/ajax/` (params: `action=get_list`)
- Birthdays: `POST /ajax/birthday/notification/` (params: `action=get_birthdays`)
- Presence (REST poll): `POST /ajax/mercury/chat_online_presences.php` (params: `ids[0]=<uid>`; response: `payload.presences[uid].p` (2=active,0=idle), `.la` = last active in seconds)
- Real-time presence: MQTT `/t_p` topic (use `parseAllPresence()` — see mqtt-presence-fanout.md)

## Presence response shape
```json
{ "payload": { "presences": { "<uid>": { "p": 2, "la": 1720000000 } } } }
```
`p`: 2=active, 0=idle, other=offline. `la`: last active Unix timestamp in seconds (multiply by 1000 for ms).
