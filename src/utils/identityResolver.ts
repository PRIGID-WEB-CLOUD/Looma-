import type { BusinessProfile } from '../types/business';
import type {
  AppNotification,
  Post,
  PostComment,
  StoryGroup,
  UserProfile,
} from '../types/social';
import { normalizeAssetUrl, sanitizeHandle } from './socialLogic';

export interface IdentityLookupMaps {
  usersById: Map<string, UserProfile>;
  businessesById: Map<string, BusinessProfile>;
  currentProfile?: UserProfile | null;
}

export function buildIdentityMaps(
  communityUsers: UserProfile[],
  currentProfile?: UserProfile | null,
  businesses: BusinessProfile[] = []
): IdentityLookupMaps {
  const usersById = new Map<string, UserProfile>();
  for (const user of communityUsers) {
    if (user?.uid) usersById.set(user.uid, user);
  }
  if (currentProfile?.uid) {
    usersById.set(currentProfile.uid, currentProfile);
  }

  const businessesById = new Map<string, BusinessProfile>();
  for (const biz of businesses) {
    if (biz?.id) businessesById.set(biz.id, biz);
  }

  return { usersById, businessesById, currentProfile };
}

export function resolvePostIdentity(post: Post, maps: IdentityLookupMaps): Post {
  if (post.authorType === 'business' || post.businessProfileId) {
    const bpId = post.businessProfileId || post.authorId;
    const biz = maps.businessesById.get(bpId);
    if (!biz) return post;

    const nextName = biz.displayName.trim() || post.authorName;
    const nextHandle = biz.slug.trim() || post.authorHandle;
    const nextAvatar = normalizeAssetUrl(biz.logoUrl || '');
    const nextVerified = Boolean(biz.verified);

    if (
      post.authorName === nextName &&
      post.authorHandle === nextHandle &&
      post.authorAvatar === nextAvatar &&
      Boolean(post.authorVerified) === nextVerified
    ) {
      return post;
    }

    return {
      ...post,
      authorName: nextName,
      authorHandle: nextHandle,
      authorAvatar: nextAvatar,
      authorVerified: nextVerified,
    };
  }

  const user =
    maps.currentProfile && maps.currentProfile.uid === post.authorId
      ? maps.currentProfile
      : maps.usersById.get(post.authorId);
  if (!user) return post;

  const nextName = user.displayName.trim() || post.authorName;
  const nextHandle = user.handle.trim() ? sanitizeHandle(user.handle) : post.authorHandle;
  const nextAvatar = normalizeAssetUrl(user.avatarUrl || '');
  const nextVerified = Boolean(user.isVerified);

  if (
    post.authorName === nextName &&
    post.authorHandle === nextHandle &&
    post.authorAvatar === nextAvatar &&
    Boolean(post.authorVerified) === nextVerified
  ) {
    return post;
  }

  return {
    ...post,
    authorName: nextName,
    authorHandle: nextHandle,
    authorAvatar: nextAvatar,
    authorVerified: nextVerified,
  };
}

export function resolveCommentIdentity(
  comment: PostComment,
  maps: IdentityLookupMaps
): PostComment {
  if (comment.authorType === 'business' && comment.businessProfileId) {
    const biz = maps.businessesById.get(comment.businessProfileId);
    if (!biz) return comment;

    const nextName = biz.displayName.trim() || comment.authorName;
    const nextHandle = biz.slug.trim() || comment.authorHandle;
    const nextAvatar = normalizeAssetUrl(biz.logoUrl || '');
    const nextVerified = Boolean(biz.verified);

    if (
      comment.authorName === nextName &&
      comment.authorHandle === nextHandle &&
      comment.authorAvatar === nextAvatar &&
      Boolean(comment.authorVerified) === nextVerified
    ) {
      return comment;
    }

    return {
      ...comment,
      authorName: nextName,
      authorHandle: nextHandle,
      authorAvatar: nextAvatar,
      authorVerified: nextVerified,
    };
  }

  const user =
    maps.currentProfile && maps.currentProfile.uid === comment.authorId
      ? maps.currentProfile
      : maps.usersById.get(comment.authorId);
  if (!user) return comment;

  const nextName = user.displayName.trim() || comment.authorName;
  const nextHandle = user.handle.trim() ? sanitizeHandle(user.handle) : comment.authorHandle;
  const nextAvatar = normalizeAssetUrl(user.avatarUrl || '');
  const nextVerified = Boolean(user.isVerified);

  if (
    comment.authorName === nextName &&
    comment.authorHandle === nextHandle &&
    comment.authorAvatar === nextAvatar &&
    Boolean(comment.authorVerified) === nextVerified
  ) {
    return comment;
  }

  return {
    ...comment,
    authorName: nextName,
    authorHandle: nextHandle,
    authorAvatar: nextAvatar,
    authorVerified: nextVerified,
  };
}

