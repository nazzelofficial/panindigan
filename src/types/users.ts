/**
 * User and Profile Types
 */

export interface User {
  userId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  vanity?: string;
  profileUrl: string;
  thumbSrc?: string;
  photoUrl?: string;
  coverPhotoUrl?: string;
  isFriend: boolean;
  isBlocked: boolean;
  gender?: 'male' | 'female' | 'neutral';
  type: 'user' | 'page' | 'bot';
  isVerified: boolean;
  isActive: boolean;
  lastActiveTimestamp?: number;
}

export interface Profile extends User {
  bio?: string;
  about?: string;
  quotes?: string;
  birthday?: string;
  email?: string;
  phone?: string;
  website?: string;
  hometown?: Location;
  currentCity?: Location;
  work?: WorkExperience[];
  education?: Education[];
  relationshipStatus?: string;
  familyMembers?: FamilyMember[];
  friendCount?: number;
  mutualFriendCount?: number;
  isFollowing?: boolean;
  canMessage: boolean;
}

export interface Location {
  name: string;
  id?: string;
  city?: string;
  country?: string;
}

export interface WorkExperience {
  employer: string;
  position?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
}

export interface Education {
  school: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
}

export interface FamilyMember {
  userId: string;
  name: string;
  relationship: string;
}

export interface FriendRequest {
  userId: string;
  name: string;
  photoUrl?: string;
  mutualFriends?: number;
  timestamp: number;
  message?: string;
}

export interface FriendList {
  id: string;
  name: string;
  memberCount: number;
}

export interface Presence {
  userId: string;
  status: 'active' | 'idle' | 'offline';
  lastActive?: number;
  isActive: boolean;
}

export interface SearchUsersOptions {
  query: string;
  limit?: number;
}

export interface SearchUsersResult {
  users: User[];
  hasMore: boolean;
}

export interface GetFriendsOptions {
  userId?: string;
  limit?: number;
  offset?: number;
}

export interface GetFriendsResult {
  friends: User[];
  hasMore: boolean;
}

export interface SendFriendRequestOptions {
  userId: string;
  message?: string;
}

export interface AcceptFriendRequestOptions {
  userId: string;
}

export interface DeclineFriendRequestOptions {
  userId: string;
}

export interface CancelFriendRequestOptions {
  userId: string;
}

export interface UnfriendOptions {
  userId: string;
}

export interface BlockUserOptions {
  userId: string;
}

export interface UnblockUserOptions {
  userId: string;
}

export interface GetBlockedListResult {
  users: User[];
}

export interface Birthday {
  userId: string;
  name: string;
  date: string;
  age?: number;
}

export interface GetBirthdaysResult {
  today: Birthday[];
  upcoming: Birthday[];
  recent: Birthday[];
}
