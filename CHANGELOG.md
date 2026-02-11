# Changelog

All notable changes to the Panindigan project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.6] - 2026-02-11

### Fixed

- **Cookie Parsing & Authentication** (`src/auth/CookieParser.ts`, `src/auth/Authenticator.ts`)
  - Improved browser extension cookie format support (EditThisCookie, Cookie-Editor)
  - Added proper handling for `expirationDate` by converting it to ISO string
  - Fixed `hostOnly` detection to support both boolean and string values from different exporters
  - Enhanced cookie normalization with better error logging instead of throwing on minor issues
  - Improved login failure error messages to be more user-friendly when cookies are missing
  - Added detailed logging of available cookies when validation fails to help with troubleshooting

## [1.0.5] - 2026-02-11

### Fixed

- **MQTT Group Chat Support** (`src/mqtt/MQTTClient.ts`)
  - Increased MQTT connection timeout to 180 seconds for better group chat stability
  - Added mandatory URL parameters for initial MQTT connection (`device_id`, `initial_connection`, `bus_version`, `subscribe_topics`)
  - Improved group chat message synchronization by including topics in the initial connection URL
  - Fixed "MQTT connection timeout" issues reported by users when connecting to large group chats
  - Optimized broker URL construction with full parameter set for better reliability

## [1.0.4] - 2026-02-11

### Fixed

- **MQTT WebSocket Connection Stability** (`src/mqtt/MQTTClient.ts`)
  - Added comprehensive debug logging for WebSocket open/error events
  - Improved error handling with WebSocket state detection (CONNECTING, OPEN, CLOSING, CLOSED)
  - Fixed race condition in timeout handler with `resolved` flag
  - Added more browser-like headers to WebSocket connection (Referer, Connection, Upgrade)
  - Better error messages showing WebSocket state when timeout occurs
  - Prevents double-callback on connection completion

- **MQTT CONNECT Packet Handling** (`src/mqtt/MQTTClient.ts`)
  - Added detailed logging when sending CONNECT packet with packet size info
  - Improved error handling in sendConnect() method with try-catch
  - Added null check for WebSocket before sending CONNECT
  - Better error propagation when CONNECT packet fails
  - Detailed logging of CONNECT packet success

- **MQTT CONNACK Packet Parsing** (`src/mqtt/MQTTClient.ts`)
  - Added clear error messages for MQTT connection refusal codes (1-5)
  - Maps refusal codes to human-readable reasons
  - Distinguishes between protocol errors (codes 1-3) and authentication errors (codes 4-5)
  - Better logging showing exact reason for connection failure
  - Helps identify cookie validity issues vs network issues

## [1.0.3] - 2026-02-11

### Fixed

- **MQTT Packet Variable-Length Encoding** (`src/mqtt/MQTTClient.ts`)
  - Fixed critical bug where MQTT CONNECT, SUBSCRIBE, and PUBLISH packets used single-byte remaining-length encoding
  - Implemented proper MQTT variable-length encoding to support packet sizes > 127 bytes
  - Added `encodeRemainingLength()` method following MQTT v3.1.1 specification
  - Fixes 60-second timeout errors when connecting to Facebook MQTT broker
  - Proper handling of 7-bit values with continuation bits for multi-byte encoding

- **Group Chat Message Parsing** (`src/events/EventParser.ts`)
  - Fixed `parseMessageSync()` to handle both single and array delta structures from Facebook
  - Improved thread ID extraction to work for both 1-1 chats (`otherUserFbId`) and group chats (`threadFbId`)
  - Added support for message attachments and mentions parsing from delta
  - Proper `isGroup` flag detection based on thread key structure
  - Added helper methods: `parseDelta()`, `parseDirectDelta()`, `extractThreadId()`, `parseAttachments()`, `parseMentions()`
  - Better error handling with detailed logging for parsing failures

- **MQTT Topic Subscriptions for Group Chats** (`src/mqtt/MQTTClient.ts`)
  - Added subscription to additional critical topics: `/t_sb`, `/t_admin_text`, `/t_presence`, `/t_msg_body`, `/t_delta`
  - Per-subscription error handling prevents total failure if one subscription fails
  - Improved logging for subscription status per topic
  - Ensures complete coverage for group chat events and updates

