import type {
  AppNotification,
  ChatMessage,
  ChatThread,
  Post,
  PostComment,
  StoryItem,
  UserProfile,
} from '../types/social';

export const ASSET_AVATAR_MAYA = '/images/avatar_maya_1794518947315.jpg';
export const ASSET_AVATAR_KENJI = '/images/avatar_kenji_1794518947553.jpg';
export const ASSET_AVATAR_ELENA = '/images/avatar_elena_1794518948136.jpg';
export const ASSET_POST_ARCH = '/images/post_architecture_1794518948238.jpg';
export const ASSET_POST_CAFE = '/images/post_cafe_workspace_1794518949649.jpg';
export const ASSET_POST_ALPINE = '/images/post_alpine_trail_1794518949014.jpg';

export const DEMO_USER_IDS = new Set<string>([
  'creator_maya',
  'creator_kenji',
  'creator_elena',
  'creator_soren',
  'creator_nadia',
]);

export const DEMO_CHAT_IDS = new Set<string>([
  'chat_maya',
  'chat_kenji',
  'chat_studio_group',
]);

export const DEMO_NOTIFICATION_IDS = new Set<string>([
  'notif_1',
  'notif_2',
  'notif_3',
]);

export function isDemoUserId(uid: string): boolean {
  return DEMO_USER_IDS.has(uid);
}

export function isDemoPostId(postId: string): boolean {
  return postId.startsWith('seed_post_');
}

export function isDemoStoryId(storyId: string): boolean {
  return (
    storyId.startsWith('story_maya_') ||
    storyId.startsWith('story_kenji_') ||
    storyId.startsWith('story_elena_') ||
    storyId.startsWith('story_soren_') ||
    storyId.startsWith('story_nadia_')
  );
}

export function isDemoChatId(chatId: string): boolean {
  return DEMO_CHAT_IDS.has(chatId);
}

export function isDemoNotificationId(notifId: string): boolean {
  return DEMO_NOTIFICATION_IDS.has(notifId);
}

export function stripDemoUsers(users: UserProfile[]): UserProfile[] {
  return users.filter((u) => u && !isDemoUserId(u.uid));
}

export function stripDemoPosts(posts: Post[]): Post[] {
  return posts.filter(
    (p) => p && !isDemoPostId(p.id) && !isDemoUserId(p.authorId)
  );
}

export function stripDemoStories(stories: StoryItem[]): StoryItem[] {
  return stories.filter(
    (s) => s && !isDemoStoryId(s.id) && !isDemoUserId(s.authorId)
  );
}

export function stripDemoComments(
  commentsByPost: Record<string, PostComment[]>
): Record<string, PostComment[]> {
  const cleaned: Record<string, PostComment[]> = {};
  for (const [postId, list] of Object.entries(commentsByPost)) {
    if (isDemoPostId(postId) || !Array.isArray(list)) continue;
    const filtered = list.filter((c) => c && !isDemoUserId(c.authorId));
    if (filtered.length > 0) {
      cleaned[postId] = filtered;
    }
  }
  return cleaned;
}

export function stripDemoThreads(threads: ChatThread[]): ChatThread[] {
  return threads
    .filter((t) => {
      if (!t || isDemoChatId(t.id)) return false;
      const nonDemoMembers = (t.memberIds || []).filter((id) => !isDemoUserId(id));
      return nonDemoMembers.length > 0;
    })
    .map((t) => ({
      ...t,
      memberIds: (t.memberIds || []).filter((id) => !isDemoUserId(id)),
    }));
}

export function stripDemoMessages(
  messagesByChat: Record<string, ChatMessage[]>
): Record<string, ChatMessage[]> {
  const cleaned: Record<string, ChatMessage[]> = {};
  for (const [chatId, list] of Object.entries(messagesByChat)) {
    if (isDemoChatId(chatId) || !Array.isArray(list)) continue;
    const filtered = list.filter((m) => m && !isDemoUserId(m.senderId));
    if (filtered.length > 0) {
      cleaned[chatId] = filtered;
    }
  }
  return cleaned;
}

export function stripDemoNotifications(
  notifications: AppNotification[]
): AppNotification[] {
  return notifications.filter(
    (n) =>
      n &&
      !isDemoNotificationId(n.id) &&
      !isDemoUserId(n.actorId) &&
      !isDemoPostId(n.targetPostId)
  );
}

export const SEED_CREATORS: UserProfile[] = [];
export const SEED_COMMUNITY_MEMBERS: UserProfile[] = [];
export const DEFAULT_FOLLOWER_IDS: string[] = [];
export const DEFAULT_FOLLOWED_IDS: string[] = [];
export const DEFAULT_ONLINE_USER_IDS: string[] = [];
export const SEED_FOLLOW_GRAPH: Record<
  string,
  { followers: string[]; following: string[] }
> = {};

export function createInitialMemberProfile(
  overrides: Partial<UserProfile> = {}
): UserProfile {
  const now = Date.now();
  return {
    uid: 'member_alex',
    displayName: 'Alex Rivera',
    handle: 'alex.rivera',
    bio: 'Exploring cross-platform product design, daylight photography, and quiet morning routines.',
    avatarUrl: '',
    location: 'San Francisco',
    interests: ['Architecture', 'Photography', 'Industrial Design'],
    followersCount: 0,
    followingCount: 0,
    onboardingCompleted: false,
    createdAtMs: now,
    updatedAtMs: now,
    ...overrides,
  };
}
