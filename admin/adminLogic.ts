import type { Post, PostCategory, StoryGroup, UserProfile } from '../src/types/social';

export interface AdminAccessInquiry {
  id: string;
  fullName: string;
  email: string;
  organization: string;
  note: string;
  status: 'pending' | 'approved' | 'archived';
  createdAtMs: number;
}

export const ADMIN_EMAILS = [
  'prigidwebcloud@gmail.com',
  'prigidholdings@gmail.com',
] as const;

export const ADMIN_MODERATION_STORAGE_KEY = 'looma_admin_moderation_v1';
export const ADMIN_INQUIRIES_STORAGE_KEY = 'looma_admin_inquiries_v1';

export interface AdminModerationState {
  hiddenPostIds: string[];
  restrictedUids: string[];
}

export interface AdminAuthorizationInput {
  isAuthorized: boolean;
  email: string | null | undefined;
  emailVerified: boolean;
  hasAdminDoc?: boolean;
  isLocalAutostart?: boolean;
}

export interface AdminAuthorizationResult {
  isAdmin: boolean;
  reason: 'ok-admin-doc' | 'ok-allowlist' | 'ok-local-preview' | 'unauthenticated' | 'unverified' | 'forbidden';
}

export interface WorkspaceAdminMetrics {
  totalMembers: number;
  onboardedMembers: number;
  restrictedMembers: number;
  onlineMembers: number;
  totalPosts: number;
  hiddenPosts: number;
  activeStoryAuthors: number;
  pendingInquiries: number;
}

export function isAllowlistedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (ADMIN_EMAILS as readonly string[]).includes(normalized);
}

export function resolveAdminAuthorization(
  input: AdminAuthorizationInput
): AdminAuthorizationResult {
  if (!input.isAuthorized) {
    return { isAdmin: false, reason: 'unauthenticated' };
  }
  if (input.isLocalAutostart) {
    return { isAdmin: true, reason: 'ok-local-preview' };
  }
  if (!input.emailVerified) {
    return { isAdmin: false, reason: 'unverified' };
  }
  if (input.hasAdminDoc) {
    return { isAdmin: true, reason: 'ok-admin-doc' };
  }
  if (isAllowlistedAdminEmail(input.email)) {
    return { isAdmin: true, reason: 'ok-allowlist' };
  }
  return { isAdmin: false, reason: 'forbidden' };
}

export function readAdminModerationState(): AdminModerationState {
  if (typeof window === 'undefined') {
    return { hiddenPostIds: [], restrictedUids: [] };
  }
  try {
    const raw = window.localStorage.getItem(ADMIN_MODERATION_STORAGE_KEY);
    if (!raw) return { hiddenPostIds: [], restrictedUids: [] };
    const parsed = JSON.parse(raw) as Partial<AdminModerationState>;
    return {
      hiddenPostIds: Array.isArray(parsed.hiddenPostIds) ? parsed.hiddenPostIds : [],
      restrictedUids: Array.isArray(parsed.restrictedUids) ? parsed.restrictedUids : [],
    };
  } catch {
    return { hiddenPostIds: [], restrictedUids: [] };
  }
}

export function saveAdminModerationState(state: AdminModerationState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADMIN_MODERATION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues cleanly
  }
}

export function toggleHiddenPostId(
  hiddenPostIds: string[],
  postId: string
): string[] {
  if (!postId) return hiddenPostIds;
  return hiddenPostIds.includes(postId)
    ? hiddenPostIds.filter((id) => id !== postId)
    : [...hiddenPostIds, postId];
}

export function toggleRestrictedMemberUid(
  restrictedUids: string[],
  targetUid: string,
  currentAdminUid: string
): string[] {
  if (!targetUid || targetUid === currentAdminUid) {
    return restrictedUids;
  }
  return restrictedUids.includes(targetUid)
    ? restrictedUids.filter((id) => id !== targetUid)
    : [...restrictedUids, targetUid];
}

export function readAdminAccessInquiries(): AdminAccessInquiry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ADMIN_INQUIRIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AdminAccessInquiry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAdminAccessInquiries(inquiries: AdminAccessInquiry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADMIN_INQUIRIES_STORAGE_KEY, JSON.stringify(inquiries));
  } catch {
    // Ignore storage quota issues cleanly
  }
}

export function updateAccessInquiryStatus(
  inquiries: AdminAccessInquiry[],
  inquiryId: string,
  status: AdminAccessInquiry['status']
): AdminAccessInquiry[] {
  return inquiries.map((item) =>
    item.id === inquiryId ? { ...item, status } : item
  );
}

export function computeWorkspaceMetrics(input: {
  currentProfile: UserProfile;
  communityUsers: UserProfile[];
  posts: Post[];
  storyGroups: StoryGroup[];
  onlineUserIds: string[];
  moderation: AdminModerationState;
  inquiries: AdminAccessInquiry[];
}): WorkspaceAdminMetrics {
  const uniqueMembers = new Map<string, UserProfile>();
  if (input.currentProfile.uid) {
    uniqueMembers.set(input.currentProfile.uid, input.currentProfile);
  }
  for (const user of input.communityUsers) {
    if (user.uid) {
      uniqueMembers.set(user.uid, user);
    }
  }
  const allMembers = Array.from(uniqueMembers.values());
  const onlineSet = new Set(input.onlineUserIds);
  const restrictedSet = new Set(input.moderation.restrictedUids);
  const hiddenSet = new Set(input.moderation.hiddenPostIds);

  return {
    totalMembers: allMembers.length,
    onboardedMembers: allMembers.filter((m) => m.onboardingCompleted).length,
    restrictedMembers: allMembers.filter((m) => restrictedSet.has(m.uid)).length,
    onlineMembers: allMembers.filter((m) => onlineSet.has(m.uid)).length,
    totalPosts: input.posts.length,
    hiddenPosts: input.posts.filter((p) => hiddenSet.has(p.id)).length,
    activeStoryAuthors: input.storyGroups.length,
    pendingInquiries: input.inquiries.filter((i) => i.status === 'pending').length,
  };
}

export type AdminMemberFilter = 'all' | 'online' | 'onboarded' | 'restricted';

export function filterAdminMembers(
  members: UserProfile[],
  searchQuery: string,
  filterMode: AdminMemberFilter,
  onlineUserIds: string[],
  restrictedUids: string[]
): UserProfile[] {
  const q = searchQuery.trim().toLowerCase();
  const onlineSet = new Set(onlineUserIds);
  const restrictedSet = new Set(restrictedUids);

  return members
    .filter((member) => {
      if (filterMode === 'online' && !onlineSet.has(member.uid)) return false;
      if (filterMode === 'onboarded' && !member.onboardingCompleted) return false;
      if (filterMode === 'restricted' && !restrictedSet.has(member.uid)) return false;
      if (!q) return true;
      return (
        member.displayName.toLowerCase().includes(q) ||
        member.handle.toLowerCase().includes(q) ||
        (member.location || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export function filterAdminPosts(
  posts: Post[],
  searchQuery: string,
  category: 'All' | PostCategory | 'Hidden',
  hiddenPostIds: string[]
): Post[] {
  const q = searchQuery.trim().toLowerCase();
  const hiddenSet = new Set(hiddenPostIds);

  return posts
    .filter((post) => {
      if (category === 'Hidden' && !hiddenSet.has(post.id)) return false;
      if (category !== 'All' && category !== 'Hidden' && post.category !== category) {
        return false;
      }
      if (!q) return true;
      return (
        post.caption.toLowerCase().includes(q) ||
        post.authorName.toLowerCase().includes(q) ||
        post.authorHandle.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}