- **MQTT Connection Timeout for Group Chats** (`src/mqtt/MQTTClient.ts`)
  - Increased connection timeout from 60 to 120 seconds to accommodate group chat setup and cookie validation
  - Better handling of slow network conditions during MQTT broker authentication
  - Prevents premature timeouts when connecting with valid but slow connections

- **MQTT Message Event Logging** (`src/core/PanindiganFCA.ts`)
  - Added comprehensive debug logging in `handleMQTTMessage()` to help diagnose group chat issues
  - Logs payload preview (first 200 characters) for debugging without exposing full payloads
  - Logs JSON parsing status, event type, and thread ID for each received message
  - Detailed error logging with context when message handling fails
  - Enables easier troubleshooting of group chat problems through debug logs

## [1.0.2] - 2026-02-11

### Added

#### Authentication Features (`src/auth/`)
- **Real Credential Login Implementation** (`Authenticator.loginWithCredentials()`)
  - Full email/password authentication flow
  - Automatic extraction of login tokens (fb_dtsg, lsd) from login page
  - Proper form data encoding for login requests
  - Automatic 2FA detection and handling during login
  - Security checkpoint detection
  - Automatic cookie jar management

- **2FA (Two-Factor Authentication) Implementation** (`Authenticator.handleTwoFactor()`)
  - Support for TOTP, SMS, and email 2FA methods
  - Automatic form token extraction
  - 2FA code submission and validation
  - Session cookie update after successful verification
  - Proper error handling for invalid codes

- **Security Checkpoint Resolution** (`Authenticator.handleCheckpoint()`)
  - Security checkpoint detection and handling
  - Multiple verification methods support (email, SMS, authenticator)
  - Device listing from checkpoint
  - Automatic session recovery after checkpoint resolution
  - User-friendly error messages with next steps

#### Media System (`src/media/`)
- **Real Attachment Download Implementation** (`MediaUploader.downloadAttachment()`)
  - Full HTTP REST API-based file downloading
  - Proper Content-Type and filename extraction
  - Graceful filename fallback from URL
  - Full error handling and logging
  - Support for all attachment types (images, videos, documents, etc.)

#### API Enhancements (`src/api/`)
- **GraphQL Client Enhancement**
  - Added `getRequestHandler()` method to expose request handler for other components
  - Enables cleaner separation of concerns for media operations

### Changed

#### Cookie Handling
- **Improved Cookie Parser Detection** (`CookieParser.detectFormat()`)
  - Browser extension format now has priority detection for `expirationDate` property
  - Better detection of EditThisCookie and Cookie-Editor formats
  - Enhanced type checking for all format variations

- **Enhanced Cookie Normalization** (`CookieParser.normalizeCookie()`)
  - Better handling of value type coercion
  - Improved string conversion for various value types
  - More robust parsing of different cookie object structures

#### Authentication Logging
- **Enhanced Logging in Authentication** (`Authenticator.loginWithAppState()`)
  - Debug logging of parsed cookies with cookie names list
  - Validation result logging showing required vs found cookies
  - fb_dtsg and iris sequence ID extraction logging
  - Warning logs for missing iris sequence ID with fallback explanation

- **Improved MQTT Connection Error Messages** (`MQTTClient.connect()`)
  - Detailed timeout error messages with debugging suggestions
  - Connection failure logging includes clientId and userId for diagnostics
  - Helpful error messages guiding users to check cookie validity

### Fixed

- **Cookie Encoding in MQTT WebSocket Headers**
  - Removed incorrect URL encoding from cookie header
  - HTTP Cookie header format now follows RFC 6265 standard
  - Cookies sent as plain name=value format without encoding

- **MQTT irisSeqId Fallback**
  - Added intelligent fallback when irisSeqId is not available
  - Uses Unix timestamp as sequence ID if irisSeqId is '0' or missing
  - Improves MQTT connection reliability

- **TypeScript Compilation Errors**
  - Fixed regex pattern line break issue in 2FA implementation
  - Removed unused variable declarations
  - Full type compliance with no compiler errors

## [1.0.1] - 2026-02-11

### Added

