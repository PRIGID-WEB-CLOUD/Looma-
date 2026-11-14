import type {
  AppNotification,
  ChatMessage,
  ChatThread,
  Post,
  PostCategory,
  StoryGroup,
  StoryItem,
  UserProfile,
} from '../types/social';

export const POST_CATEGORIES: PostCategory[] = [
  'Architecture',
  'Photography',
  'Design',
  'Travel',
  'Journal',
];

export const INTEREST_OPTIONS: string[] = [
  'Architecture',
  'Photography',
  'Industrial Design',
  'Alpine Travel',
  'Typography',
  'Analog Film',
  'Urbanism',
  'Studio Craft',
];

export function sanitizeHandle(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 32);
  return cleaned.length >= 2 ? cleaned : 'looma_member';
}

export function normalizeAssetUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('/src/assets/images/')) {
    return url.replace('/src/assets/images/', '/images/');
  }
  return url;
}

export function validatePostInput(
  caption: string,
  category: string,
  hasAttachment: boolean = false
): { valid: boolean; error?: string } {
  const trimmed = caption.trim();
  if (!trimmed && !hasAttachment) {
    return { valid: false, error: 'Write a caption or attach media/link before publishing.' };
  }
  if (trimmed.length > 1200) {
    return {
      valid: false,
      error: 'Caption must be 1,200 characters or fewer.',
    };
  }
  if (!POST_CATEGORIES.includes(category as PostCategory)) {
    return { valid: false, error: 'Choose a valid topic category.' };
  }
  return { valid: true };
}

export function validateProfileInput(
  displayName: string,
  handle: string,
  bio: string
): { valid: boolean; error?: string } {
  const name = displayName.trim();
  const cleanHandle = handle.trim().replace(/^@+/, '');
  if (name.length < 1 || name.length > 60) {
    return {
      valid: false,
      error: 'Display name must be between 1 and 60 characters.',
    };
  }
  if (!/^[a-zA-Z0-9_.]{2,32}$/.test(cleanHandle)) {
    return {
      valid: false,
      error:
        'Handle must be 2–32 characters using letters, numbers, dots, or underscores.',
    };
  }
  if (bio.trim().length > 280) {
    return { valid: false, error: 'Bio must be 280 characters or fewer.' };
  }
  return { valid: true };
}

export function validateCommentInput(text: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { valid: false, error: 'Comment cannot be empty.' };
  }
  if (trimmed.length > 500) {
    return { valid: false, error: 'Comment must be 500 characters or fewer.' };
  }
  return { valid: true };
}

