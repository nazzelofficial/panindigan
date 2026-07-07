#⚠️ Deprecated

This package is deprecated and is no longer under active development.

A new and actively maintained successor is now available:

👉 Please migrate to panindigan-fca

panindigan-fca is a complete rewrite built with a modern architecture, improved reliability, and long-term maintainability.

Why migrate?
🚀 Modern TypeScript-first architecture
💾 Automatic session persistence
🗄️ SQLite / LibSQL / Turso session storage
👥 Native multi-account support
🔄 Event-driven session lifecycle
🌐 Built-in HTTP, HTTPS, SOCKS4, and SOCKS5 proxy support
🔁 Automatic session refresh and recovery
⚡ Better performance, stability, and maintainability
📦 Designed for modern Node.js versions
🛠️ New features and continuous improvements
Maintenance Status

As a solo maintainer, I have decided to focus all future development on panindigan-fca.

Because of this:

❌ This package is no longer actively maintained.
❌ No new features will be added.
❌ No architectural improvements or major refactors will be made.
❌ Compatibility with future platform changes is not guaranteed.
❌ Feature requests and enhancement requests will no longer be accepted.
❌ Regular maintenance and updates have been discontinued.

Critical bug fixes may be provided at my discretion, but there are no guarantees of future updates or support.

For the best experience, improved stability, better performance, and all future development, please migrate to panindigan-fca.

All future features, improvements, optimizations, and long-term support are exclusively available in panindigan-fca.

Thank you to everyone who has used and supported this project over the years. Your support made this project possible, and I truly appreciate it. ❤️

# Panindigan

<p align="center">
  <strong>A Fully-Featured Unofficial Facebook Messenger Chat API Library for TypeScript</strong>
</p>

<p align="center">
  <em>For User Accounts & Group Chats - NOT Facebook Pages</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/panindigan"><img src="https://img.shields.io/npm/v/panindigan.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/panindigan"><img src="https://img.shields.io/npm/dm/panindigan.svg" alt="npm downloads"></a>
  <a href="https://www.npmjs.com/package/panindigan"><img src="https://img.shields.io/npm/dt/panindigan.svg" alt="npm total downloads"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue.svg" alt="TypeScript"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22.22.0-green.svg" alt="Node.js"></a>
  <a href="https://github.com/nazzelofficial/panindigan/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License"></a>