#### Event System (`src/events/`)
- **EventParser class** - Fully implemented event parsing system for MQTT messages
  - Parse message sync events (`/t_ms`) into typed MessageEvent objects
  - Parse RTC/call events (`/t_rtc`) into CallEvent objects
  - Parse presence updates (`/t_p`) into PresenceEvent objects
  - Parse typing notifications (`/t_tn`) into TypingEvent objects
  - Parse GraphQL events (`/t_graphql`) for thread updates (rename, color, emoji, image, nickname)
  - Parse participant events (add/remove participants, promote/demote admins)
  - Parse messaging events for read/delivery receipts
  - Parse C2B (Client to Business) events for personal messages
  - Proper TypeScript typing for all event types with full type safety

#### Media Handling (`src/media/`)
- **MediaUploader class** - Fully implemented media upload system
  - `uploadImage()` - Upload images with base64 encoding, supports width/height/quality options
  - `uploadVideo()` - Upload videos with optional thumbnail support
  - `uploadAudio()` - Upload audio files with voice mail support
  - `uploadDocument()` - Upload documents (PDF, DOC, etc.)
  - All methods use real GraphQL mutations (ImageUploadMutation, VideoUploadMutation, etc.)
  - Proper error handling and fallback attachment IDs

### Changed

#### Code Architecture
- **Refactored MQTTClient** to use EventParser for all event parsing
  - Removed duplicate parsing logic from MQTTClient
  - Added `getEventParser()` and `parseEvent()` methods for external access
  - Events now properly typed and emitted with correct event types
- **Refactored PanindiganFCA** to use MediaUploader for all media operations
  - Removed duplicate upload logic from PanindiganFCA
  - Added `getMediaUploader()` private method
  - All upload methods (uploadImage, uploadVideo, uploadAudio, uploadDocument) now delegate to MediaUploader

### Fixed

#### MQTT Connection Stability
- **Increased connection timeout** from 30 seconds to 60 seconds to accommodate slower network conditions
- **Fixed memory leak warnings** by setting max listeners to 50 in MQTTClient constructor
- **Improved connection error handling** with better cleanup of event listeners on timeout
- **Enhanced error messages** to provide more helpful guidance when connection fails
- **Added debug logging** for MQTT connection details to help diagnose connection issues
- **Fixed cookie encoding** in MQTT WebSocket connection - cookies are now properly URL-encoded
- **Improved WebSocket headers** with additional browser-like headers for better compatibility
- **Added cookie validation** to filter out invalid cookies before building cookie header

## [1.0.0] - 2026-02-10

### Important Note

**This release is specifically for Facebook Messenger USER ACCOUNTS and GROUP CHATS.**

This library is NOT for Facebook Pages. It uses the `webgraphql/query` endpoint designed for personal Facebook accounts, not the `api/graphql` endpoint used by Facebook Pages.

Supported:
- Personal Facebook account messaging
- Messenger group chats
- Direct messages between users

Not Supported:
- Facebook Page messaging
- Business account messaging

### Added

#### Core Infrastructure
- **TypeScript First Architecture**: Complete type safety with comprehensive type definitions for all API methods, events, and data structures
- **Node.js 22.22.0 Support**: Optimized for latest Node.js with native ESM support and modern JavaScript features
- **Project Structure**: Modular architecture with separate directories for auth, mqtt, api, messaging, media, threads, users, events, types, and utils

#### Authentication System
- **Universal Cookie Parser** (`CookieParser`): Support for all cookie formats including:
  - c3c-fbstate format
  - fca-unofficial/facebook-chat-api format
  - EditThisCookie browser extension
  - Cookie-Editor browser extension
  - J2Team Cookies
  - Raw cookie strings
  - Auto-detection of cookie formats
- **Session Manager** (`SessionManager`): Full session persistence with:
  - Automatic session validation
  - Session refresh every 30 minutes
  - Multi-account support
  - Session recovery from file
- **Authenticator** (`Authenticator`): Main authentication handler with:
  - AppState-based login (primary method)
  - Environment variable support (`FACEBOOK_APPSTATE`) for secure hosting
  - Automatic fb_dtsg and irisSeqId extraction

#### MQTT Real-Time System
- **True MQTT Implementation** (`MQTTClient`): Genuine MQTT over WebSocket (not HTTP polling)
  - WebSocket connection to Facebook MQTT brokers
  - MQTT protocol implementation (CONNECT, SUBSCRIBE, PUBLISH, PING)
  - Binary packet parsing for Facebook-specific formats
  - Keep-alive handling
