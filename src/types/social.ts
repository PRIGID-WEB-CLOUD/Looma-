export type PostCategory = string;

export interface PostCategoryRecord {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type ThemeMode = 'light' | 'dark';

export type TabId =
  | 'feed'
  | 'connections'
  | 'messages'
  | 'notifications'
  | 'profile'
  | 'settings'
  | 'public-profile'
  | 'auth';

export type ConnectionsTab = 'followers' | 'following' | 'friends';

export type ProfileVisibility = 'public' | 'followers';
export type MessagePrivacy = 'everyone' | 'following';

export interface UserProfile {
  uid: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarUrl: string;
  location: string;
  interests: string[];
  followersCount: number;
  followingCount: number;
  onboardingCompleted: boolean;
  isVerified?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UserPrivateSettings {
  uid: string;
  email: string;
  pushEnabled: boolean;
  themePreference: ThemeMode;
  notifyLikes: boolean;
  notifyComments: boolean;
  notifyMessages: boolean;
  profileVisibility: ProfileVisibility;
  messagePrivacy: MessagePrivacy;
  termsAcceptedVersion?: string;
  termsAcceptedAtMs?: number;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  authorVerified?: boolean;
  text: string;
  createdAtMs: number;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  authorVerified?: boolean;
  caption: string;
  imageUrl: string;
  videoUrl?: string;
  audioUrl?: string;
  linkUrl?: string;
  mediaTitle?: string;
  category: PostCategory;
  likesCount: number;
  commentsCount: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface DirectChatParticipantResolution {
  otherParticipantId: string | null;
  participant: UserProfile | null;
  displayName: string;
  handle: string;
  avatarUrl: string;
  isResolved: boolean;
  isValidDirectPair: boolean;
}

export interface ChatThread {
  id: string;
  title: string;
  isGroup: boolean;
  memberIds: string[];
  adminIds?: string[];
  partnerUid?: string;
  partnerAvatar: string;
  partnerHandle: string;
  isParticipantResolved?: boolean;
  lastMessageText: string;
  lastMessageSenderId: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type FeedFilter = 'All' | 'Following' | PostCategory;
export type FeedSortOrder = 'latest' | 'top';

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  memberIds: string[];
  createdAtMs: number;
}

export interface ChatTypingStatus {
  chatId: string;
  uid: string;
  isTyping: boolean;
  memberIds: string[];
  updatedAtMs: number;
}

export interface ChatReadReceipt {
  chatId: string;
  uid: string;
  lastReadAtMs: number;
  lastReadMessageId: string;
  memberIds: string[];
  updatedAtMs: number;
}

export interface CallParticipant {
  uid: string;
  name: string;
  avatar: string;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing?: boolean;
  isSpeaking?: boolean;
  connectionState?: 'invited' | 'joined' | 'declined' | 'left';
  cfSessionId?: string;
  audioTrackName?: string;
  videoTrackName?: string;
}

export interface CallSession {
  callId?: string;
  chatId: string;
  title: string;
  callerId?: string;
  callerName?: string;
  callerAvatar?: string;
  isAudioOnly: boolean;
  active: boolean;
  status?: 'ringing' | 'active' | 'ended';
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  participants: CallParticipant[];
  startedAtMs: number;
}

export interface IncomingCallInvite {
  callId: string;
  chatId: string;
  title: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  isAudioOnly: boolean;
  memberIds: string[];
  createdAtMs: number;
}

export type NotificationType =
  | 'like'
  | 'comment'
  | 'message'
  | 'follow'
  | 'system'
  | 'mention';

export interface AppNotification {
  id: string;
  recipientId: string;
  actorId: string;
  actorName: string;
  actorAvatar: string;
  type: NotificationType;
  title: string;
  body: string;
  targetPostId: string;
  read: boolean;
  createdAtMs: number;
}

export interface StoryItem {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  authorVerified?: boolean;
  imageUrl: string;
  caption: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface StoryGroup {
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  authorVerified?: boolean;
  items: StoryItem[];
  hasUnviewed: boolean;
  latestCreatedAtMs: number;
}

export type VerificationRequestStatus = 'pending' | 'approved' | 'rejected';

export interface VerificationRequest {
  id: string;
  uid: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  reason: string;
  links: string[];
  status: VerificationRequestStatus;
  reviewerUid?: string;
  reviewerNote?: string;
  createdAtMs: number;
  updatedAtMs: number;
}


