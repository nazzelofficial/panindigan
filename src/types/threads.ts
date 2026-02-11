/**
 * Thread and Group Types
 */

export type ThreadType = 'user' | 'group' | 'page' | 'marketplace';

export interface Thread {
  threadId: string;
  type: ThreadType;
  name?: string;
  participants: Participant[];
  participantIds: string[];
  unreadCount: number;
  messageCount?: number;
  lastMessageTimestamp?: number;
  lastReadTimestamp?: number;
  isArchived: boolean;
  isMuted: boolean;
  isPinned: boolean;
  color?: ThreadColor;
  emoji?: string;
  adminIds: string[];
  approvalMode?: boolean;
  joinLink?: string;
  description?: string;
  image?: string;
  nicknames: Record<string, string>;
  pinnedMessages: string[];
  folder?: 'inbox' | 'archive' | 'pending' | 'other';
}

export interface Participant {
  userId: string;
  name: string;
  nickname?: string;
  isAdmin: boolean;
  isUser: boolean;
}

export type ThreadColor = 
  | 'default' | 'messenger_blue' | 'viking' | 'golden_poppy' | 'radical_red' | 'shocking' 
  | 'free_speech_green' | 'shimmering_blush' | 'medium_slate_blue' | 'light_coral'
  | 'sea_green' | 'light_cyan' | 'bright_turquoise' | 'brilliant_rose' | 'light_slate_gray'
  | 'bright_turquoise_2' | 'coral' | 'deep_sky_blue' | 'hot_pink' | 'lime_green'
  | 'medium_purple' | 'orange_red' | 'orchid' | 'sky_blue' | 'spring_green'
  | 'steel_blue' | 'tan' | 'teal' | 'thistle' | 'tomato' | 'turquoise' | 'violet';

export interface CreateGroupOptions {
  name: string;
  participantIds: string[];
  initialMessage?: string;
}

export interface AddParticipantsOptions {
  threadId: string;
  userIds: string[];
}

export interface RemoveParticipantsOptions {
  threadId: string;
  userIds: string[];
}

export interface PromoteParticipantsOptions {
  threadId: string;
  userIds: string[];
}

export interface DemoteParticipantsOptions {
  threadId: string;
  userIds: string[];
}

export interface UpdateThreadOptions {
  threadId: string;
  name?: string;
  color?: ThreadColor;
  emoji?: string;
  image?: Buffer | string;
  description?: string;
}

export interface SetNicknameOptions {
  threadId: string;
  userId: string;
  nickname: string;
}

export interface ThreadHistoryOptions {
  threadId: string;
  limit?: number;
  before?: number;
  after?: number;
  timestamp?: number;
}

export interface ThreadHistoryResult {
  messages: import('./messages.js').Message[];
  hasMore: boolean;
}

export interface PinMessageOptions {
  threadId: string;
  messageId: string;
}

export interface UnpinMessageOptions {
  threadId: string;
  messageId: string;
}

export interface MuteThreadOptions {
  threadId: string;
  duration?: number;
  until?: number;
}

export interface ArchiveThreadOptions {
  threadId: string;
  archive: boolean;
}

export interface DeleteThreadOptions {
  threadId: string;
}

export interface LeaveGroupOptions {
  threadId: string;
}

export interface JoinGroupOptions {
  link: string;
}

export interface GetThreadInfoOptions {
  threadId: string;
}

export interface GetThreadListOptions {
  limit?: number;
  before?: number;
  folder?: 'inbox' | 'archive' | 'pending' | 'other';
}

export interface GetThreadListResult {
  threads: Thread[];
  hasMore: boolean;
}

export interface ThreadEvent {
  type: 'rename' | 'add_participants' | 'remove_participants' | 'promote' | 'demote' | 'change_color' | 'change_emoji' | 'change_nickname' | 'change_image' | 'change_description' | 'approval_mode';
  threadId: string;
  author: string;
  timestamp: number;
  data: unknown;
}