- **Connection Management**:
  - Automatic reconnection with exponential backoff
  - Connection state monitoring
  - Message queuing for offline messages
  - Configurable max reconnect attempts (default: 10)
- **Event Subscription**: Automatic subscription to:
  - `/t_ms` - Message sync
  - `/t_rtc` - Real-time calls
  - `/t_p` - Presence updates
  - `/t_tn` - Typing notifications
  - `/t_graphql` - GraphQL events
  - `/t_messaging_events` - Messaging events
  - Personal C2B topic for user

#### API Layer
- **Request Handler** (`RequestHandler`): HTTP client with:
  - Cookie jar integration (tough-cookie)
  - Automatic cookie storage from responses
  - Timeout handling with AbortController
  - Retry logic for network errors
  - User-Agent customization
- **GraphQL Client** (`GraphQLClient`): Facebook GraphQL API client
  - WebGraphQL endpoint support (`/webgraphql/query`) for user accounts
  - Batch query support via `/webgraphqlbatch`
  - Automatic form data encoding with Facebook-specific parameters
  - fb_dtsg and jazoest generation
  - Error handling with retryable detection

#### Messaging
- **Message Sender** (`MessageSender`):
  - Send text messages with full Unicode support
  - Rich text formatting (bold, italic, strikethrough, monospace)
  - @mentions with user tagging
  - Reply to messages
  - Message forwarding
  - Silent messages
  - Sticker sending
  - Emoji reactions
  - Typing indicators
  - Mark as read/delivered
- **Message Operations**:
  - Edit messages
  - Unsend/delete messages
  - React to messages (7 reaction types: like, love, haha, wow, sad, angry, care)
  - Message history retrieval with pagination

#### Thread & Group Management
- **Thread Manager** (`ThreadManager`):
  - Get thread list (inbox, archive, pending, other folders)
  - Get thread info and metadata
  - Create new groups
  - Add/remove participants
  - Promote/demote admins
  - Set nicknames
  - Change thread color (30+ color options)
  - Change thread emoji
  - Change thread name
  - Pin/unpin messages
  - Archive/unarchive threads
  - Mute/unmute threads
  - Leave groups
  - Delete threads
  - Message history with pagination

#### User Management
- **User Manager** (`UserManager`):
  - Get user info/profiles
  - Search for users
  - Get friends list
  - Send/accept/decline/cancel friend requests
  - Unfriend users
  - Block/unblock users
  - Get blocked list
  - Get birthdays (today, upcoming, recent)
  - Get user presence/online status

#### Event System
- **Comprehensive Event Types**:
  - `message` - New message received
  - `message_reaction` - Message reaction added/removed
  - `typ` - Typing indicator
  - `read_receipt` - Message read
  - `delivery_receipt` - Message delivered
  - `presence` - User online status change
  - `thread_rename` - Thread name changed
  - `thread_color` - Thread color changed
  - `thread_emoji` - Thread emoji changed
  - `thread_image` - Thread image changed
  - `thread_nickname` - Nickname changed
  - `thread_add_participants` - Participants added
  - `thread_remove_participants` - Participants removed
  - `thread_promote` - Admin promoted
  - `thread_demote` - Admin demoted
  - `thread_leave` - User left group
  - `friend_request` - New friend request
  - `friend_accept` - Friend request accepted
  - `friend_remove` - Friend removed
  - `block` / `unblock` - Block events
  - `call` - Voice/video call events
  - `story` - Story updates
  - `poll` - Poll events
  - `event` - Event planner events
  - `connect` / `disconnect` - Connection events
  - `error` - Error events
- **EventEmitter Integration**: Standard Node.js EventEmitter with typed events

#### Utilities
- **Logger** (`Logger`): Comprehensive logging system
  - Log levels: silent, error, warn, info, debug, verbose
  - Specialized loggers for messages, events, API calls, MQTT, auth
  - Timestamp and prefix support
- **Constants** (`Constants`): 
  - Facebook API endpoints
  - MQTT broker URLs
  - Error codes
  - Thread colors
  - Reaction emojis and IDs
  - File size limits
  - Rate limits
  - Reconnection settings