export function paginateFeed(
  posts: Post[],
  pageSize: number,
  visibleCount: number,
  category: 'All' | PostCategory,
  searchQuery: string
): { items: Post[]; filteredTotal: number; hasMore: boolean } {
  const query = searchQuery.trim().toLowerCase();
  const filtered = posts
    .filter((post) => {
      if (category !== 'All' && post.category !== category) {
        return false;
      }
      if (!query) return true;
      return (
        post.caption.toLowerCase().includes(query) ||
        post.authorName.toLowerCase().includes(query) ||
        post.authorHandle.toLowerCase().includes(query) ||
        post.category.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  const safeLimit = Math.max(pageSize, visibleCount);
  const items = filtered.slice(0, safeLimit);
  return {
    items,
    filteredTotal: filtered.length,
    hasMore: items.length < filtered.length,
  };
}

export function togglePostLikeState(
  post: Post,
  currentlyLiked: boolean
): { post: Post; liked: boolean } {
  const nextLiked = !currentlyLiked;
  const nextLikes = Math.max(0, post.likesCount + (nextLiked ? 1 : -1));
  return {
    liked: nextLiked,
    post: {
      ...post,
      likesCount: nextLikes,
    },
  };
}

export function countUnreadNotifications(
  notifications: AppNotification[]
): number {
  return notifications.reduce((acc, item) => acc + (item.read ? 0 : 1), 0);
}

export function formatRelativeTime(
  timestampMs: number,
  nowMs: number = Date.now()
): string {
  const diffSec = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const date = new Date(timestampMs);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function buildChatPreview(messages: ChatMessage[]): string {
  if (messages.length === 0) return 'No messages yet';
  const sorted = [...messages].sort((a, b) => a.createdAtMs - b.createdAtMs);
  const latest = sorted[sorted.length - 1];
  const text = latest.text.trim();
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

export function resolvePublicProfile(
  targetUid: string,
  currentProfile: UserProfile,
  seedCreators: UserProfile[],
  posts: Post[]
): UserProfile | null {
  if (targetUid === currentProfile.uid) {
    return currentProfile;
  }
  const seedMatch = seedCreators.find((c) => c.uid === targetUid);
  if (seedMatch) {
    return seedMatch;
  }
  const authorPost = posts.find((p) => p.authorId === targetUid);
  if (!authorPost) return null;
  return {
    uid: authorPost.authorId,
    displayName: authorPost.authorName,
    handle: authorPost.authorHandle,
    bio: 'Creator on Looma.',
    avatarUrl: authorPost.authorAvatar,
    location: 'Looma Community',
    interests: [authorPost.category],
    followersCount: 0,
    followingCount: 0,
    onboardingCompleted: true,
    createdAtMs: authorPost.createdAtMs,
    updatedAtMs: authorPost.updatedAtMs,
  };
}

export function toggleFollowState(
  followedIds: string[],
  targetUid: string,
  currentFollowingCount: number
): { followedIds: string[]; isFollowing: boolean; followingCount: number } {
  const already = followedIds.includes(targetUid);
  if (already) {
    return {
      followedIds: followedIds.filter((id) => id !== targetUid),
      isFollowing: false,
      followingCount: Math.max(0, currentFollowingCount - 1),
    };
  }
  return {
    followedIds: [...followedIds, targetUid],
    isFollowing: true,
    followingCount: currentFollowingCount + 1,
  };
}

export function validateAuthForm(
  mode: 'signin' | 'signup',
  handle: string,
  displayName: string = ''
): { valid: boolean; error?: string } {
  const cleanHandle = handle.trim().replace(/^@+/, '');
  if (!/^[a-zA-Z0-9_.]{2,32}$/.test(cleanHandle)) {
    return {
      valid: false,
      error:
        'Handle must be 2–32 characters using letters, numbers, dots, or underscores.',
    };
  }
  if (mode === 'signup') {
    const trimmedName = displayName.trim();
    if (trimmedName.length < 1 || trimmedName.length > 60) {
      return {
        valid: false,
        error: 'Display name must be between 1 and 60 characters.',
      };
    }
  }
  return { valid: true };
}

export function computeConnections(
  users: UserProfile[],
  followerIds: string[],
  followedIds: string[]
): {
  followers: UserProfile[];
  following: UserProfile[];
  friends: UserProfile[];
} {
  const byId = new Map<string, UserProfile>();
  for (const user of users) {
    byId.set(user.uid, user);
  }
  const followerSet = new Set(followerIds);
  const followedSet = new Set(followedIds);

  const followers = followerIds.map((id) => {
    let u = byId.get(id);
    if (!u) {
      u = {
        uid: id,
        displayName: id.replace(/_/g, ' ').replace(/^creator\s*/i, 'Creator '),
        handle: id.replace(/^creator_/, ''),
        bio: 'Community member on Looma.',
        avatarUrl: '/images/avatar_maya_1794518947315.jpg',
        location: 'Looma Network',
        interests: ['Architecture', 'Design'],
        followersCount: 1,
        followingCount: 1,
        onboardingCompleted: true,
        createdAtMs: Date.now() - 86400_000,
        updatedAtMs: Date.now(),
      };
    }
    return u;
  });

  const following = followedIds.map((id) => {
    let u = byId.get(id);
    if (!u) {
      u = {
        uid: id,
        displayName: id.replace(/_/g, ' ').replace(/^creator\s*/i, 'Creator '),
        handle: id.replace(/^creator_/, ''),
        bio: 'Community member on Looma.',
        avatarUrl: '/images/avatar_kenji_1794518947553.jpg',
        location: 'Looma Network',
        interests: ['Photography', 'Travel'],
        followersCount: 1,
        followingCount: 1,
        onboardingCompleted: true,
        createdAtMs: Date.now() - 86400_000,
        updatedAtMs: Date.now(),
      };
    }
    return u;
  });

  const mutualIds = new Set([...followerIds].filter((id) => followedSet.has(id)));
  const friends = Array.from(mutualIds).map((id) => {
    let u = byId.get(id);
    if (!u) {
      u = {
        uid: id,
        displayName: id.replace(/_/g, ' ').replace(/^creator\s*/i, 'Creator '),
        handle: id.replace(/^creator_/, ''),
        bio: 'Mutual friend on Looma.',
        avatarUrl: '/images/avatar_elena_1794518948136.jpg',
        location: 'Looma Network',
        interests: ['Architecture', 'Journal'],
        followersCount: 2,
        followingCount: 2,
        onboardingCompleted: true,
        createdAtMs: Date.now() - 86400_000,
        updatedAtMs: Date.now(),
      };
    }
    return u;
  });

  return { followers, following, friends };
}

export function computeOtherUserConnections(
  targetUid: string,
  currentUser: UserProfile,
  allUsers: UserProfile[],
  myFollowedIds: string[],
  myFollowerIds: string[],
  seedGraph: Record<string, { followers: string[]; following: string[] }>,
  remoteFollowersIds: string[] = [],
  remoteFollowingIds: string[] = []
): {
  followerIds: string[];
  followingIds: string[];
  followers: UserProfile[];
  following: UserProfile[];
  friends: UserProfile[];
} {
  const seedEdge = seedGraph[targetUid];
  const baseFollowers = new Set<string>([
    ...(seedEdge?.followers || []),
    ...remoteFollowersIds,
  ]);
  const baseFollowing = new Set<string>([
    ...(seedEdge?.following || []),
    ...remoteFollowingIds,
  ]);

  if (myFollowedIds.includes(targetUid)) {
    baseFollowers.add(currentUser.uid);
  } else {
    baseFollowers.delete(currentUser.uid);
  }

  if (myFollowerIds.includes(targetUid)) {
    baseFollowing.add(currentUser.uid);
  } else {
    baseFollowing.delete(currentUser.uid);
  }

  baseFollowers.delete(targetUid);
  baseFollowing.delete(targetUid);

  const followerIds = Array.from(baseFollowers);
  const followingIds = Array.from(baseFollowing);
  const pool = [currentUser, ...allUsers.filter((u) => u.uid !== currentUser.uid)];
  const grouped = computeConnections(pool, followerIds, followingIds);

  return {
    followerIds,
    followingIds,
    ...grouped,
  };
}

export function filterUsersByQuery(
  users: UserProfile[],
  searchQuery: string
): UserProfile[] {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return users;
  return users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(q) ||
      u.handle.toLowerCase().includes(q) ||
      u.location.toLowerCase().includes(q) ||
      u.bio.toLowerCase().includes(q) ||
      u.interests.some((topic) => topic.toLowerCase().includes(q))
  );
}

export function isUserOnline(uid: string, onlineUserIds: string[]): boolean {
  return onlineUserIds.includes(uid);
}

export function getThreadOnlineStatus(
  thread: ChatThread,
  currentUid: string,
  onlineUserIds: string[]
): { isOnline: boolean; onlineCount: number; statusLabel: string } {
  const otherMembers = thread.memberIds.filter((id) => id !== currentUid);
  const onlineOthers = otherMembers.filter((id) => onlineUserIds.includes(id));

  if (thread.isGroup) {
    return {
      isOnline: onlineOthers.length > 0,
      onlineCount: onlineOthers.length,
      statusLabel:
        onlineOthers.length > 0
          ? `${onlineOthers.length} online`
          : thread.partnerHandle,
    };
  }

  const online = onlineOthers.length > 0;
  return {
    isOnline: online,
    onlineCount: online ? 1 : 0,
    statusLabel: online ? 'Online' : 'Offline',
  };
}

export function groupStoriesByAuthor(
  stories: StoryItem[],
  currentUid: string,
  viewedStoryIds: string[],
  nowMs: number = Date.now()
): StoryGroup[] {
  const active = stories.filter((s) => s.expiresAtMs > nowMs);
  const grouped = new Map<string, StoryItem[]>();

  for (const story of active) {
    const bucket = grouped.get(story.authorId) || [];
    bucket.push(story);
    grouped.set(story.authorId, bucket);
  }

  const groups: StoryGroup[] = [];
  for (const [authorId, items] of grouped.entries()) {
    const sortedItems = [...items].sort((a, b) => a.createdAtMs - b.createdAtMs);
    const latest = sortedItems[sortedItems.length - 1];
    const hasUnviewed = sortedItems.some((s) => !viewedStoryIds.includes(s.id));
    groups.push({
      authorId,
      authorName: latest.authorName,
      authorHandle: latest.authorHandle,
      authorAvatar: latest.authorAvatar,
      items: sortedItems,
      hasUnviewed,
      latestCreatedAtMs: latest.createdAtMs,
    });
  }

  return groups.sort((a, b) => {
    if (a.authorId === currentUid) return -1;
    if (b.authorId === currentUid) return 1;
    if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
    return b.latestCreatedAtMs - a.latestCreatedAtMs;
  });
}

export function findAccountByHandle(
  accounts: UserProfile[],
  rawHandle: string
): UserProfile | null {
  const normalized = rawHandle.trim().replace(/^@+/, '').toLowerCase();
  if (!normalized) return null;
  return (
    accounts.find((acc) => acc.handle.toLowerCase() === normalized) || null
  );
}

export function canUseAutostart(search: string, hostname: string): boolean {
  const params = new URLSearchParams(search);
  if (params.get('autostart') !== '1') return false;
  const host = hostname.trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1';
}

export function isAuthorizedSession(
  hasFirebaseUser: boolean,
  emailVerified: boolean,
  isLocalAutostart: boolean
): boolean {
  if (isLocalAutostart) return true;
  return hasFirebaseUser && emailVerified;
}

export function resolveAppStage(
  isAuthenticated: boolean,
  onboardingCompleted: boolean,
  authReady: boolean = true
): 'loading' | 'auth' | 'onboarding' | 'app' {
  if (!authReady) return 'loading';
  if (!isAuthenticated) return 'auth';
  if (!onboardingCompleted) return 'onboarding';
  return 'app';
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/(https?:\/\/[^\s]+)/i);
  if (!match) return null;
  return match[0].replace(/[),.;!?]+$/, '');
}

export type RichMediaKind = 'youtube' | 'vimeo' | 'video' | 'audio' | 'image' | 'link';

export interface ParsedRichUrl {
  url: string;
  kind: RichMediaKind;
  hostname: string;
  embedUrl?: string;
  thumbnailUrl?: string;
  displayTitle: string;
  subtitle: string;
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id || null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v');
      }
      const parts = parsed.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') && parts[1]) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function extractVimeoVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'vimeo.com') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return id;
    }
  } catch {
    return null;
  }
  return null;
}