</p>

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Authentication](#authentication)
- [Messaging](#messaging)
- [Thread Management](#thread-management)
- [User Operations](#user-operations)
- [Media Handling](#media-handling)
- [Events](#events)
- [Advanced Features](#advanced-features)
- [Configuration](#configuration)
- [Error Handling](#error-handling)
- [API Reference](#api-reference)
- [Contributing](#contributing)
- [License](#license)

---

## Important Notice

**This library is designed for Facebook Messenger USER ACCOUNTS and GROUP CHATS, NOT Facebook Pages.**

- ✅ Personal Facebook accounts
- ✅ Messenger group chats
- ✅ Direct messages between users
- ❌ Facebook Page messaging
- ❌ Business/Page accounts

The library uses the `webgraphql/query` endpoint which is for user accounts, not the `api/graphql` endpoint used by Pages.

## Features

### Core Capabilities

- **True MQTT Implementation**: Genuine WebSocket-based MQTT protocol (NOT HTTP polling simulation) for instant message delivery with zero latency
- **Universal AppState Compatibility**: Accepts ALL cookie formats from any source without conversion
- **TypeScript-First Architecture**: Built from the ground up with TypeScript for maximum type safety and IntelliSense support
- **Modern Node.js 22.22.0 Optimized**: Leverages latest V8 engine, native ESM support, and modern JavaScript features
- **Production-Ready**: Designed for 24/7 uptime with automatic reconnection, error recovery, and comprehensive logging
- **Anti-Suspension System**: Human-behavior simulation to avoid Facebook bans
- **Fast MQTT with Auto-Restart**: Optimized connection with health checks and automatic reconnection
- **Multi-Account Support**: Run multiple Facebook accounts simultaneously
- **Auto Token Refresh**: Automatic cookie and token refresh for session longevity
- **Advanced Retry Mechanism**: Exponential backoff for network resilience
- **Performance Metrics**: Built-in tracking for API performance monitoring
- **Circuit Breaker Pattern**: Prevents cascading failures with automatic recovery
- **Request Caching**: TTL-based caching to reduce redundant API calls
- **Token Bucket Rate Limiting**: Precise rate limiting for API abuse prevention
- **Message Queue with Persistence**: Ensures message delivery during disconnections

### Authentication & Session Management

- **Multiple Login Methods**:
  - AppState/Cookie-based login (all formats supported)
  - Email/password credential login with automatic form token extraction
  - Automatic 2FA detection and handling (TOTP, SMS, Email)
  - Security checkpoint resolution
  - Environment variable support (`FACEBOOK_APPSTATE`) for secure hosting
- Smart Cookie Parser with automatic format detection
- Session persistence and automatic refresh
- Multi-account management
- Session validation and recovery

### Real-Time Event System (Authentic MQTT)

- **True MQTT Protocol**: Genuine WebSocket-based MQTT implementation
- **Instant Message Delivery**: Zero latency, messages arrive in real-time
- **Persistent Connection**: Maintains stable WebSocket connection
- **Comprehensive Events**: Messages, typing, presence, reactions, read receipts, thread changes
- **Connection Stability**: Automatic reconnection with exponential backoff
- **Message Queue**: Intelligent queuing for offline messages

### Complete Messaging Capabilities

- Send text messages with full Unicode and emoji support
- Rich text formatting (bold, italic, strikethrough, monospace)
- Message mentions (@username)
- Reply to messages with context preservation
- Edit and unsend messages
- Message reactions (Like, Love, Haha, Wow, Sad, Angry, Care)
- Forward messages across threads
- Message search and history
- Typing indicators
- Read/delivery receipts

### Rich Media & Attachments

- Image upload (JPG, PNG, GIF, WebP, BMP, TIFF) with width/height/quality options
- Video upload (MP4, MOV, AVI, MKV, WebM) with thumbnail support
- Audio messages and voice mail
- Document sharing (PDF, DOC, XLS, PPT, TXT, ZIP)
- **Attachment download** - Download all attachment types with automatic Content-Type and filename detection
- Sticker library access
- GIF search and send
- Multiple attachments per message

### Thread & Group Management

- Create group chats
- Add/remove participants
- Promote/demote admins
- Thread colors (30+ options)
- Custom emoji
- Group names and descriptions
- Nicknames
- Pin/unpin messages
- Archive/mute threads
- Leave/delete groups

### User & Contact Operations

- User information and profiles
- Search for users
- Friend requests management
- Block/unblock users
- Friend lists
- Birthday notifications
- Presence/online status

### Advanced Features

- Poll creation and voting
- Event planning and RSVP
- Story viewing
- Voice/video calls
- Location sharing
- Contact sharing

---

## Installation

```bash
# Using npm
npm install panindigan

# Using yarn
yarn add panindigan

# Using pnpm
pnpm add panindigan
```

[![npm package](https://nodei.co/npm/panindigan.png?downloads=true&downloadRank=true&stars=true)](https://www.npmjs.com/package/panindigan)

### Requirements

- Node.js >= 22.0.0
- TypeScript >= 5.0.0 (for development)

---

## Quick Start

### Basic Usage

```typescript
import { login } from 'panindigan';

// Login with AppState from environment variable
const api = await login({
  logLevel: 'info'
});

// Listen for messages
api.on('message', (event) => {
  console.log(`New message from ${event.message.senderId}: ${event.message.body}`);
  
  // Reply to message
  api.sendMessage(event.message.threadId, {
    body: 'Hello back!'
  });
});

// Send a message
await api.sendText('1234567890', 'Hello World!');
```

### Environment Variable Setup (Recommended for Hosting)

```bash
# Set FACEBOOK_APPSTATE environment variable
export FACEBOOK_APPSTATE='[{"key":"c_user","value":"123...","domain":".facebook.com"},...]'
```

### Using AppState File

```typescript
import { login } from 'panindigan';
import { readFileSync } from 'fs';

const appState = JSON.parse(readFileSync('appstate.json', 'utf-8'));

const api = await login({
  appState,
  logLevel: 'debug'
});
```

---

## Authentication

### Supported Cookie Formats

Panindigan automatically detects and parses all major cookie formats:

- **c3c-fbstate**: Popular Facebook cookie extractor
- **fca-unofficial**: Legacy FCA library cookies
- **facebook-chat-api**: Original FCA cookies
- **EditThisCookie**: Browser extension
- **Cookie-Editor**: Browser extension
- **J2Team Cookies**: Extension tool
- **Raw cookie strings**: From browser DevTools

### Login Methods

#### AppState/Cookie Login (Recommended)

```typescript
import { login } from 'panindigan';

// From environment variable
const api = await login({
  logLevel: 'info'
});

// From file
const api = await login({
  appState: require('./appstate.json'),
  logLevel: 'info'
});

// From browser extension export (auto-detected format)
const api = await login({
  appState: cookiesArray,
  logLevel: 'info'
});
```

#### Credential Login (Email/Password)

For full email/password authentication with automatic 2FA and checkpoint handling:

```typescript
import { login } from 'panindigan';

const api = await login({
  credentials: {
    email: 'your.email@example.com',
    password: 'your_password',
  },
  twoFactor: {
    type: 'totp', // 'totp', 'sms', or 'email'
    code: '123456'
  },
  logLevel: 'info'
});
```

**Features:**
- ✅ Automatic token extraction from login page
- ✅ Automatic 2FA detection and handling
- ✅ Security checkpoint resolution
- ✅ Automatic session creation from cookies

#### Two-Factor Authentication (2FA)

Automatic 2FA handling for all authentication methods:

```typescript
import { login } from 'panindigan';

// 2FA will be automatically handled during login
const api = await login({
  credentials: {
    email: 'user@example.com',
    password: 'password'
  },
  twoFactor: {
    type: 'totp',  // 'totp' | 'sms' | 'email'
    code: '123456'
  },
  logLevel: 'info'
});
```

**Supported 2FA Methods:**
- ✅ TOTP (Time-based One-Time Password / Google Authenticator)
- ✅ SMS codes
- ✅ Email verification codes

#### Security Checkpoint Resolution

Automatic handling of Facebook's security checkpoints:

```typescript
import { login } from 'panindigan';

try {
  const api = await login({
    credentials: {
      email: 'user@example.com',
      password: 'password'
    },
    logLevel: 'info'
  });
} catch (error) {
  // If checkpoint is detected, resolve it and try again
  if (error.message.includes('checkpoint')) {
    const api = await login({
      credentials: {
        email: 'user@example.com',
        password: 'password'
      },
      checkpointData: {
        url: 'https://www.facebook.com/checkpoint/1234567',
        securityCode: '123456',
        method: 'email' // 'email' | 'sms' | 'authenticator'
      },
      logLevel: 'info'
    });
  }
}
```

**Checkpoint Features:**
- ✅ Automatic checkpoint detection
- ✅ Multiple verification methods support
- ✅ Security code submission
- ✅ Automatic session recovery after verification

### Secure Hosting

For production deployment, use environment variables:

```typescript
// No appState in code - safer for hosting
const api = await login({
  logLevel: 'info',
  autoReconnect: true,
  maxReconnectAttempts: 10
});
```

Set the environment variable on your hosting platform:
- **Render**: Dashboard > Environment Variables
- **Railway**: Project Settings > Variables
- **Heroku**: Settings > Config Vars
- **Vercel**: Project Settings > Environment Variables

---

## Messaging

### Send Text Message

```typescript
await api.sendText('threadId', 'Hello World!');
```

### Send Message with Options

```typescript
await api.sendMessage('threadId', {
  body: 'Hello with formatting!',
  mentions: [
    { tag: 'John Doe', id: '123456', offset: 6, length: 8 }
  ]
});
```

### Reply to Message

```typescript
await api.replyToMessage('threadId', 'messageId', 'This is a reply');
```

### React to Message

```typescript
// Add reaction
await api.reactToMessage('messageId', 'love');

// Remove reaction
await api.reactToMessage('messageId', null);
```

### Edit/Unsend Message

```typescript
// Edit message
await api.editMessage('messageId', 'Updated text');

// Unsend message
await api.unsendMessage('messageId');
```

### Get Message History

```typescript
const history = await api.getMessageHistory('threadId', 50);
console.log(history.messages);
console.log('Has more:', history.hasMore);
```

---

## Thread Management

### Get Thread List

```typescript
const threads = await api.getThreadList(20);
threads.forEach(thread => {
  console.log(`${thread.name}: ${thread.unreadCount} unread`);
});
```

### Get Thread Info

```typescript
const thread = await api.getThreadInfo('threadId');
console.log('Participants:', thread.participants);
```

### Create Group

```typescript
const group = await api.createGroup({
  name: 'My Group',
  participantIds: ['user1', 'user2', 'user3'],
  initialMessage: 'Welcome everyone!'
});
```

### Manage Participants

```typescript
// Add participants
await api.addParticipants('threadId', ['user1', 'user2']);

// Remove participants
await api.removeParticipants('threadId', ['user1']);

// Promote to admin
await api.promoteParticipants('threadId', ['user1']);

// Demote from admin
await api.demoteParticipants('threadId', ['user1']);
```

### Thread Settings

```typescript
// Change thread color
await api.changeThreadColor('threadId', 'messenger_blue');

// Change thread emoji
await api.changeThreadEmoji('threadId', '🎉');

// Set nickname
await api.setNickname('threadId', 'userId', 'Nickname');

// Archive thread
await api.archiveThread('threadId', true);

// Mute thread
await api.muteThread('threadId', true);

// Leave group
await api.leaveGroup('threadId');
```

---

## User Operations

### Get User Info

```typescript
// Single user
const user = await api.getUserInfo('userId');
console.log(user.name, user.profileUrl);

// Multiple users
const users = await api.getUserInfo(['user1', 'user2', 'user3']);
```

### Search Users

```typescript
const result = await api.searchUsers('John Doe', 10);
console.log('Found:', result.users);
console.log('Has more:', result.hasMore);
```

### Friends Management

```typescript
// Get friends list
const friends = await api.getFriends(100);

// Send friend request
await api.sendFriendRequest('userId', 'Optional message');

// Accept/decline friend request
await api.acceptFriendRequest('userId');
await api.declineFriendRequest('userId');

// Unfriend
await api.unfriend('userId');
```

### Block/Unblock

```typescript
await api.blockUser('userId');
await api.unblockUser('userId');

// Get blocked list
const blocked = await api.getBlockedList();
```

### Birthdays

```typescript
const birthdays = await api.getBirthdays();
console.log('Today:', birthdays.today);
console.log('Upcoming:', birthdays.upcoming);
```

---

## Media Handling

### Upload Image

```typescript
import { readFileSync } from 'fs';

const buffer = readFileSync('photo.jpg');
const result = await api.uploadImage(buffer, {
  filename: 'photo.jpg',
  mimeType: 'image/jpeg'
});
console.log('Uploaded:', result.attachmentId);
```

### Upload Video

```typescript
const buffer = readFileSync('video.mp4');
const result = await api.uploadVideo(buffer, {
  filename: 'video.mp4',
  mimeType: 'video/mp4'
});
```

### Upload Audio

```typescript
const buffer = readFileSync('voice.mp3');
const result = await api.uploadAudio(buffer, {
  isVoiceMail: true
});
```

### Upload Document

```typescript
const buffer = readFileSync('document.pdf');
const result = await api.uploadDocument(buffer, {
  filename: 'document.pdf'
});
```

### Download Attachment

```typescript
const download = await api.downloadAttachment('https://example.com/file.jpg');
console.log('Downloaded:', download.filename, download.size);
```

---

## Events

### Available Events

```typescript
// Message events
api.on('message', (event) => {
  console.log('New message:', event.message.body);
});

// Message reactions
api.on('message_reaction', (event) => {
  console.log('Reaction:', event.reaction);
});

// Typing indicators
api.on('typ', (event) => {
  console.log(event.isTyping ? 'Typing...' : 'Stopped typing');
});

// Presence/online status
api.on('presence', (event) => {
  console.log('Status:', event.status);
});

// Thread events
api.on('thread_rename', (event) => {
  console.log('Thread renamed to:', event.name);
});

api.on('thread_add_participants', (event) => {
  console.log('Participants added:', event.participantIds);
});

// Connection events
api.on('connect', () => {
  console.log('Connected to MQTT');
});

api.on('disconnect', () => {
  console.log('Disconnected from MQTT');
});

// Error events
api.on('error', (event) => {
  console.error('Error:', event.error);
});
```

### Event Types

- `message` - New message received
- `message_reaction` - Message reaction added/removed
- `typ` - Typing indicator
- `read_receipt` - Message read
- `delivery_receipt` - Message delivered
- `presence` - User online status change
- `thread_rename` - Thread name changed
- `thread_color` - Thread color changed
- `thread_emoji` - Thread emoji changed
- `thread_add_participants` - Participants added
- `thread_remove_participants` - Participants removed
- `thread_promote` - Admin promoted
- `thread_demote` - Admin demoted
- `friend_request` - New friend request
- `connect` / `disconnect` - Connection events
- `error` - Error events

---

## Advanced Features

### Anti-Suspension System

Human-behavior simulation to avoid Facebook bans:

```typescript
import { AntiSuspension } from 'panindigan';

const antiSuspension = new AntiSuspension({
  enabled: true,
  typingDelayMin: 500,
  typingDelayMax: 3000,
  messageDelayMin: 1000,
  messageDelayMax: 5000,
  actionDelayMin: 200,
  actionDelayMax: 1000,
});

// Delay before sending a message
await antiSuspension.beforeMessage();
await api.sendText('threadId', 'Hello World!');

// Check rate limit safety
if (antiSuspension.isRateLimitSafe()) {
  await api.sendText('threadId', 'Another message');
}

// Get statistics
const stats = antiSuspension.getStats();
console.log(`Messages per minute: ${stats.messagesPerMinute}`);
```

### Fast MQTT Client

Optimized MQTT connection with auto-restart and health checks:

```typescript
import { FastMQTT } from 'panindigan';

const fastMQTT = new FastMQTT(session, {
  maxReconnectAttempts: Infinity,
  reconnectDelay: 3000,
  maxReconnectDelay: 60000,
  keepAliveInterval: 60,
  connectionTimeout: 60000,
  autoRestart: true,
  restartOnDisconnect: true,
  healthCheckInterval: 30000,
});

await fastMQTT.connect();

// Get connection stats
const stats = fastMQTT.getStats();
console.log('Connected:', stats.connected);
console.log('Reconnect attempts:', stats.reconnectAttempts);
```

### Multi-Account Manager

Run multiple Facebook accounts simultaneously:

```typescript
import { MultiAccountManager } from 'panindigan';

const multiAccount = new MultiAccountManager();

// Add accounts
await multiAccount.addAccount({
  id: 'account1',
  name: 'Main Account',
  appState: appState1,
  autoConnect: true,
});

await multiAccount.addAccount({
  id: 'account2',
  name: 'Secondary Account',
  appState: appState2,
  autoConnect: true,
});

// Set default account
multiAccount.setDefaultAccount('account1');

// Broadcast message to all accounts
const results = await multiAccount.broadcastMessage('threadId', 'Hello from all accounts!');

// Get statistics
const stats = multiAccount.getStats();
console.log('Total accounts:', stats.totalAccounts);
console.log('Connected accounts:', stats.connectedAccounts);
```

### Performance Metrics

Track API performance:

```typescript
import { logger } from 'panindigan';

// Log performance metrics
logger.logMetrics();

// Get metrics programmatically
const metrics = logger.getMetrics();
console.log('API GET avg time:', metrics.api_get?.avgTime);
console.log('API POST avg time:', metrics.api_post?.avgTime);

// Reset metrics
logger.resetMetrics();
```

### Circuit Breaker Pattern

Prevent cascading failures with automatic recovery:

```typescript
import { CircuitBreaker } from 'panindigan';

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 60000,
});

// Execute with circuit breaker protection
const result = await circuitBreaker.execute(
  async () => {
    return await someRiskyOperation();
  },
  'API Call Context'
);

// Get circuit breaker stats
const stats = circuitBreaker.getStats();
console.log('State:', stats.state);
console.log('Failure count:', stats.failureCount);

// Reset circuit breaker
circuitBreaker.reset();
```

### Request Cache

Reduce redundant API calls with TTL-based caching:

```typescript
import { RequestCache } from 'panindigan';

const cache = new RequestCache({
  defaultTTL: 300000, // 5 minutes
  maxSize: 1000,
});

// Set cache
cache.set('user:123', userData, 60000);

// Get from cache
const cached = cache.get('user:123');
if (cached) {
  console.log('Cache hit!');
}

// Clean expired entries
const cleaned = cache.cleanExpired();
console.log(`Cleaned ${cleaned} expired entries`);

// Get cache stats
const stats = cache.getStats();
console.log('Cache size:', stats.size);
```

### Token Bucket Rate Limiter

Prevent API abuse with precise rate limiting:

```typescript
import { RateLimiter } from 'panindigan';

const rateLimiter = new RateLimiter({
  tokensPerInterval: 30,
  interval: 1000, // 1 second
  maxTokens: 100,
});

// Try to consume token (non-blocking)
if (rateLimiter.tryConsume(1)) {
  await api.sendText('threadId', 'Message');
} else {
  console.log('Rate limit reached');
}

// Wait for tokens (blocking)
await rateLimiter.waitForTokens(1);
await api.sendText('threadId', 'Message');

// Get rate limiter stats
const stats = rateLimiter.getStats();
console.log('Available tokens:', stats.tokens);
```

### Message Queue with Persistence

Ensure message delivery during disconnections:

```typescript
import { MessageQueue } from 'panindigan';

const messageQueue = new MessageQueue({
  maxSize: 1000,
  persistencePath: './message-queue.json',
  autoSave: true,
});

// Enqueue message
const messageId = messageQueue.enqueue({
  threadId: 'threadId',
  body: 'Hello World!',
  priority: 1,
  maxAttempts: 3,
});

// Process queue
await messageQueue.process(async (message) => {
  try {
    await api.sendText(message.threadId, message.body);
    return true; // Success
  } catch (error) {
    return false; // Will retry
  }
});

// Get queue stats
const stats = messageQueue.getStats();
console.log('Queue size:', stats.size);
console.log('Oldest message:', stats.oldestMessage);
```

---

## Advanced Features (Legacy)

### Polls

```typescript
// Create poll
const poll = await api.createPoll({
  threadId: 'threadId',
  question: 'What is your favorite color?',
  options: ['Red', 'Blue', 'Green'],
  allowsMultipleChoices: false
});

// Vote on poll
await api.votePoll(poll.pollId, ['optionId']);

// Get poll results
const results = await api.getPollResults(poll.pollId);
console.log('Total votes:', results.totalVotes);
```

### Events

```typescript
// Create event
const event = await api.createEvent({
  threadId: 'threadId',
  name: 'Party',
  description: 'Birthday celebration',
  location: 'My House',
  startTime: Date.now() + 86400000,
  endTime: Date.now() + 90000000
});

// RSVP
await api.rsvpToEvent(event.eventId, 'going');
```

### Stories

```typescript
// Get stories
const stories = await api.getStories('userId');
stories.forEach(story => {
  console.log(`Story by ${story.authorName}`);
});

// View story
await api.viewStory('storyId');
```

### Calls

```typescript
// Initiate voice call
const call = await api.initiateCall('threadId', false);
console.log('Call ID:', call.callId);

// Initiate video call
const videoCall = await api.initiateCall('threadId', true);
```

---

## Configuration

### Login Options

```typescript
interface LoginOptions {
  appState?: AppState | Cookie[] | string;  // Cookie data (all formats supported)
  credentials?: Credentials;                 // Email/password authentication
  twoFactor?: TwoFactorAuth;                 // 2FA code (totp, sms, email)
  checkpointData?: CheckpointData;           // Security checkpoint resolution
  logLevel?: LogLevel;                       // silent | error | warn | info | debug | verbose
  userAgent?: string;                        // Custom user agent
  proxy?: string;                            // Proxy URL
  autoReconnect?: boolean;                   // Auto reconnect on disconnect
  maxReconnectAttempts?: number;             // Max reconnection attempts
  sessionPath?: string;                      // Path to save session
}

interface Credentials {
  email: string;
  password: string;
}

interface TwoFactorAuth {
  type: 'totp' | 'sms' | 'email';
  code: string;
  rememberDevice?: boolean;
}

interface CheckpointData {
  url: string;                               // Checkpoint URL
  securityCode?: string;                     // Verification code
  method?: 'email' | 'sms' | 'authenticator'; // Verification method
}
```

### Example Configuration

```typescript
const api = await login({
  logLevel: 'debug',
  autoReconnect: true,
  maxReconnectAttempts: 10,
  sessionPath: './session.json'
});
```

---

## Error Handling

```typescript
import { logger } from 'panindigan';

// Set log level
logger.setLogLevel('debug');

// Handle errors
try {
  await api.sendText('threadId', 'Hello');
} catch (error) {
  if (error.code === 'SESSION_EXPIRED') {
    console.log('Session expired, please login again');
  } else {
    console.error('Error:', error.message);
  }
}

// Listen for errors
api.on('error', (event) => {
  console.error('API Error:', event.error);
});
```

---

## API Reference

See the [TypeScript type definitions](src/types/index.ts) for complete API documentation.

---

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Disclaimer

This is an unofficial library and is not affiliated with Facebook/Meta. Use at your own risk. The authors are not responsible for any misuse or violations of Facebook's Terms of Service.

---

<p align="center">
  Made with Nazzel ❤️ for the Node.js community
</p>