- **Helpers** (`Helpers`):
  - Random string/UUID generation
  - fb_dtsg extraction from HTML
  - User ID extraction
  - Cookie parsing
  - URL building
  - Retry with backoff
  - MIME type detection

#### Type Definitions
- Complete TypeScript definitions for:
  - Authentication types (Cookie, AppState, Session, Credentials)
  - Message types (Message, Attachment, Reaction, Mention)
  - Thread types (Thread, Participant, ThreadColor)
  - User types (User, Profile, FriendRequest)
  - Media types (Upload options, Sticker, GIF)
  - Event types (All 30+ event types)
  - API types (GraphQL request/response, errors)

#### Media Handling
- **Image Upload**: Full implementation with base64 encoding
  - Support for JPG, PNG, GIF, WebP formats
  - Width/height/quality options
  - Automatic MIME type detection
- **Video Upload**: Complete video upload functionality
  - Support for MP4, MOV, AVI formats
  - Thumbnail support
  - Duration metadata
- **Audio Upload**: Voice messages and audio files
  - Voice mail support
  - Duration tracking
- **Document Upload**: All document types
  - PDF, DOC, XLS, PPT, TXT, ZIP support
- **Download Attachment**: Full download implementation
  - Buffer-based download
  - Content-Type detection
  - Filename extraction from headers

#### Polls
- **Create Poll**: Full poll creation with:
  - Multiple choice options
  - Question and duration settings
  - Multiple choice support
- **Vote Poll**: Complete voting system
- **Get Poll Results**: Retrieve poll statistics with voter information

#### Events
- **Create Event**: Full event creation with:
  - Name, description, location
  - Start/end time support
  - Cover image support
  - Guest count tracking
- **RSVP to Event**: Complete RSVP system (going, maybe, can't go)

#### Stories
- **Get Stories**: Retrieve stories from users
  - Image, video, text story types
  - Author information
  - Expiration tracking
  - Seen by list
  - Reactions support
- **View Story**: Mark stories as viewed

#### Calls
- **Initiate Call**: Full call initiation
  - Voice and video call support
  - Call ID generation
  - Status tracking

#### Security Features
- Environment variable support for `FACEBOOK_APPSTATE`
- No hardcoded credentials
- Session persistence optional
- Cookie validation

### Changed
- N/A (Initial release)

### Deprecated
- N/A (Initial release)

### Removed
- N/A (Initial release)

### Fixed
- N/A (Initial release)

### Security
- AppState can be provided via environment variable (`FACEBOOK_APPSTATE`) for secure hosting
- Session files are optional
- Cookie validation before use

---

## Release Notes

### v1.0.0 - Initial Release

This is the first stable release of Panindigan, a fully-featured unofficial Facebook Chat API library for TypeScript. The library provides:

1. **True MQTT Implementation**: Unlike other libraries that use HTTP polling, Panindigan uses genuine MQTT over WebSocket for real-time messaging.

2. **Universal Cookie Support**: Accepts cookies from any source without conversion - browser extensions, other FCA libraries, or manual extraction.

3. **TypeScript First**: Built from the ground up with TypeScript for maximum type safety and developer experience.

4. **Production Ready**: Designed for 24/7 uptime with automatic reconnection, error recovery, and comprehensive logging.

5. **Secure Hosting**: Support for environment variables to keep credentials safe on hosting platforms.

### Migration from other FCA libraries

To migrate from `fca-unofficial` or `facebook-chat-api`:

```typescript
// Old way (fca-unofficial)
const login = require('fca-unofficial');
login({ appState: JSON.parse(fs.readFileSync('appstate.json')) }, (err, api) => {
  // ...
});

// New way (panindigan)
import { login } from 'panindigan';
const api = await login({
  appState: process.env.FACEBOOK_APPSTATE // or JSON from file
});
```

### Known Limitations

- Credential login (email/password) is not implemented due to Facebook's complex login flow. Use AppState/cookies instead.
- 2FA and checkpoint handling are placeholders for future implementation.

### Completed Features

- [x] Full media upload implementation (images, videos, audio, documents)
- [x] Complete poll management (create, vote, get results)
- [x] Event planner integration (create events, RSVP)
- [x] Story viewing
- [x] Voice/video call initiation

### Future Roadmap

- [ ] Marketplace integration
- [ ] Page messaging support (currently user accounts only)