export function parseRichUrl(rawUrl: string, customTitle?: string): ParsedRichUrl | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:video/')) {
    return {
      url: trimmed,
      kind: 'video',
      hostname: 'uploaded-video',
      displayTitle: customTitle || 'Uploaded Video',
      subtitle: 'Embedded video clip',
    };
  }
  if (trimmed.startsWith('data:audio/')) {
    return {
      url: trimmed,
      kind: 'audio',
      hostname: 'uploaded-audio',
      displayTitle: customTitle || 'Uploaded Audio',
      subtitle: 'Embedded audio track',
    };
  }
  if (trimmed.startsWith('data:image/')) {
    return {
      url: trimmed,
      kind: 'image',
      hostname: 'uploaded-image',
      displayTitle: customTitle || 'Uploaded Image',
      subtitle: 'Image attachment',
    };
  }

  let parsed: URL;
  const isInternalStorageUrl = trimmed.startsWith('/api/storage/file/');
  try {
    parsed = isInternalStorageUrl
      ? new URL(trimmed, 'https://r2-storage.local')
      : new URL(trimmed);
  } catch {
    return null;
  }

  const hostname = isInternalStorageUrl
    ? 'cloudflare-r2'
    : parsed.hostname.replace(/^www\./, '');
  const pathnameLower = parsed.pathname.toLowerCase();

  const ytId = extractYouTubeVideoId(trimmed);
  if (ytId) {
    return {
      url: trimmed,
      kind: 'youtube',
      hostname,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      displayTitle: customTitle || 'YouTube Video',
      subtitle: `${hostname} · Interactive video embed`,
    };
  }

  const vimeoId = extractVimeoVideoId(trimmed);
  if (vimeoId) {
    return {
      url: trimmed,
      kind: 'vimeo',
      hostname,
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
      displayTitle: customTitle || 'Vimeo Video',
      subtitle: `${hostname} · Interactive video embed`,
    };
  }

  if (/\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(pathnameLower)) {
    return {
      url: trimmed,
      kind: 'video',
      hostname,
      displayTitle: customTitle || deriveTitleFromPath(parsed) || 'Video Clip',
      subtitle: `${hostname} · Direct video playback`,
    };
  }

  if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(pathnameLower)) {
    return {
      url: trimmed,
      kind: 'audio',
      hostname,
      displayTitle: customTitle || deriveTitleFromPath(parsed) || 'Audio Track',
      subtitle: `${hostname} · Direct audio playback`,
    };
  }

  if (/\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(pathnameLower)) {
    return {
      url: trimmed,
      kind: 'image',
      hostname,
      displayTitle: customTitle || deriveTitleFromPath(parsed) || 'Image Link',
      subtitle: `${hostname} · Image preview`,
    };
  }

  const derived = deriveTitleFromPath(parsed);
  return {
    url: trimmed,
    kind: 'link',
    hostname,
    displayTitle: customTitle || derived || hostname,
    subtitle: parsed.pathname && parsed.pathname !== '/' ? `${hostname}${parsed.pathname}` : trimmed,
  };
}

