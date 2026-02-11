/**
 * Constants and API Endpoints for Panindigan
 */

export const FACEBOOK_BASE_URL = 'https://www.facebook.com';
export const FACEBOOK_GRAPHQL_URL = 'https://www.facebook.com/api/graphql';
export const FACEBOOK_WEBGRAPHQL_URL = 'https://www.facebook.com/webgraphql/query';
export const FACEBOOK_BATCH_URL = 'https://www.facebook.com/webgraphqlbatch';
export const FACEBOOK_UPLOAD_URL = 'https://upload.facebook.com/ajax/mercury/upload.php';

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
  protocolVersion: 3,
};

// User Agents
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// API Request Headers
export const DEFAULT_HEADERS: Record<string, string> = {
  'Accept': '*/*',
  'Accept-Encoding': 'gzip, deflate',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Content-Type': 'application/x-www-form-urlencoded',
  'DNT': '1',
  'Origin': 'https://www.facebook.com',
  'Pragma': 'no-cache',
  'Referer': 'https://www.facebook.com/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': DEFAULT_USER_AGENT,
};

// GraphQL Queries
export const GRAPHQL_QUERIES = {
  // Thread queries
  GET_THREAD_LIST: 'ThreadListQuery',
  GET_THREAD_INFO: 'ThreadInfoQuery',
  GET_THREAD_HISTORY: 'ThreadHistoryQuery',
  
  // Message queries
  SEND_MESSAGE: 'MessageSendMutation',
  UNSEND_MESSAGE: 'MessageUnsendMutation',
  EDIT_MESSAGE: 'MessageEditMutation',
  
  // User queries
  GET_USER_INFO: 'UserInfoQuery',
  SEARCH_USERS: 'UserSearchQuery',
  
  // Attachment queries
  UPLOAD_ATTACHMENT: 'AttachmentUploadMutation',
} as const;

// Error Codes
export const ERROR_CODES = {
  // Authentication errors
  LOGIN_FAILED: 'LOGIN_FAILED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  CHECKPOINT_REQUIRED: 'CHECKPOINT_REQUIRED',
  TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',
  CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_APPSTATE: 'INVALID_APPSTATE',
  
  // API errors
  API_ERROR: 'API_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  GRAPHQL_ERROR: 'GRAPHQL_ERROR',
  
  // Message errors
  MESSAGE_SEND_FAILED: 'MESSAGE_SEND_FAILED',
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  INVALID_ATTACHMENT: 'INVALID_ATTACHMENT',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  
  // Thread errors
  THREAD_NOT_FOUND: 'THREAD_NOT_FOUND',
  NOT_GROUP_ADMIN: 'NOT_GROUP_ADMIN',
  PARTICIPANT_NOT_FOUND: 'PARTICIPANT_NOT_FOUND',
  
  // User errors
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  FRIEND_REQUEST_FAILED: 'FRIEND_REQUEST_FAILED',
  BLOCK_FAILED: 'BLOCK_FAILED',
  
  // MQTT errors
  MQTT_CONNECTION_FAILED: 'MQTT_CONNECTION_FAILED',
  MQTT_DISCONNECTED: 'MQTT_DISCONNECTED',
  MQTT_PUBLISH_FAILED: 'MQTT_PUBLISH_FAILED',
} as const;

// Thread Colors (Facebook's color palette)
export const THREAD_COLORS: Record<string, string> = {
  default: '#0084ff',
  messenger_blue: '#0084ff',
  viking: '#44bec7',
  golden_poppy: '#ffc300',
  radical_red: '#fa3c4c',
  shocking: '#d696bb',
  free_speech_green: '#13cf13',
  shimmering_blush: '#ff7e29',
  medium_slate_blue: '#e68585',
  light_coral: '#7646ff',
  sea_green: '#20cef5',
  light_cyan: '#67b868',
  bright_turquoise: '#d4a88c',
  brilliant_rose: '#ff5ca1',
  light_slate_gray: '#a695c7',
  bright_turquoise_2: '#f01d6a',
  coral: '#ff7e29',
  deep_sky_blue: '#0084ff',
  hot_pink: '#fa3c4c',
  lime_green: '#13cf13',
  medium_purple: '#7646ff',
  orange_red: '#ff7e29',
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

// Reaction Emojis
export const REACTION_EMOJIS: Record<string, string> = {
  like: '👍',
  love: '❤️',
  haha: '😆',
  wow: '😮',
  sad: '😢',
  angry: '😠',
  care: '🥰',
};

// Reaction IDs (Facebook internal IDs)
export const REACTION_IDS: Record<string, number> = {
  like: 1,
  love: 2,
  wow: 3,
  haha: 4,
  sad: 7,
  angry: 8,
  care: 16,
};

// File size limits (in bytes)
export const FILE_SIZE_LIMITS = {
  image: 25 * 1024 * 1024,      // 25MB
  video: 25 * 1024 * 1024,      // 25MB
  audio: 25 * 1024 * 1024,      // 25MB
  document: 25 * 1024 * 1024,   // 25MB
  total: 25 * 1024 * 1024,      // 25MB per message
};

// Allowed MIME types
export const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'],
  video: ['video/mp4', 'video/quicktime', 'video/avi', 'video/x-matroska', 'video/webm'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/aac'],
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
  messages: {
    windowMs: 60000,  // 1 minute
    maxRequests: 100,
  },
  api: {
    windowMs: 60000,
    maxRequests: 200,
  },
  uploads: {
    windowMs: 60000,
    maxRequests: 20,
  },
};

// Reconnection settings
export const RECONNECTION_SETTINGS = {
  maxAttempts: 10,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

// Session settings
export const SESSION_SETTINGS = {
  refreshInterval: 30 * 60 * 1000,  // 30 minutes
  validityCheckInterval: 5 * 60 * 1000,  // 5 minutes
};
