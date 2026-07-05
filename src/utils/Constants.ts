/**
 * Constants and API Endpoints for Panindigan
 */

export const FACEBOOK_BASE_URL = 'https://www.facebook.com';
export const FACEBOOK_MESSAGES_URL = 'https://www.facebook.com/messages/t/';
export const FACEBOOK_WEBGRAPHQL_URL = 'https://www.facebook.com/webgraphql/query';
export const FACEBOOK_BATCH_URL = 'https://www.facebook.com/webgraphqlbatch';
export const FACEBOOK_UPLOAD_URL = 'https://upload.facebook.com/ajax/mercury/upload.php';

// Messenger REST endpoints (stable form-encoded POST endpoints)
export const FACEBOOK_SEND_URL = 'https://www.facebook.com/messaging/send/';
export const FACEBOOK_UNSEND_URL = 'https://www.facebook.com/messaging/unsend_message/';
export const FACEBOOK_EDIT_MESSAGE_URL = 'https://www.facebook.com/messaging/edit_message/';
export const FACEBOOK_FORWARD_MESSAGE_URL = 'https://www.facebook.com/messaging/forward_message/';
export const FACEBOOK_REACTION_URL = 'https://www.facebook.com/messaging/message_reactions/';
export const FACEBOOK_TYPING_URL = 'https://www.facebook.com/ajax/messaging/typ.php';
export const FACEBOOK_MARK_READ_URL = 'https://www.facebook.com/ajax/mercury/change_read_status.php';
export const FACEBOOK_MARK_DELIVERED_URL = 'https://www.facebook.com/ajax/mercury/delivery_receipts.php';
export const FACEBOOK_THREAD_LIST_URL = 'https://www.facebook.com/ajax/mercury/threadlist_info.php';
export const FACEBOOK_THREAD_INFO_URL = 'https://www.facebook.com/ajax/mercury/thread_info.php';
export const FACEBOOK_THREAD_HISTORY_URL = 'https://www.facebook.com/ajax/mercury/conversation_info.php';
export const FACEBOOK_SEARCH_MESSAGES_URL = 'https://www.facebook.com/ajax/mercury/search.php';
export const FACEBOOK_SET_NICKNAME_URL = 'https://www.facebook.com/messaging/set_nickname/';
export const FACEBOOK_SET_THREAD_NAME_URL = 'https://www.facebook.com/messaging/set_thread_name/';
export const FACEBOOK_SET_THREAD_IMAGE_URL = 'https://www.facebook.com/messaging/set_thread_image/';
export const FACEBOOK_SET_THREAD_SETTINGS_URL = 'https://www.facebook.com/messaging/set_thread_settings/';
export const FACEBOOK_SET_APPROVAL_MODE_URL = 'https://www.facebook.com/messaging/set_approval_mode/';
export const FACEBOOK_APPROVE_MEMBER_URL = 'https://www.facebook.com/messaging/approve_member/';
export const FACEBOOK_REJECT_MEMBER_URL = 'https://www.facebook.com/messaging/reject_member/';
export const FACEBOOK_GET_INVITE_LINK_URL = 'https://www.facebook.com/messaging/get_invite_link/';
export const FACEBOOK_JOIN_THREAD_URL = 'https://www.facebook.com/messaging/join_thread/';
export const FACEBOOK_ADD_PARTICIPANTS_URL = 'https://www.facebook.com/messaging/add_participants/';
export const FACEBOOK_REMOVE_PARTICIPANT_URL = 'https://www.facebook.com/messaging/remove_participant/';
export const FACEBOOK_LEAVE_GROUP_URL = 'https://www.facebook.com/ajax/leave_group/';
export const FACEBOOK_UPDATE_ADMINS_URL = 'https://www.facebook.com/messaging/update_thread_admins/';
export const FACEBOOK_NEW_GROUP_URL = 'https://www.facebook.com/messaging/new_group_thread/';
export const FACEBOOK_CREATE_POLL_URL = 'https://www.facebook.com/messaging/create_poll/';
export const FACEBOOK_UPDATE_POLL_URL = 'https://www.facebook.com/messaging/update_vote/';
export const FACEBOOK_PIN_MESSAGE_URL = 'https://www.facebook.com/messaging/pin_message/';
export const FACEBOOK_UNPIN_MESSAGE_URL = 'https://www.facebook.com/messaging/unpin_message/';
export const FACEBOOK_DELETE_MESSAGE_URL = 'https://www.facebook.com/messaging/delete_message/';
export const FACEBOOK_ARCHIVE_THREAD_URL = 'https://www.facebook.com/ajax/mercury/move_thread.php';
export const FACEBOOK_MUTE_THREAD_URL = 'https://www.facebook.com/ajax/mercury/change_mute_thread.php';
export const FACEBOOK_DELETE_THREAD_URL = 'https://www.facebook.com/ajax/mercury/delete_thread.php';
export const FACEBOOK_USER_INFO_URL = 'https://www.facebook.com/chat/user_info/';
export const FACEBOOK_SEARCH_URL = 'https://www.facebook.com/ajax/typeahead/search.php';
export const FACEBOOK_FRIEND_REQUEST_URL = 'https://www.facebook.com/ajax/add_friend/action.php';
export const FACEBOOK_MANAGE_FRIEND_URL = 'https://www.facebook.com/ajax/friends/lists/remove.php';
export const FACEBOOK_FOLLOW_URL = 'https://www.facebook.com/ajax/follow/get_follow.php';
export const FACEBOOK_MUTUAL_FRIENDS_URL = 'https://www.facebook.com/ajax/mutual_friends/';
export const FACEBOOK_PENDING_REQUESTS_URL = 'https://www.facebook.com/ajax/requests/friend/';
export const FACEBOOK_GIF_SEARCH_URL = 'https://www.facebook.com/ajax/messaging/search/gifs.php';
export const FACEBOOK_STICKER_SEARCH_URL = 'https://www.facebook.com/ajax/messaging/search/stickers.php';