function deriveTitleFromPath(parsed: URL): string {
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return parsed.hostname.replace(/^www\./, '');
  const last = decodeURIComponent(segments[segments.length - 1])
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!last || last.length < 2) return parsed.hostname.replace(/^www\./, '');
  return last.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
}

export function canSharePostToStory(
  postAuthorId: string,
  currentUid: string
): boolean {
  return Boolean(currentUid) && postAuthorId === currentUid;
}

export function buildStoryFromPost(post: Post): {
  imageUrl: string;
  caption: string;
} {
  let imageUrl = (post.imageUrl || '').trim();
  if (!imageUrl) {
    const candidateUrl =
      post.videoUrl || post.linkUrl || extractFirstUrl(post.caption) || '';
    const parsed = candidateUrl
      ? parseRichUrl(candidateUrl, post.mediaTitle || undefined)
      : null;
    if (parsed?.kind === 'image') {
      imageUrl = parsed.url;
    } else if (parsed?.thumbnailUrl) {
      imageUrl = parsed.thumbnailUrl;
    }
  }

  const rawText =
    post.caption.trim() ||
    post.mediaTitle?.trim() ||
    post.linkUrl?.trim() ||
    'Shared a post';

  const caption =
    rawText.length > 280
      ? `${rawText.slice(0, 277).trimEnd()}...`
      : rawText;

  return { imageUrl, caption };
}

