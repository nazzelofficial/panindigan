/**
 * Event Types for MQTT and Real-time System
 */

export type EventType = 
  | 'message'
  | 'message_reaction'
  | 'message_reply'
  | 'message_edit'
  | 'message_unsend'
  | 'typ'
  | 'read_receipt'
  | 'delivery_receipt'
  | 'presence'
  | 'thread_rename'
  | 'thread_color'
  | 'thread_emoji'
  | 'thread_image'
  | 'thread_nickname'
  | 'thread_add_participants'
  | 'thread_remove_participants'
  | 'thread_promote'
  | 'thread_demote'
  | 'thread_approval_mode'
  | 'thread_leave'
  | 'friend_request'
  | 'friend_accept'
  | 'friend_remove'
  | 'block'
  | 'unblock'
  | 'call'
  | 'story'
  | 'poll'
  | 'event'
  | 'connect'
  | 'disconnect'
  | 'error';

export interface BaseEvent {
  type: EventType;
  timestamp: number;
}

export interface MessageEvent extends BaseEvent {
  type: 'message';
  message: import('./messages.js').Message;
}

export interface MessageReactionEvent extends BaseEvent {
  type: 'message_reaction';
  threadId: string;
  messageId: string;
  userId: string;
  reaction: import('./messages.js').ReactionType | null;
}

export interface TypingEvent extends BaseEvent {
  type: 'typ';
  threadId: string;
  userId: string;
  isTyping: boolean;
}

export interface ReadReceiptEvent extends BaseEvent {
  type: 'read_receipt';
  threadId: string;
  userId: string;
  watermarkTimestamp: number;
}

export interface DeliveryReceiptEvent extends BaseEvent {
  type: 'delivery_receipt';
  threadId: string;
  userId: string;
  deliveredTimestamp: number;
}

export interface PresenceEvent extends BaseEvent {
  type: 'presence';
  userId: string;
  status: 'active' | 'idle' | 'offline';
  lastActive?: number;
}

export interface ThreadRenameEvent extends BaseEvent {
  type: 'thread_rename';
  threadId: string;
  author: string;
  name: string;
}

export interface ThreadColorEvent extends BaseEvent {
  type: 'thread_color';
  threadId: string;
  author: string;
  color: import('./threads.js').ThreadColor;
}

export interface ThreadEmojiEvent extends BaseEvent {
  type: 'thread_emoji';
  threadId: string;
  author: string;
  emoji: string;
}

export interface ThreadImageEvent extends BaseEvent {
  type: 'thread_image';
  threadId: string;
  author: string;
  imageUrl: string;
}

export interface ThreadNicknameEvent extends BaseEvent {
  type: 'thread_nickname';
  threadId: string;
  author: string;
  participantId: string;
  nickname: string;
}

export interface ThreadParticipantsEvent extends BaseEvent {
  type: 'thread_add_participants' | 'thread_remove_participants';
  threadId: string;
  author: string;
  participantIds: string[];
}

export interface ThreadAdminEvent extends BaseEvent {
  type: 'thread_promote' | 'thread_demote';
  threadId: string;
  author: string;
  participantIds: string[];
}

export interface ThreadLeaveEvent extends BaseEvent {
  type: 'thread_leave';
  threadId: string;
  userId: string;
}

export interface FriendRequestEvent extends BaseEvent {
  type: 'friend_request';
  userId: string;
  name: string;
}

export interface FriendAcceptEvent extends BaseEvent {
  type: 'friend_accept';
  userId: string;
  name: string;
}

export interface FriendRemoveEvent extends BaseEvent {
  type: 'friend_remove';
  userId: string;
}

export interface BlockEvent extends BaseEvent {
  type: 'block' | 'unblock';
  userId: string;
}

export interface CallEvent extends BaseEvent {
  type: 'call';
  callId: string;
  threadId: string;
  callerId: string;
  isVideo: boolean;
  isGroupCall: boolean;
  status: 'started' | 'ended' | 'missed';
  duration?: number;
}

export interface StoryEvent extends BaseEvent {
  type: 'story';
  storyId: string;
  authorId: string;
  action: 'added' | 'viewed' | 'reaction' | 'reply';
  data?: unknown;
}

export interface PollEvent extends BaseEvent {
  type: 'poll';
  pollId: string;
  threadId: string;
  action: 'created' | 'voted' | 'closed';
  data?: unknown;
}

export interface EventPlannerEvent extends BaseEvent {
  type: 'event';
  eventId: string;
  threadId: string;
  action: 'created' | 'updated' | 'rsvp';
  data?: unknown;
}

export interface ConnectEvent extends BaseEvent {
  type: 'connect';
}

export interface DisconnectEvent extends BaseEvent {
  type: 'disconnect';
  reason?: string;
  willRetry: boolean;
}

export interface ErrorEvent extends BaseEvent {
  type: 'error';
  error: Error;
  fatal: boolean;
}

export type PanindiganEvent =
  | MessageEvent
  | MessageReactionEvent
  | TypingEvent
  | ReadReceiptEvent
  | DeliveryReceiptEvent
  | PresenceEvent
  | ThreadRenameEvent
  | ThreadColorEvent
  | ThreadEmojiEvent
  | ThreadImageEvent
  | ThreadNicknameEvent
  | ThreadParticipantsEvent
  | ThreadAdminEvent
  | ThreadLeaveEvent
  | FriendRequestEvent
  | FriendAcceptEvent
  | FriendRemoveEvent
  | BlockEvent
  | CallEvent
  | StoryEvent
  | PollEvent
  | EventPlannerEvent
  | ConnectEvent
  | DisconnectEvent
  | ErrorEvent;

export type EventListener<T extends PanindiganEvent> = (event: T) => void | Promise<void>;

export interface EventHandlerMap {
  message: MessageEvent;
  message_reaction: MessageReactionEvent;
  typ: TypingEvent;
  read_receipt: ReadReceiptEvent;
  delivery_receipt: DeliveryReceiptEvent;
  presence: PresenceEvent;
  thread_rename: ThreadRenameEvent;
  thread_color: ThreadColorEvent;
  thread_emoji: ThreadEmojiEvent;
  thread_image: ThreadImageEvent;
  thread_nickname: ThreadNicknameEvent;
  thread_add_participants: ThreadParticipantsEvent;
  thread_remove_participants: ThreadParticipantsEvent;
  thread_promote: ThreadAdminEvent;
  thread_demote: ThreadAdminEvent;
  thread_leave: ThreadLeaveEvent;
  friend_request: FriendRequestEvent;
  friend_accept: FriendAcceptEvent;
  friend_remove: FriendRemoveEvent;
  block: BlockEvent;
  unblock: BlockEvent;
  call: CallEvent;
  story: StoryEvent;
  poll: PollEvent;
  event: EventPlannerEvent;
  connect: ConnectEvent;
  disconnect: DisconnectEvent;
  error: ErrorEvent;
}