// Friends & Social endpoints
export const FACEBOOK_FRIENDS_INFO_URL = 'https://www.facebook.com/ajax/mercury/friends_info.php';
export const FACEBOOK_SENT_REQUESTS_URL = 'https://www.facebook.com/ajax/social-privacy/friend-request-page.php';
export const FACEBOOK_BLOCK_URL = 'https://www.facebook.com/ajax/profile/userblockunblock.php';
export const FACEBOOK_BLOCKED_LIST_URL = 'https://www.facebook.com/settings/blocking/ajax/';
export const FACEBOOK_BIRTHDAYS_URL = 'https://www.facebook.com/ajax/birthday/notification/';
export const FACEBOOK_PRESENCE_URL = 'https://www.facebook.com/ajax/mercury/chat_online_presences.php';

// Stories
export const FACEBOOK_STORIES_URL = 'https://www.facebook.com/ajax/stories/';
export const FACEBOOK_VIEW_STORY_URL = 'https://www.facebook.com/ajax/stories/seen/';

// Messenger event planner
export const FACEBOOK_CREATE_EVENT_URL = 'https://www.facebook.com/messaging/create_event/';
export const FACEBOOK_RSVP_EVENT_URL = 'https://www.facebook.com/messaging/update_event_rsvp/';

// Calls
export const FACEBOOK_INITIATE_CALL_URL = 'https://www.facebook.com/messaging/call/';

// Poll results
export const FACEBOOK_POLL_RESULTS_URL = 'https://www.facebook.com/ajax/messaging/poll_info.php';

// MQTT Configuration
export const MQTT_BROKER_URLS = [
  'wss://edge-chat.facebook.com/chat',
  'wss://edge-chat.messenger.com/chat',
];

export const MQTT_DEFAULT_OPTIONS = {
  keepalive: 60,
  clean: true,
  connectTimeout: 30000,
  reconnectPeriod: 5000,
  // Facebook's MQTT broker speaks MQTT 3.1 (protocol name "MQIsdp", level 3),
  // NOT MQTT 3.1.1 ("MQTT", level 4). Connecting with the wrong protocol
  // name/level causes the broker to drop the raw TCP/WS connection before
  // ever sending a CONNACK — which surfaces as a bare "connection timeout"
  // with no visible MQTT-level error.
  protocolVersion: 3,
};

// Facebook's public web Messenger MQTT "aid" (App ID). This is the fixed,
// long-published numeric app id Messenger Web itself sends in every MQTT
// CONNECT username payload — not a guessed or fabricated value.
export const MQTT_WEB_APP_ID = 219994525426954;