export interface TextToken {
  type: 'text' | 'hashtag' | 'mention';
  value: string;
  raw: string;
}

export const POPULAR_HASHTAGS: string[] = [
  'architecture',
  'photography',
  'design',
  'travel',
  'journal',
  'studio',
  'minimalism',
  'typography',
  'analog',
  'copenhagen',
  'kyoto',
  'zurich',
];

export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const regex = /(?:^|\s)#([a-zA-Z0-9_]+)/g;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const tag = m[1].toLowerCase();
    if (!matches.includes(tag)) {
      matches.push(tag);
    }
  }
  return matches;
}

export function extractMentions(text: string): string[] {
  if (!text) return [];
  const regex = /(?:^|\s)@([a-zA-Z0-9_.]{2,32})/g;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const handle = m[1].toLowerCase().replace(/\.+$/, '');
    if (handle.length >= 2 && !matches.includes(handle)) {
      matches.push(handle);
    }
  }
  return matches;
}

export function parseTextWithTagsAndMentions(text: string): TextToken[] {
  if (!text) return [];
  const tokens: TextToken[] = [];
  const tokenRegex = /(^|\s)(#[a-zA-Z0-9_]+|@[a-zA-Z0-9_.]{2,32})/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const leadingSpace = match[1];
    const tagOrMention = match[2];
    const matchStart = match.index;
    const tagStart = matchStart + leadingSpace.length;

    if (tagStart > lastIndex) {
      tokens.push({
        type: 'text',
        value: text.slice(lastIndex, tagStart),
        raw: text.slice(lastIndex, tagStart),
      });
    }

    if (tagOrMention.startsWith('#')) {
      const tagValue = tagOrMention.slice(1);
      tokens.push({
        type: 'hashtag',
        value: tagValue.toLowerCase(),
        raw: tagOrMention,
      });
    } else {
      let handleValue = tagOrMention.slice(1);
      let trailingPunct = '';
      if (handleValue.endsWith('.')) {
        handleValue = handleValue.slice(0, -1);
        trailingPunct = '.';
      }
      tokens.push({
        type: 'mention',
        value: handleValue.toLowerCase(),
        raw: `@${handleValue}`,
      });
      if (trailingPunct) {
        tokens.push({
          type: 'text',
          value: trailingPunct,
          raw: trailingPunct,
        });
      }
    }

    lastIndex = tagStart + tagOrMention.length;
  }

  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      value: text.slice(lastIndex),
      raw: text.slice(lastIndex),
    });
  }

  return tokens;
}