export function resolveStoryGroupsIdentity(
  groups: StoryGroup[],
  maps: IdentityLookupMaps
): StoryGroup[] {
  return groups.map((group) => {
    if (group.authorType === 'business' || group.businessProfileId) {
      const bpId = group.businessProfileId || group.authorId;
      const biz = maps.businessesById.get(bpId);
      if (!biz) return group;

      const nextName = biz.displayName.trim() || group.authorName;
      const nextHandle = biz.slug.trim() || group.authorHandle;
      const nextAvatar = normalizeAssetUrl(biz.logoUrl || '');
      const nextVerified = Boolean(biz.verified);

      if (
        group.authorName === nextName &&
        group.authorHandle === nextHandle &&
        group.authorAvatar === nextAvatar &&
        Boolean(group.authorVerified) === nextVerified
      ) {
        return group;
      }

      return {
        ...group,
        authorName: nextName,
        authorHandle: nextHandle,
        authorAvatar: nextAvatar,
        authorVerified: nextVerified,
        items: group.items.map((item) => ({
          ...item,
          authorName: nextName,
          authorHandle: nextHandle,
          authorAvatar: nextAvatar,
          authorVerified: nextVerified,
        })),
      };
    }

    const user =
      maps.currentProfile && maps.currentProfile.uid === group.authorId
        ? maps.currentProfile
        : maps.usersById.get(group.authorId);
    if (!user) return group;

    const nextName = user.displayName.trim() || group.authorName;
    const nextHandle = user.handle.trim() ? sanitizeHandle(user.handle) : group.authorHandle;
    const nextAvatar = normalizeAssetUrl(user.avatarUrl || '');
    const nextVerified = Boolean(user.isVerified);

    if (
      group.authorName === nextName &&
      group.authorHandle === nextHandle &&
      group.authorAvatar === nextAvatar &&
      Boolean(group.authorVerified) === nextVerified
    ) {
      return group;
    }

    return {
      ...group,
      authorName: nextName,
      authorHandle: nextHandle,
      authorAvatar: nextAvatar,
      authorVerified: nextVerified,
      items: group.items.map((item) => ({
        ...item,
        authorName: nextName,
        authorHandle: nextHandle,
        authorAvatar: nextAvatar,
      })),
    };
  });
}

export function resolveNotificationIdentity(
  notif: AppNotification,
  maps: IdentityLookupMaps
): AppNotification {
  const user =
    maps.currentProfile && maps.currentProfile.uid === notif.actorId
      ? maps.currentProfile
      : maps.usersById.get(notif.actorId);
  if (!user) return notif;

  const preserveBrandActor =
    notif.type === 'system' && notif.actorName.trim().toLowerCase() === 'looma';
  const nextName =
    !preserveBrandActor && user.displayName.trim()
      ? user.displayName.trim()
      : notif.actorName;
  const nextAvatar = normalizeAssetUrl(user.avatarUrl || '');

  if (notif.actorName === nextName && notif.actorAvatar === nextAvatar) {
    return notif;
  }
  return {
    ...notif,
    actorName: nextName,
    actorAvatar: nextAvatar,
  };
}

export type CommentSortOrder = 'top' | 'newest' | 'oldest';

export interface CommentThreadNode {
  comment: PostComment;
  replies: PostComment[];
}

export function buildNestedCommentTree(
  comments: PostComment[],
  sortOrder: CommentSortOrder = 'top'
): CommentThreadNode[] {
  const byId = new Map<string, PostComment>();
  for (const c of comments) {
    byId.set(c.id, c);
  }

  const childrenMap = new Map<string, PostComment[]>();
  const roots: PostComment[] = [];

  for (const c of comments) {
    const parentId = c.parentCommentId && c.parentCommentId !== c.id ? c.parentCommentId : '';
    if (parentId && byId.has(parentId)) {
      const existing = childrenMap.get(parentId) || [];
      existing.push(c);
      childrenMap.set(parentId, existing);
    } else {
      roots.push(c);
    }
  }

  const sortRoots = (a: PostComment, b: PostComment) => {
    if (sortOrder === 'newest') return b.createdAtMs - a.createdAtMs;
    if (sortOrder === 'oldest') return a.createdAtMs - b.createdAtMs;
    const likesDiff = (b.likesCount || 0) - (a.likesCount || 0);
    if (likesDiff !== 0) return likesDiff;
    return b.createdAtMs - a.createdAtMs;
  };

  roots.sort(sortRoots);

  return roots.map((root) => {
    const collectedReplies: PostComment[] = [];
    const queue: PostComment[] = [...(childrenMap.get(root.id) || [])];
    const visited = new Set<string>([root.id]);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr.id)) continue;
      visited.add(curr.id);
      collectedReplies.push(curr);
      const grandChildren = childrenMap.get(curr.id) || [];
      queue.push(...grandChildren);
    }
    collectedReplies.sort((a, b) => a.createdAtMs - b.createdAtMs);
    return {
      comment: root,
      replies: collectedReplies,
    };
  });
}