/**
 * All MQTT topics Messenger Web subscribes to.
 * The browser client uses these exact strings at connection time.
 */
export const MQTT_TOPICS = {
  MESSAGE_SYNC: '/t_ms',
  TYPING: '/t_tn',
  PRESENCE: '/t_p',
  RTC: '/t_rtc',
  GRAPHQL: '/t_graphql',
  MESSAGING_EVENTS: '/t_messaging_events',
  NOTIFY: '/t_notify',
  REGION_HINT: '/t_region_hint',
  SUBSCRIPTION: '/t_sb',
  ADMIN_TEXT: '/t_admin_text',
  PRESENCE_EXTENDED: '/t_presence',
  MESSAGE_BODY: '/t_msg_body',
  DELTA: '/t_delta',
  ORCA_PRESENCE: '/orca_presence',
  ORCA_TYPING: '/orca_typing_notifications',
  ORCA_MESSAGES: '/orca_message_notifications',
  WEBRTC: '/webrtc',
  WEBRTC_RESPONSE: '/webrtc_response',
} as const;

export type MQTTTopic = typeof MQTT_TOPICS[keyof typeof MQTT_TOPICS];

// Facebook-specific HTTP header names
export const FB_HEADER_LSD = 'x-fb-lsd';
export const FB_HEADER_ASBD = 'x-asbd-id';
export const FB_HEADER_RESPONSE_FORMAT = 'x-response-format-ver';

// User Agents
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// API Request Headers — mirroring what Messenger Web sends
export const DEFAULT_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'Accept-Encoding': 'br, gzip, deflate',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Content-Type': 'application/x-www-form-urlencoded',
  DNT: '1',
  Origin: 'https://www.facebook.com',
  Pragma: 'no-cache',
  Referer: 'https://www.facebook.com/',
  'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': DEFAULT_USER_AGENT,
  [FB_HEADER_RESPONSE_FORMAT]: '1',
};

// GraphQL Document IDs (Facebook's internal query registry)
export const GRAPHQL_DOC_IDS = {
  THREAD_LIST: '3336396659756583',
  THREAD_INFO: '4637567869602765',
  THREAD_HISTORY: '1547392735427520',
  USER_INFO: '4003363196376948',
  SEARCH_USERS: '2786954668004889',
  FRIENDS_LIST: '3827522300624639',
  MARK_READ: '5765950230143565',
  UNSEND_MESSAGE: '2974122252636166',
  SEND_MESSAGE: '3138009893096508',
  FORWARD_MESSAGE: '2583553335081042',
  SEARCH_MESSAGES: '2866931456737402',
  MUTUAL_FRIENDS: '5282456228432891',
  GIF_SEARCH: '2579406448776125',
  STICKER_SEARCH: '3223872657675734',
} as const;

// GraphQL Queries (legacy names kept for compatibility)
export const GRAPHQL_QUERIES = {
  GET_THREAD_LIST: 'ThreadListQuery',
  GET_THREAD_INFO: 'ThreadInfoQuery',
  GET_THREAD_HISTORY: 'ThreadHistoryQuery',
  SEND_MESSAGE: 'MessageSendMutation',
  UNSEND_MESSAGE: 'MessageUnsendMutation',
  EDIT_MESSAGE: 'MessageEditMutation',
  GET_USER_INFO: 'UserInfoQuery',
  SEARCH_USERS: 'UserSearchQuery',
  UPLOAD_ATTACHMENT: 'AttachmentUploadMutation',
} as const;

// Error Codes
export const ERROR_CODES = {
  LOGIN_FAILED: 'LOGIN_FAILED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  CHECKPOINT_REQUIRED: 'CHECKPOINT_REQUIRED',
  TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',
  CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_APPSTATE: 'INVALID_APPSTATE',
  API_ERROR: 'API_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  GRAPHQL_ERROR: 'GRAPHQL_ERROR',
  MESSAGE_SEND_FAILED: 'MESSAGE_SEND_FAILED',
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  INVALID_ATTACHMENT: 'INVALID_ATTACHMENT',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  THREAD_NOT_FOUND: 'THREAD_NOT_FOUND',
  NOT_GROUP_ADMIN: 'NOT_GROUP_ADMIN',
  PARTICIPANT_NOT_FOUND: 'PARTICIPANT_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  FRIEND_REQUEST_FAILED: 'FRIEND_REQUEST_FAILED',
  BLOCK_FAILED: 'BLOCK_FAILED',
  MQTT_CONNECTION_FAILED: 'MQTT_CONNECTION_FAILED',
  MQTT_DISCONNECTED: 'MQTT_DISCONNECTED',
  MQTT_PUBLISH_FAILED: 'MQTT_PUBLISH_FAILED',
} as const;