export function getMentionQueryAtCursor(
  text: string,
  cursorPosition: number
): { query: string; startIndex: number } | null {
  if (cursorPosition <= 0) return null;
  const left = text.slice(0, cursorPosition);
  const match = left.match(/(?:^|\s)@([a-zA-Z0-9_.]*)$/);
  if (!match) return null;
  const query = match[1].toLowerCase();
  const atPos = left.lastIndexOf('@');
  return { query, startIndex: atPos };
}

export function getHashtagQueryAtCursor(
  text: string,
  cursorPosition: number
): { query: string; startIndex: number } | null {
  if (cursorPosition <= 0) return null;
  const left = text.slice(0, cursorPosition);
  const match = left.match(/(?:^|\s)#([a-zA-Z0-9_]*)$/);
  if (!match) return null;
  const query = match[1].toLowerCase();
  const hashPos = left.lastIndexOf('#');
  return { query, startIndex: hashPos };
}

export function filterCreatorsForMention(
  query: string,
  creators: UserProfile[]
): UserProfile[] {
  const clean = query.trim().toLowerCase();
  return creators
    .filter((c) => {
      if (!clean) return true;
      return (
        c.handle.toLowerCase().includes(clean) ||
        c.displayName.toLowerCase().includes(clean)
      );
    })
    .slice(0, 5);
}

export function filterHashtags(
  query: string,
  availableTags: string[] = POPULAR_HASHTAGS
): string[] {
  const clean = query.trim().toLowerCase().replace(/^#/, '');
  const combined = Array.from(new Set([...availableTags, ...POPULAR_HASHTAGS]));
  return combined
    .filter((tag) => (!clean ? true : tag.toLowerCase().includes(clean)))
    .slice(0, 6);
}

export const MAX_GROUP_MEMBERS = 10;

export function validateGroupChatInput(
  title: string,
  participantIds: string[],
  creatorUid: string
): { valid: boolean; error?: string; memberIds?: string[]; title?: string } {
  const cleanTitle = title.trim();
  if (cleanTitle.length < 1 || cleanTitle.length > 80) {
    return {
      valid: false,
      error: 'Group name must be between 1 and 80 characters.',
    };
  }
  const uniqueMembers = Array.from(
    new Set([creatorUid, ...participantIds].filter(Boolean))
  );
  if (uniqueMembers.length < 2) {
    return {
      valid: false,
      error: 'Select at least 1 other participant to create a group chat.',
    };
  }
  if (uniqueMembers.length > MAX_GROUP_MEMBERS) {
    return {
      valid: false,
      error: `Group chats support up to ${MAX_GROUP_MEMBERS} participants.`,
    };
  }
  return { valid: true, memberIds: uniqueMembers, title: cleanTitle };
}

export function createGroupThreadRecord(params: {
  id: string;
  title: string;
  creator: UserProfile;
  participants: UserProfile[];
  nowMs?: number;
}): ChatThread {
  const now = params.nowMs ?? Date.now();
  const cleanTitle = params.title.trim().slice(0, 80);
  const memberIds = Array.from(
    new Set([params.creator.uid, ...params.participants.map((p) => p.uid)])
  ).slice(0, MAX_GROUP_MEMBERS);
  const leadPartner = params.participants[0] || params.creator;

  return {
    id: params.id,
    title: cleanTitle,
    isGroup: true,
    memberIds,
    partnerAvatar: leadPartner.avatarUrl,
    partnerHandle: `${memberIds.length} members`,
    lastMessageText: `${params.creator.displayName} created "${cleanTitle}"`,
    lastMessageSenderId: params.creator.uid,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

export function addGroupParticipantsState(
  thread: ChatThread,
  usersToAdd: UserProfile[],
  actorName: string,
  nowMs: number = Date.now()
): { thread: ChatThread; addedUsers: UserProfile[]; error?: string } {
  if (!thread.isGroup) {
    return {
      thread,
      addedUsers: [],
      error: 'Participants can only be added to group chats.',
    };
  }
  const existingSet = new Set(thread.memberIds);
  const newUsers = usersToAdd.filter((u) => u.uid && !existingSet.has(u.uid));
  if (newUsers.length === 0) {
    return { thread, addedUsers: [] };
  }
  const availableSlots = Math.max(0, MAX_GROUP_MEMBERS - thread.memberIds.length);
  if (availableSlots === 0) {
    return {
      thread,
      addedUsers: [],
      error: `Group limit reached (${MAX_GROUP_MEMBERS} participants max).`,
    };
  }
  const accepted = newUsers.slice(0, availableSlots);
  const nextMemberIds = [...thread.memberIds, ...accepted.map((u) => u.uid)];
  const namesSummary =
    accepted.length === 1
      ? accepted[0].displayName
      : `${accepted[0].displayName} +${accepted.length - 1}`;

  return {
    addedUsers: accepted,
    thread: {
      ...thread,
      memberIds: nextMemberIds,
      partnerHandle: `${nextMemberIds.length} members`,
      lastMessageText: `${actorName} added ${namesSummary}`,
      updatedAtMs: nowMs,
    },
  };
}

export function removeGroupParticipantState(
  thread: ChatThread,
  targetUid: string,
  targetName: string,
  actorUid: string,
  nowMs: number = Date.now()
): { thread: ChatThread; removedSelf: boolean; error?: string } {
  if (!thread.isGroup) {
    return {
      thread,
      removedSelf: false,
      error: 'Participants can only be removed from group chats.',
    };
  }
  if (!thread.memberIds.includes(targetUid)) {
    return {
      thread,
      removedSelf: false,
      error: 'Participant is not in this group.',
    };
  }
  if (thread.memberIds.length <= 1) {
    return {
      thread,
      removedSelf: false,
      error: 'Cannot remove the last remaining member.',
    };
  }
  const nextMemberIds = thread.memberIds.filter((id) => id !== targetUid);
  const removedSelf = targetUid === actorUid;

  return {
    removedSelf,
    thread: {
      ...thread,
      memberIds: nextMemberIds,
      partnerHandle: `${nextMemberIds.length} members`,
      lastMessageText: removedSelf
        ? `${targetName} left the group`
        : `${targetName} was removed from the group`,
      updatedAtMs: nowMs,
    },
  };
}

export function formatChatPushPayload(
  thread: Pick<ChatThread, 'title' | 'isGroup'>,
  senderName: string,
  text: string
): { title: string; body: string } {
  const cleanText = text.trim();
  if (thread.isGroup) {
    return {
      title: thread.title,
      body: `${senderName}: ${cleanText}`.slice(0, 240),
    };
  }
  return {
    title: `Message from ${senderName}`,
    body: cleanText.slice(0, 240),
  };
}

export function shouldDispatchChatPushNotification(params: {
  senderId: string;
  currentUid: string;
  chatId: string;
  mutedChatIds: string[];
  notifyMessages: boolean;
}): boolean {
  if (!params.senderId || params.senderId === params.currentUid) {
    return false;
  }
  if (!params.notifyMessages) {
    return false;
  }
  if (params.mutedChatIds.includes(params.chatId)) {
    return false;
  }
  return true;
}