// Thread Colors (Facebook's color palette hex values)
export const THREAD_COLORS: Record<string, string> = {
  default: '#0084ff',
  messenger_blue: '#0084ff',
  viking: '#44bec7',
  golden_poppy: '#ffc300',
  radical_red: '#fa3c4c',
  shocking: '#d696bb',
  free_speech_green: '#13cf13',
  shimmering_blush: '#ff7e29',
  medium_slate_blue: '#7646ff',
  light_coral: '#e68585',
  sea_green: '#20cef5',
  light_cyan: '#67b868',
  bright_turquoise: '#d4a88c',
  brilliant_rose: '#ff5ca1',
  light_slate_gray: '#a695c7',
  coral: '#ff7e29',
  hot_pink: '#fa3c4c',
  lime_green: '#13cf13',
  medium_purple: '#7646ff',
  orchid: '#d696bb',
  sky_blue: '#44bec7',
  spring_green: '#67b868',
  steel_blue: '#a695c7',
  tan: '#d4a88c',
  teal: '#0084ff',
  thistle: '#e68585',
  tomato: '#ff5ca1',
  turquoise: '#20cef5',
  violet: '#f01d6a',
};

// Reaction Emojis (string sent to /messaging/message_reactions/)
export const REACTION_EMOJIS: Record<string, string> = {
  like: '👍',
  love: '❤️',
  haha: '😆',
  wow: '😮',
  sad: '😢',
  angry: '😠',
  care: '🥰',
};

// Reaction IDs (Facebook internal numeric IDs)
export const REACTION_IDS: Record<string, number> = {
  like: 1,
  love: 2,
  wow: 3,
  haha: 4,
  sad: 7,
  angry: 8,
  care: 16,
};

// File size limits (bytes) — per Messenger Web
export const FILE_SIZE_LIMITS = {
  image: 25 * 1024 * 1024,    // 25 MB
  video: 1024 * 1024 * 1024,  // 1 GB (large video)
  audio: 25 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  total: 25 * 1024 * 1024,
};

// MIME type allow-lists
export const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'],
  video: ['video/mp4', 'video/quicktime', 'video/avi', 'video/x-matroska', 'video/webm'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/aac', 'audio/webm'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/zip',
    'application/x-rar-compressed',
  ],
};

// Rate limiting
export const RATE_LIMITS = {
  messages: { windowMs: 60000, maxRequests: 100 },
  api: { windowMs: 60000, maxRequests: 200 },
  uploads: { windowMs: 60000, maxRequests: 20 },
};

// Reconnection settings
export const RECONNECTION_SETTINGS = {
  maxAttempts: Infinity,
  initialDelay: 3000,
  maxDelay: 60000,
  backoffMultiplier: 1.5,
  jitter: true,
};

// Session settings
export const SESSION_SETTINGS = {
  refreshInterval: 15 * 60 * 1000,    // 15 min
  validityCheckInterval: 3 * 60 * 1000, // 3 min
};

// Anti-Suspension settings
export const ANTI_SUSPENSION_SETTINGS = {
  typingDelayMin: 500,
  typingDelayMax: 3000,
  messageDelayMin: 1000,
  messageDelayMax: 5000,
  actionDelayMin: 200,
  actionDelayMax: 1000,
  maxMessagesPerMinute: 30,
  maxActionsPerMinute: 60,
};

// Fast MQTT settings
export const FAST_MQTT_SETTINGS = {
  keepAliveInterval: 60,
  healthCheckInterval: 30000,
  connectionTimeout: 60000,
  maxReconnectDelay: 60000,
  staleConnectionThreshold: 300000,
};
