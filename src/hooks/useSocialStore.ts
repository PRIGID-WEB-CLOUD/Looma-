import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutAccount,
  testFirestoreConnection,
} from '../services/firebase';
import {
  createInitialMemberProfile,
  createSeedChats,
  createSeedComments,
  createSeedNotifications,
  createSeedPosts,
  createSeedStories,
  createStarterRegisteredAccounts,
  DEFAULT_FOLLOWED_IDS,
  DEFAULT_FOLLOWER_IDS,
  DEFAULT_ONLINE_USER_IDS,
  SEED_COMMUNITY_MEMBERS,
  SEED_CREATORS,
  SEED_FOLLOW_GRAPH,
} from '../services/seedData';
import {
  dispatchBrowserPush,
  getPushPermissionState,
  requestPushPermission,
  type PushPermissionState,
} from '../services/notifications';
import type {
  AppNotification,
  ChatMessage,
  ChatThread,
  Post,
  PostCategory,
  PostComment,
  StoryItem,
  ThemeMode,
  UserPrivateSettings,
  UserProfile,
} from '../types/social';
import {
  buildStoryFromPost,
  canUseAutostart,
  computeConnections,
  computeOtherUserConnections,
  extractMentions,
  groupStoriesByAuthor,
  isAuthorizedSession,
  normalizeAssetUrl,
  POST_CATEGORIES,
  resolvePublicProfile,
  sanitizeHandle,
  toggleFollowState,
} from '../utils/socialLogic';

const STORAGE_KEYS = {
  SESSION_ACTIVE: 'looma_session_active_v1',
  ACCOUNTS: 'looma_registered_accounts_v1',
  PROFILE: 'looma_profile_v1',
  SETTINGS: 'looma_private_settings_v1',
  POSTS: 'looma_posts_v1',
  STORIES: 'looma_stories_v1',
  VIEWED_STORIES: 'looma_viewed_stories_v1',
  COMMENTS: 'looma_comments_v1',
  LIKED_IDS: 'looma_liked_ids_v1',
  BOOKMARK_IDS: 'looma_bookmark_ids_v1',
  FOLLOWED_IDS: 'looma_followed_ids_v1',
  FOLLOWER_IDS: 'looma_follower_ids_v1',
  CHATS: 'looma_chats_v1',
  MESSAGES: 'looma_messages_v1',
  NOTIFICATIONS: 'looma_notifications_v1',
  THEME: 'looma_theme_v1',
  PUSH_ENABLED: 'looma_push_enabled_v1',
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function timestampToMs(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  if (
    val &&
    typeof val === 'object' &&
    'toMillis' in val &&
    typeof (val as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (val as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function useSocialStore() {
  const autostart =
    typeof window !== 'undefined' &&
    canUseAutostart(window.location.search, window.location.hostname);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(() => autostart);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = readStorage<ThemeMode | null>(STORAGE_KEYS.THEME, null);
    if (saved === 'light' || saved === 'dark') return saved;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
    return 'light';
  });

  const [pushPermission, setPushPermission] = useState<PushPermissionState>(() =>
    getPushPermissionState()
  );
  const [pushEnabled, setPushEnabled] = useState<boolean>(() =>
    readStorage<boolean>(STORAGE_KEYS.PUSH_ENABLED, true)
  );

  const [registeredAccounts, setRegisteredAccounts] = useState<UserProfile[]>(
    () => {
      const stored = readStorage<UserProfile[] | null>(
        STORAGE_KEYS.ACCOUNTS,
        null
      );
      if (Array.isArray(stored) && stored.length > 0) {
        return stored.filter((acc) => acc.uid !== 'guest_local_user');
      }
      return createStarterRegisteredAccounts();
    }
  );

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => autostart);

  const [profile, setProfile] = useState<UserProfile>(() => {
    const stored = readStorage<UserProfile | null>(STORAGE_KEYS.PROFILE, null);
    if (stored && stored.uid !== 'guest_local_user') {
      return autostart ? { ...stored, onboardingCompleted: true } : stored;
    }
    const base = createInitialMemberProfile();
    return autostart ? { ...base, onboardingCompleted: true } : base;
  });

  const [privateSettings, setPrivateSettings] = useState<UserPrivateSettings>(() => {
    const stored = readStorage<UserPrivateSettings | null>(
      STORAGE_KEYS.SETTINGS,
      null
    );
    if (stored && stored.uid !== 'guest_local_user') {
      return stored;
    }
    return {
      uid: 'member_alex',
      email: '',
      pushEnabled: true,
      themePreference: 'light',
      notifyLikes: true,
      notifyComments: true,
      notifyMessages: true,
      profileVisibility: 'public',
      messagePrivacy: 'everyone',
    };
  });

  const [seedPosts] = useState<Post[]>(() => createSeedPosts());
  const [remotePosts, setRemotePosts] = useState<Post[]>([]);
  const [localPosts, setLocalPosts] = useState<Post[]>(() =>
    readStorage<Post[]>(STORAGE_KEYS.POSTS, createSeedPosts())
  );

  const [commentsByPost, setCommentsByPost] = useState<
    Record<string, PostComment[]>
  >(() => readStorage<Record<string, PostComment[]>>(STORAGE_KEYS.COMMENTS, createSeedComments()));

  const [likedPostIds, setLikedPostIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.LIKED_IDS, [])
  );
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.BOOKMARK_IDS, ['seed_post_1'])
  );
  const [followedUserIds, setFollowedUserIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.FOLLOWED_IDS, DEFAULT_FOLLOWED_IDS)
  );
  const [followerUserIds, setFollowerUserIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.FOLLOWER_IDS, DEFAULT_FOLLOWER_IDS)
  );
  const hasRemoteFollowingRef = useRef(false);
  const [communityUsers, setCommunityUsers] = useState<UserProfile[]>(
    () => SEED_COMMUNITY_MEMBERS
  );

  const [remoteStories, setRemoteStories] = useState<StoryItem[]>([]);
  const [localStories, setLocalStories] = useState<StoryItem[]>(() =>
    readStorage<StoryItem[]>(STORAGE_KEYS.STORIES, createSeedStories())
  );
  const [viewedStoryIds, setViewedStoryIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.VIEWED_STORIES, [])
  );
  const [remoteOnlineIds, setRemoteOnlineIds] = useState<string[]>([]);
  const onlineUserIds = Array.from(
    new Set([
      ...(isAuthenticated ? [profile.uid] : []),
      ...DEFAULT_ONLINE_USER_IDS,
      ...remoteOnlineIds,
    ])
  );
  const hydratedRemotePostIdsRef = useRef<Set<string>>(new Set());

  const initialChats = createSeedChats(profile.uid);
  const [threads, setThreads] = useState<ChatThread[]>(() =>
    readStorage<ChatThread[]>(STORAGE_KEYS.CHATS, initialChats.threads)
  );
  const [messagesByChat, setMessagesByChat] = useState<
    Record<string, ChatMessage[]>
  >(() => readStorage<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, initialChats.messagesByChat));

  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    readStorage<AppNotification[]>(
      STORAGE_KEYS.NOTIFICATIONS,
      createSeedNotifications(profile.uid)
    )
  );

  const [activeToast, setActiveToast] = useState<AppNotification | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const themeRef = useRef<ThemeMode>(theme);
  const pushEnabledRef = useRef<boolean>(pushEnabled);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    pushEnabledRef.current = pushEnabled;
  }, [pushEnabled]);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    writeStorage(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.PUSH_ENABLED, pushEnabled);
  }, [pushEnabled]);

  // Persist authenticated member session data locally
  useEffect(() => {
    writeStorage(STORAGE_KEYS.ACCOUNTS, registeredAccounts);
  }, [registeredAccounts]);

  useEffect(() => {
    if (!authReady) return;
    writeStorage(STORAGE_KEYS.SESSION_ACTIVE, isAuthenticated);
    writeStorage(STORAGE_KEYS.PROFILE, profile);
    if (!firebaseUser) {
      writeStorage(STORAGE_KEYS.SETTINGS, privateSettings);
    }
  }, [authReady, isAuthenticated, profile, privateSettings, firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) {
      writeStorage(STORAGE_KEYS.POSTS, localPosts);
    }
  }, [localPosts, firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) {
      writeStorage(STORAGE_KEYS.COMMENTS, commentsByPost);
      writeStorage(STORAGE_KEYS.LIKED_IDS, likedPostIds);
      writeStorage(STORAGE_KEYS.BOOKMARK_IDS, bookmarkedPostIds);
      writeStorage(STORAGE_KEYS.FOLLOWED_IDS, followedUserIds);
      writeStorage(STORAGE_KEYS.CHATS, threads);
      writeStorage(STORAGE_KEYS.MESSAGES, messagesByChat);
      writeStorage(STORAGE_KEYS.NOTIFICATIONS, notifications);
      writeStorage(STORAGE_KEYS.STORIES, localStories);
    }
    writeStorage(STORAGE_KEYS.VIEWED_STORIES, viewedStoryIds);
  }, [
    commentsByPost,
    likedPostIds,
    bookmarkedPostIds,
    followedUserIds,
    threads,
    messagesByChat,
    notifications,
    localStories,
    viewedStoryIds,
    firebaseUser,
  ]);

  const showToast = useCallback(
    (notif: AppNotification) => {
      setActiveToast(notif);
      if (pushEnabled) {
        dispatchBrowserPush(notif.title, notif.body);
      }
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(() => {
        setActiveToast(null);
      }, 4500);
    },
    [pushEnabled]
  );

  // Cross-tab real-time BroadcastChannel sync
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('looma_realtime_sync');
    broadcastRef.current = channel;
    channel.onmessage = (event) => {
      const payload = event.data as
        | { type: 'post:new'; post: Post }
        | { type: 'story:new'; story: StoryItem }
        | { type: 'chat:message'; threadId: string; message: ChatMessage }
        | { type: 'notif:new'; notification: AppNotification };
      if (!payload) return;
      if (payload.type === 'post:new') {
        setLocalPosts((prev) =>
          prev.some((p) => p.id === payload.post.id)
            ? prev
            : [payload.post, ...prev]
        );
      } else if (payload.type === 'story:new') {
        setLocalStories((prev) =>
          prev.some((s) => s.id === payload.story.id)
            ? prev
            : [...prev, payload.story]
        );
      } else if (payload.type === 'chat:message') {
        setMessagesByChat((prev) => {
          const existing = prev[payload.threadId] || [];
          if (existing.some((m) => m.id === payload.message.id)) return prev;
          return {
            ...prev,
            [payload.threadId]: [...existing, payload.message],
          };
        });
        setThreads((prev) =>
          prev.map((t) =>
            t.id === payload.threadId
              ? {
                  ...t,
                  lastMessageText: payload.message.text,
                  lastMessageSenderId: payload.message.senderId,
                  updatedAtMs: payload.message.createdAtMs,
                }
              : t
          )
        );
      } else if (payload.type === 'notif:new') {
        setNotifications((prev) =>
          prev.some((n) => n.id === payload.notification.id)
            ? prev
            : [payload.notification, ...prev]
        );
        showToast(payload.notification);
      }
    };
    return () => {
      channel.close();
      broadcastRef.current = null;
    };
  }, [showToast]);

  // Startup Firestore connectivity verification
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // Auth listener & Firestore bootstrapping
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (!user.emailVerified) {
          setFirebaseUser(user);
          setIsAuthenticated(false);
          setAuthError('A verified email address is required to access Looma.');
          writeStorage(STORAGE_KEYS.SESSION_ACTIVE, false);
          setAuthReady(true);
          return;
        }
        try {
          const userRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userRef);
          let hydratedProfile: UserProfile;
          if (snap.exists()) {
            const d = snap.data();
            const resolvedDisplayName =
              (!d.displayName || d.displayName === 'Looma Member') && user.displayName
                ? user.displayName.trim().slice(0, 60)
                : d.displayName;
            const resolvedAvatar = normalizeAssetUrl(
              d.avatarUrl || user.photoURL || SEED_CREATORS[0].avatarUrl
            );
            hydratedProfile = {
              uid: d.uid,
              displayName: resolvedDisplayName,
              handle: d.handle,
              bio: d.bio,
              avatarUrl: resolvedAvatar,
              location: d.location,
              interests: Array.isArray(d.interests) ? d.interests : [],
              followersCount: Number(d.followersCount || 0),
              followingCount: Number(d.followingCount || 0),
              onboardingCompleted: Boolean(d.onboardingCompleted),
              createdAtMs: timestampToMs(d.createdAt),
              updatedAtMs: timestampToMs(d.updatedAt),
            };
            if (
              resolvedDisplayName !== d.displayName ||
              resolvedAvatar !== d.avatarUrl
            ) {
              updateDoc(userRef, {
                displayName: resolvedDisplayName,
                avatarUrl: resolvedAvatar,
                updatedAt: serverTimestamp(),
              }).catch(() => {});
            }
          } else {
            const defaultHandle = sanitizeHandle(
              user.email?.split('@')[0] || user.displayName || 'looma_user'
            );
            const newProfile: UserProfile = {
              uid: user.uid,
              displayName: (user.displayName || 'Looma Member').trim().slice(0, 60) || 'Looma Member',
              handle: defaultHandle,
              bio: 'Sharing daylight notes, design studies, and field dispatches.',
              avatarUrl: normalizeAssetUrl(user.photoURL || SEED_CREATORS[0].avatarUrl),
              location: 'Earth',
              interests: ['Architecture', 'Photography'],
              followersCount: 0,
              followingCount: 0,
              onboardingCompleted: autostart,
              createdAtMs: Date.now(),
              updatedAtMs: Date.now(),
            };
            await setDoc(userRef, {
              uid: newProfile.uid,
              displayName: newProfile.displayName,
              handle: newProfile.handle,
              bio: newProfile.bio,
              avatarUrl: newProfile.avatarUrl,
              location: newProfile.location,
              interests: newProfile.interests,
              followersCount: 0,
              followingCount: 0,
              onboardingCompleted: newProfile.onboardingCompleted,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            await setDoc(doc(db, 'users', user.uid, 'private', 'settings'), {
              uid: user.uid,
              email: user.email || '',
              pushEnabled: pushEnabledRef.current,
              themePreference: themeRef.current,
              notifyLikes: true,
              notifyComments: true,
              notifyMessages: true,
              profileVisibility: 'public',
              messagePrivacy: 'everyone',
              updatedAt: serverTimestamp(),
            });
            hydratedProfile = newProfile;
            setPrivateSettings({
              uid: user.uid,
              email: user.email || '',
              pushEnabled: pushEnabledRef.current,
              themePreference: themeRef.current,
              notifyLikes: true,
              notifyComments: true,
              notifyMessages: true,
              profileVisibility: 'public',
              messagePrivacy: 'everyone',
            });
          }
          const settingsSnap = await getDoc(
            doc(db, 'users', user.uid, 'private', 'settings')
          );
          if (settingsSnap.exists()) {
            const s = settingsSnap.data();
            setPrivateSettings({
              uid: s.uid || user.uid,
              email: s.email || user.email || '',
              pushEnabled: Boolean(s.pushEnabled ?? true),
              themePreference: s.themePreference === 'dark' ? 'dark' : 'light',
              notifyLikes: Boolean(s.notifyLikes ?? true),
              notifyComments: Boolean(s.notifyComments ?? true),
              notifyMessages: Boolean(s.notifyMessages ?? true),
              profileVisibility:
                s.profileVisibility === 'followers' ? 'followers' : 'public',
              messagePrivacy:
                s.messagePrivacy === 'following' ? 'following' : 'everyone',
            });
          }
          setAuthError(null);
          setFirebaseUser(user);
          setProfile(hydratedProfile);
          setIsAuthenticated(true);
          writeStorage(STORAGE_KEYS.SESSION_ACTIVE, true);
          writeStorage(STORAGE_KEYS.PROFILE, hydratedProfile);
        } catch (err) {
          console.error('Failed to load user profile', err);
          setFirebaseUser(user);
          setIsAuthenticated(true);
        } finally {
          setAuthReady(true);
        }
      } else {
        setFirebaseUser(null);
        setIsAuthenticated(autostart);
        if (!autostart) {
          writeStorage(STORAGE_KEYS.SESSION_ACTIVE, false);
        }
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, [autostart]);

  // Firestore real-time listeners when authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified) return;

    const postsQuery = query(
      collection(db, 'posts'),
      where('category', 'in', POST_CATEGORIES)
    );
    const unsubPosts = onSnapshot(
      postsQuery,
      (snapshot) => {
        const mapped: Post[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: d.id || docSnap.id,
            authorId: d.authorId,
            authorName: d.authorName,
            authorHandle: d.authorHandle,
            authorAvatar: normalizeAssetUrl(d.authorAvatar || ''),
            caption: d.caption || '',
            imageUrl: normalizeAssetUrl(d.imageUrl || ''),
            videoUrl: d.videoUrl || '',
            audioUrl: d.audioUrl || '',
            linkUrl: d.linkUrl || '',
            mediaTitle: d.mediaTitle || '',
            category: d.category,
            likesCount: Number(d.likesCount || 0),
            commentsCount: Number(d.commentsCount || 0),
            createdAtMs: timestampToMs(d.createdAt),
            updatedAtMs: timestampToMs(d.updatedAt),
          };
        });
        setRemotePosts(mapped.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'posts')
    );

    const chatsQuery = query(
      collection(db, 'chats'),
      where('memberIds', 'array-contains', firebaseUser.uid)
    );
    const unsubChats = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const mapped: ChatThread[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: d.id || docSnap.id,
            title: d.title,
            isGroup: Boolean(d.isGroup),
            memberIds: Array.isArray(d.memberIds) ? d.memberIds : [],
            partnerAvatar: SEED_CREATORS[0].avatarUrl,
            partnerHandle: d.isGroup ? `${d.memberIds?.length || 2} members` : 'direct',
            lastMessageText: d.lastMessageText || '',
            lastMessageSenderId: d.lastMessageSenderId || '',
            createdAtMs: timestampToMs(d.createdAt),
            updatedAtMs: timestampToMs(d.updatedAt),
          };
        });
        if (mapped.length > 0) {
          setThreads(mapped.sort((a, b) => b.updatedAtMs - a.updatedAtMs));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'chats')
    );

    const notifsQuery = query(
      collection(db, 'users', firebaseUser.uid, 'notifications'),
      where('recipientId', '==', firebaseUser.uid)
    );
    const unsubNotifs = onSnapshot(
      notifsQuery,
      (snapshot) => {
        const mapped: AppNotification[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: d.id || docSnap.id,
            recipientId: d.recipientId,
            actorId: d.actorId,
            actorName: d.actorName,
            actorAvatar: d.actorAvatar,
            type: d.type,
            title: d.title,
            body: d.body,
            targetPostId: d.targetPostId || '',
            read: Boolean(d.read),
            createdAtMs: timestampToMs(d.createdAt),
          };
        });
        if (mapped.length > 0) {
          setNotifications(mapped.sort((a, b) => b.createdAtMs - a.createdAtMs));
        }
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `users/${firebaseUser.uid}/notifications`
        )
    );

    const bookmarksRef = collection(
      db,
      'users',
      firebaseUser.uid,
      'bookmarks'
    );
    const unsubBookmarks = onSnapshot(
      bookmarksRef,
      (snapshot) => {
        setBookmarkedPostIds(snapshot.docs.map((d) => d.id));
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `users/${firebaseUser.uid}/bookmarks`
        )
    );

    let cancelled = false;
    getDocs(
      query(collection(db, 'users'), where('onboardingCompleted', '==', true))
    )
      .then((snapshot) => {
        if (cancelled) return;
        const remoteMembers: UserProfile[] = snapshot.docs
          .map((docSnap) => {
            const d = docSnap.data();
            return {
              uid: d.uid || docSnap.id,
              displayName: d.displayName || 'Looma Member',
              handle: d.handle || 'looma_member',
              bio: d.bio || '',
              avatarUrl: normalizeAssetUrl(d.avatarUrl || SEED_CREATORS[0].avatarUrl),
              location: d.location || '',
              interests: Array.isArray(d.interests) ? d.interests : [],
              followersCount: Number(d.followersCount || 0),
              followingCount: Number(d.followingCount || 0),
              onboardingCompleted: Boolean(d.onboardingCompleted),
              createdAtMs: timestampToMs(d.createdAt),
              updatedAtMs: timestampToMs(d.updatedAt),
            };
          })
          .filter(
            (u) =>
              u.uid !== firebaseUser.uid &&
              !SEED_COMMUNITY_MEMBERS.some((seed) => seed.uid === u.uid)
          );
        setCommunityUsers([...SEED_COMMUNITY_MEMBERS, ...remoteMembers]);
      })
      .catch((err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const storiesQuery = query(
      collection(db, 'stories'),
      where('expiresAtMs', '>', 0)
    );
    const unsubStories = onSnapshot(
      storiesQuery,
      (snapshot) => {
        const mapped: StoryItem[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: d.id || docSnap.id,
            authorId: d.authorId,
            authorName: d.authorName,
            authorHandle: d.authorHandle,
            authorAvatar: d.authorAvatar,
            imageUrl: d.imageUrl || '',
            caption: d.caption || '',
            createdAtMs: timestampToMs(d.createdAt),
            expiresAtMs: Number(d.expiresAtMs || 0),
          };
        });
        setRemoteStories(mapped.sort((a, b) => a.createdAtMs - b.createdAtMs));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'stories')
    );

    const followingRef = query(
      collection(db, 'users', firebaseUser.uid, 'following'),
      where('followerId', '==', firebaseUser.uid)
    );
    const unsubFollowing = onSnapshot(
      followingRef,
      (snapshot) => {
        const remoteIds = snapshot.docs.map((d) => d.id);
        if (remoteIds.length > 0) {
          hasRemoteFollowingRef.current = true;
          setFollowedUserIds(remoteIds);
          writeStorage(STORAGE_KEYS.FOLLOWED_IDS, remoteIds);
        } else if (hasRemoteFollowingRef.current) {
          setFollowedUserIds([]);
          writeStorage(STORAGE_KEYS.FOLLOWED_IDS, []);
        }
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `users/${firebaseUser.uid}/following`
        )
    );

    const followersRef = query(
      collection(db, 'users', firebaseUser.uid, 'followers'),
      where('targetUid', '==', firebaseUser.uid)
    );
    const unsubFollowers = onSnapshot(
      followersRef,
      (snapshot) => {
        const remoteFollowerIds = snapshot.docs.map((d) => d.id);
        if (remoteFollowerIds.length > 0) {
          setFollowerUserIds((prev) => {
            const merged = Array.from(new Set([...remoteFollowerIds, ...prev]));
            writeStorage(STORAGE_KEYS.FOLLOWER_IDS, merged);
            return merged;
          });
        }
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `users/${firebaseUser.uid}/followers`
        )
    );

    const presenceQuery = query(
      collection(db, 'presence'),
      where('online', '==', true)
    );
    const unsubPresence = onSnapshot(
      presenceQuery,
      (snapshot) => {
        const now = Date.now();
        const activeIds = snapshot.docs
          .map((d) => d.data())
          .filter(
            (d) =>
              Boolean(d.online) &&
              now - Number(d.lastSeenAtMs || 0) < 180_000
          )
          .map((d) => String(d.uid))
          .filter(Boolean);
        setRemoteOnlineIds(activeIds);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'presence')
    );

    const syncOwnPresence = () => {
      setDoc(doc(db, 'presence', firebaseUser.uid), {
        uid: firebaseUser.uid,
        online: true,
        lastSeenAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    };
    syncOwnPresence();
    const presenceInterval = window.setInterval(syncOwnPresence, 45_000);

    return () => {
      cancelled = true;
      window.clearInterval(presenceInterval);
      unsubPosts();
      unsubChats();
      unsubNotifs();
      unsubBookmarks();
      unsubStories();
      unsubFollowing();
      unsubFollowers();
      unsubPresence();
    };
  }, [authReady, firebaseUser]);

  // Hydrate likes & comments for Firestore remote posts on load/reload
  useEffect(() => {
    if (!authReady || !firebaseUser) {
      hydratedRemotePostIdsRef.current.clear();
      return;
    }
    const unhydrated = remotePosts.filter(
      (p) => !hydratedRemotePostIdsRef.current.has(p.id)
    );
    if (unhydrated.length === 0) return;

    let cancelled = false;
    Promise.all(
      unhydrated.map(async (post) => {
        hydratedRemotePostIdsRef.current.add(post.id);
        try {
          const [likeSnap, commentsSnap] = await Promise.all([
            getDoc(doc(db, 'posts', post.id, 'likes', firebaseUser.uid)),
            getDocs(
              query(
                collection(db, 'posts', post.id, 'comments'),
                where('postId', '==', post.id)
              )
            ),
          ]);
          if (cancelled) return;
          if (likeSnap.exists()) {
            setLikedPostIds((prev) =>
              prev.includes(post.id) ? prev : [...prev, post.id]
            );
          }
          const loadedComments: PostComment[] = commentsSnap.docs
            .map((docSnap) => {
              const d = docSnap.data();
              return {
                id: d.id || docSnap.id,
                postId: d.postId || post.id,
                authorId: d.authorId,
                authorName: d.authorName,
                authorHandle: d.authorHandle,
                authorAvatar: d.authorAvatar,
                text: d.text,
                createdAtMs: timestampToMs(d.createdAt),
              };
            })
            .sort((a, b) => a.createdAtMs - b.createdAtMs);
          if (loadedComments.length > 0) {
            setCommentsByPost((prev) => ({
              ...prev,
              [post.id]: loadedComments,
            }));
          }
        } catch {
          // Allow future retry if transient
          hydratedRemotePostIdsRef.current.delete(post.id);
        }
      })
    );

    return () => {
      cancelled = true;
    };
  }, [authReady, firebaseUser, remotePosts]);

  // Combined feed posts: remote Firestore posts + curated seed posts (deduplicated)
  const posts: Post[] = firebaseUser
    ? [
        ...remotePosts,
        ...seedPosts.filter(
          (sp) => !remotePosts.some((rp) => rp.id === sp.id)
        ),
      ]
    : localPosts;

  const stories: StoryItem[] = firebaseUser
    ? [
        ...remoteStories,
        ...localStories.filter(
          (ls) => !remoteStories.some((rs) => rs.id === ls.id)
        ),
      ]
    : localStories;

  const isAuthorized = isAuthorizedSession(
    Boolean(firebaseUser),
    Boolean(firebaseUser?.emailVerified),
    autostart
  );

  const requireAuthorized = useCallback(() => {
    if (!isAuthorized) {
      throw new Error('Unauthorized: Sign in with a verified Google account.');
    }
  }, [isAuthorized]);

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Google sign-in popup was closed or blocked.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (firebaseUser) {
      await setDoc(doc(db, 'presence', firebaseUser.uid), {
        uid: firebaseUser.uid,
        online: false,
        lastSeenAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      await signOutAccount();
    }
    setIsAuthenticated(false);
    setAuthError(null);
    writeStorage(STORAGE_KEYS.SESSION_ACTIVE, false);
    const resetProfile = createInitialMemberProfile({
      onboardingCompleted: false,
    });
    setProfile(resetProfile);
    setPrivateSettings((prev) => ({
      ...prev,
      uid: resetProfile.uid,
      email: '',
    }));
  }, [firebaseUser]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      setPrivateSettings((s) => ({ ...s, themePreference: next }));
      if (firebaseUser) {
        updateDoc(doc(db, 'users', firebaseUser.uid, 'private', 'settings'), {
          themePreference: next,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      return next;
    });
  }, [firebaseUser]);

  const setThemeExplicit = useCallback(
    (next: ThemeMode) => {
      setTheme(next);
      setPrivateSettings((s) => ({ ...s, themePreference: next }));
      if (firebaseUser) {
        updateDoc(doc(db, 'users', firebaseUser.uid, 'private', 'settings'), {
          themePreference: next,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    [firebaseUser]
  );

  const enablePushNotifications = useCallback(async () => {
    const perm = await requestPushPermission();
    setPushPermission(perm);
    const enabled = perm === 'granted' || perm === 'unsupported' || perm === 'default';
    setPushEnabled(enabled);
    setPrivateSettings((s) => ({ ...s, pushEnabled: enabled }));
    if (firebaseUser) {
      updateDoc(doc(db, 'users', firebaseUser.uid, 'private', 'settings'), {
        pushEnabled: enabled,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    showToast({
      id: makeSafeId('push_test'),
      recipientId: profile.uid,
      actorId: profile.uid,
      actorName: 'Looma',
      actorAvatar: profile.avatarUrl,
      type: 'system',
      title: 'Browser Push Enabled',
      body: 'You will now receive real-time notifications and activity alerts.',
      targetPostId: '',
      read: false,
      createdAtMs: Date.now(),
    });
    return perm;
  }, [firebaseUser, profile, showToast]);

  const triggerNotification = useCallback(
    async (
      partial: Omit<AppNotification, 'id' | 'recipientId' | 'createdAtMs' | 'read'>
    ) => {
      const notifId = makeSafeId('notif');
      const now = Date.now();
      const newNotif: AppNotification = {
        ...partial,
        id: notifId,
        recipientId: profile.uid,
        read: false,
        createdAtMs: now,
      };
      setNotifications((prev) => [newNotif, ...prev]);
      showToast(newNotif);
      broadcastRef.current?.postMessage({
        type: 'notif:new',
        notification: newNotif,
      });

      if (firebaseUser) {
        const path = `users/${firebaseUser.uid}/notifications/${notifId}`;
        try {
          await setDoc(doc(db, 'users', firebaseUser.uid, 'notifications', notifId), {
            id: notifId,
            recipientId: firebaseUser.uid,
            actorId: firebaseUser.uid,
            actorName: partial.actorName,
            actorAvatar: partial.actorAvatar,
            type: partial.type,
            title: partial.title,
            body: partial.body,
            targetPostId: partial.targetPostId,
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      }
    },
    [firebaseUser, profile.uid, showToast]
  );

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      requireAuthorized();
      const next: UserProfile = {
        ...profile,
        ...updates,
        handle: updates.handle
          ? sanitizeHandle(updates.handle)
          : profile.handle,
        updatedAtMs: Date.now(),
      };
      setProfile(next);
      setRegisteredAccounts((prev) => {
        const exists = prev.some((acc) => acc.uid === next.uid);
        return exists
          ? prev.map((acc) => (acc.uid === next.uid ? next : acc))
          : [next, ...prev];
      });

      if (firebaseUser) {
        const path = `users/${firebaseUser.uid}`;
        try {
          await updateDoc(doc(db, 'users', firebaseUser.uid), {
            displayName: next.displayName,
            handle: next.handle,
            bio: next.bio,
            avatarUrl: next.avatarUrl,
            location: next.location,
            interests: next.interests.slice(0, 8),
            onboardingCompleted: next.onboardingCompleted,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      }
    },
    [firebaseUser, profile]
  );

  const updatePrivateSettings = useCallback(
    async (updates: Partial<UserPrivateSettings>) => {
      requireAuthorized();
      const next: UserPrivateSettings = {
        ...privateSettings,
        ...updates,
        uid: firebaseUser?.uid || profile.uid,
        email: firebaseUser?.email || privateSettings.email,
        themePreference: updates.themePreference || theme,
      };
      setPrivateSettings(next);
      if (typeof updates.pushEnabled === 'boolean') {
        setPushEnabled(updates.pushEnabled);
      }
      if (updates.themePreference) {
        setTheme(updates.themePreference);
      }

      if (firebaseUser) {
        const path = `users/${firebaseUser.uid}/private/settings`;
        try {
          await setDoc(doc(db, 'users', firebaseUser.uid, 'private', 'settings'), {
            uid: firebaseUser.uid,
            email: firebaseUser.email || next.email,
            pushEnabled: next.pushEnabled,
            themePreference: next.themePreference,
            notifyLikes: next.notifyLikes,
            notifyComments: next.notifyComments,
            notifyMessages: next.notifyMessages,
            profileVisibility: next.profileVisibility,
            messagePrivacy: next.messagePrivacy,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      }
    },
    [firebaseUser, privateSettings, profile.uid, theme]
  );

  const restartOnboarding = useCallback(async () => {
    await updateProfile({ onboardingCompleted: false });
  }, [updateProfile]);

  const completeOnboarding = useCallback(
    async (
      data: Partial<
        Pick<
          UserProfile,
          'displayName' | 'handle' | 'bio' | 'location' | 'interests' | 'avatarUrl'
        >
      >
    ) => {
      requireAuthorized();
      await updateProfile({
        ...data,
        onboardingCompleted: true,
      });
      await triggerNotification({
        actorId: profile.uid,
        actorName: 'Looma',
        actorAvatar: profile.avatarUrl,
        type: 'system',
        title: 'Welcome to Looma',
        body: 'Real-time feed, instant chat, and push alerts are active.',
        targetPostId: '',
      });
    },
    [profile.avatarUrl, profile.uid, triggerNotification, updateProfile]
  );

  const createPost = useCallback(
    async (
      caption: string,
      category: PostCategory,
      imageUrl: string,
      extra?: {
        videoUrl?: string;
        audioUrl?: string;
        linkUrl?: string;
        mediaTitle?: string;
      }
    ) => {
      requireAuthorized();
      const postId = makeSafeId('post');
      const now = Date.now();
      const videoUrl = extra?.videoUrl || '';
      const audioUrl = extra?.audioUrl || '';
      const linkUrl = extra?.linkUrl || '';
      const mediaTitle = extra?.mediaTitle || '';

      const newPost: Post = {
        id: postId,
        authorId: profile.uid,
        authorName: profile.displayName,
        authorHandle: profile.handle,
        authorAvatar: profile.avatarUrl,
        caption: caption.trim(),
        imageUrl,
        videoUrl,
        audioUrl,
        linkUrl,
        mediaTitle,
        category,
        likesCount: 0,
        commentsCount: 0,
        createdAtMs: now,
        updatedAtMs: now,
      };

      if (firebaseUser) {
        const path = `posts/${postId}`;
        try {
          await setDoc(doc(db, 'posts', postId), {
            id: postId,
            authorId: firebaseUser.uid,
            authorName: profile.displayName,
            authorHandle: profile.handle,
            authorAvatar: profile.avatarUrl,
            caption: newPost.caption,
            imageUrl: newPost.imageUrl,
            videoUrl: newPost.videoUrl,
            audioUrl: newPost.audioUrl,
            linkUrl: newPost.linkUrl,
            mediaTitle: newPost.mediaTitle,
            category: newPost.category,
            likesCount: 0,
            commentsCount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      } else {
        setLocalPosts((prev) => [newPost, ...prev]);
        broadcastRef.current?.postMessage({ type: 'post:new', post: newPost });
      }

      await triggerNotification({
        actorId: profile.uid,
        actorName: profile.displayName,
        actorAvatar: profile.avatarUrl,
        type: 'system',
        title: 'Post published to live feed',
        body: newPost.caption.slice(0, 90) || mediaTitle || 'Shared rich media post',
        targetPostId: postId,
      });

      const mentionedHandles = extractMentions(newPost.caption);
      for (const handle of mentionedHandles) {
        if (handle !== profile.handle.toLowerCase()) {
          await triggerNotification({
            actorId: profile.uid,
            actorName: profile.displayName,
            actorAvatar: profile.avatarUrl,
            type: 'mention',
            title: `${profile.displayName} mentioned you in a post`,
            body: newPost.caption.slice(0, 90),
            targetPostId: postId,
          });
        }
      }

      return newPost;
    },
    [firebaseUser, profile, triggerNotification]
  );

  const toggleLike = useCallback(
    async (post: Post) => {
      requireAuthorized();
      const alreadyLiked = likedPostIds.includes(post.id);
      const nextLiked = !alreadyLiked;
      setLikedPostIds((prev) =>
        nextLiked ? [...prev, post.id] : prev.filter((id) => id !== post.id)
      );

      const isRemotePost = remotePosts.some((rp) => rp.id === post.id);
      if (firebaseUser && isRemotePost) {
        const batch = writeBatch(db);
        const likeRef = doc(db, 'posts', post.id, 'likes', firebaseUser.uid);
        const postRef = doc(db, 'posts', post.id);
        if (nextLiked) {
          batch.set(likeRef, {
            userId: firebaseUser.uid,
            createdAt: serverTimestamp(),
          });
          batch.update(postRef, {
            likesCount: increment(1),
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.delete(likeRef);
          batch.update(postRef, {
            likesCount: increment(-1),
            updatedAt: serverTimestamp(),
          });
        }
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}`);
        }
      } else {
        setLocalPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  likesCount: Math.max(0, p.likesCount + (nextLiked ? 1 : -1)),
                }
              : p
          )
        );
      }
    },
    [firebaseUser, likedPostIds, remotePosts]
  );

  const toggleBookmark = useCallback(
    async (postId: string) => {
      requireAuthorized();
      const saved = bookmarkedPostIds.includes(postId);
      setBookmarkedPostIds((prev) =>
        saved ? prev.filter((id) => id !== postId) : [...prev, postId]
      );

      const isRemotePost = remotePosts.some((rp) => rp.id === postId);
      if (firebaseUser && isRemotePost) {
        const ref = doc(db, 'users', firebaseUser.uid, 'bookmarks', postId);
        try {
          if (saved) {
            await deleteDoc(ref);
          } else {
            await setDoc(ref, { postId, createdAt: serverTimestamp() });
          }
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.WRITE,
            `users/${firebaseUser.uid}/bookmarks/${postId}`
          );
        }
      }
    },
    [bookmarkedPostIds, firebaseUser, remotePosts]
  );

  const addComment = useCallback(
    async (post: Post, text: string) => {
      requireAuthorized();
      const commentId = makeSafeId('cmt');
      const now = Date.now();
      const newComment: PostComment = {
        id: commentId,
        postId: post.id,
        authorId: profile.uid,
        authorName: profile.displayName,
        authorHandle: profile.handle,
        authorAvatar: profile.avatarUrl,
        text: text.trim(),
        createdAtMs: now,
      };

      setCommentsByPost((prev) => ({
        ...prev,
        [post.id]: [...(prev[post.id] || []), newComment],
      }));

      const isRemotePost = remotePosts.some((rp) => rp.id === post.id);
      if (firebaseUser && isRemotePost) {
        const batch = writeBatch(db);
        batch.set(doc(db, 'posts', post.id, 'comments', commentId), {
          id: commentId,
          postId: post.id,
          authorId: firebaseUser.uid,
          authorName: profile.displayName,
          authorHandle: profile.handle,
          authorAvatar: profile.avatarUrl,
          text: newComment.text,
          createdAt: serverTimestamp(),
        });
        batch.update(doc(db, 'posts', post.id), {
          commentsCount: increment(1),
          updatedAt: serverTimestamp(),
        });
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.WRITE,
            `posts/${post.id}/comments/${commentId}`
          );
        }
      } else {
        setLocalPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, commentsCount: p.commentsCount + 1 }
              : p
          )
        );
      }

      await triggerNotification({
        actorId: profile.uid,
        actorName: profile.displayName,
        actorAvatar: profile.avatarUrl,
        type: 'comment',
        title: `Commented on ${post.authorName}'s post`,
        body: newComment.text,
        targetPostId: post.id,
      });

      const mentionedHandles = extractMentions(newComment.text);
      for (const handle of mentionedHandles) {
        if (handle !== profile.handle.toLowerCase()) {
          await triggerNotification({
            actorId: profile.uid,
            actorName: profile.displayName,
            actorAvatar: profile.avatarUrl,
            type: 'mention',
            title: `${profile.displayName} mentioned you in a comment`,
            body: newComment.text.slice(0, 90),
            targetPostId: post.id,
          });
        }
      }
    },
    [firebaseUser, profile, remotePosts, triggerNotification]
  );

  const subscribeChatMessages = useCallback(
    (chatId: string) => {
      if (!firebaseUser) return () => {};
      const q = query(
        collection(db, 'chats', chatId, 'messages'),
        where('memberIds', 'array-contains', firebaseUser.uid)
      );
      return onSnapshot(
        q,
        (snap) => {
          const mapped: ChatMessage[] = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: d.id || docSnap.id,
              chatId: d.chatId,
              senderId: d.senderId,
              senderName: d.senderName,
              senderAvatar: d.senderAvatar,
              text: d.text,
              memberIds: Array.isArray(d.memberIds) ? d.memberIds : [],
              createdAtMs: timestampToMs(d.createdAt),
            };
          });
          if (mapped.length > 0) {
            setMessagesByChat((prev) => ({
              ...prev,
              [chatId]: mapped.sort((a, b) => a.createdAtMs - b.createdAtMs),
            }));
          }
        },
        () => {
          // Seed threads not yet stored in Firestore remain available locally
        }
      );
    },
    [firebaseUser]
  );

  const sendChatMessage = useCallback(
    async (thread: ChatThread, text: string) => {
      requireAuthorized();
      const trimmed = text.trim();
      if (!trimmed) return;
      const msgId = makeSafeId('msg');
      const now = Date.now();
      const memberIds = thread.memberIds.includes(profile.uid)
        ? thread.memberIds
        : [profile.uid, ...thread.memberIds].slice(0, 10);

      const newMsg: ChatMessage = {
        id: msgId,
        chatId: thread.id,
        senderId: profile.uid,
        senderName: profile.displayName,
        senderAvatar: profile.avatarUrl,
        text: trimmed,
        memberIds,
        createdAtMs: now,
      };

      setMessagesByChat((prev) => ({
        ...prev,
        [thread.id]: [...(prev[thread.id] || []), newMsg],
      }));
      setThreads((prev) =>
        prev
          .map((t) =>
            t.id === thread.id
              ? {
                  ...t,
                  lastMessageText: trimmed,
                  lastMessageSenderId: profile.uid,
                  updatedAtMs: now,
                }
              : t
          )
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      );

      broadcastRef.current?.postMessage({
        type: 'chat:message',
        threadId: thread.id,
        message: newMsg,
      });

      if (firebaseUser) {
        try {
          const threadRef = doc(db, 'chats', thread.id);
          const threadSnap = await getDoc(threadRef);
          const batch = writeBatch(db);
          if (!threadSnap.exists()) {
            batch.set(threadRef, {
              id: thread.id,
              title: thread.title,
              isGroup: thread.isGroup,
              memberIds,
              lastMessageText: trimmed,
              lastMessageSenderId: firebaseUser.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            batch.update(threadRef, {
              lastMessageText: trimmed,
              lastMessageSenderId: firebaseUser.uid,
              updatedAt: serverTimestamp(),
            });
          }
          batch.set(doc(db, 'chats', thread.id, 'messages', msgId), {
            id: msgId,
            chatId: thread.id,
            senderId: firebaseUser.uid,
            senderName: profile.displayName,
            senderAvatar: profile.avatarUrl,
            text: trimmed,
            memberIds,
            createdAt: serverTimestamp(),
          });
          await batch.commit();
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.WRITE,
            `chats/${thread.id}/messages/${msgId}`
          );
        }
      }
    },
    [firebaseUser, profile]
  );

  const startDirectThread = useCallback(
    async (creator: UserProfile): Promise<ChatThread> => {
      requireAuthorized();
      const existing = threads.find(
        (t) => !t.isGroup && t.memberIds.includes(creator.uid)
      );
      if (existing) return existing;

      const chatId = makeSafeId('chat');
      const now = Date.now();
      const newThread: ChatThread = {
        id: chatId,
        title: creator.displayName,
        isGroup: false,
        memberIds: [profile.uid, creator.uid],
        partnerAvatar: creator.avatarUrl,
        partnerHandle: creator.handle,
        lastMessageText: 'Started a new conversation',
        lastMessageSenderId: profile.uid,
        createdAtMs: now,
        updatedAtMs: now,
      };
      setThreads((prev) => [newThread, ...prev]);

      if (firebaseUser) {
        try {
          await setDoc(doc(db, 'chats', chatId), {
            id: chatId,
            title: newThread.title,
            isGroup: false,
            memberIds: newThread.memberIds,
            lastMessageText: newThread.lastMessageText,
            lastMessageSenderId: firebaseUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `chats/${chatId}`);
        }
      }
      return newThread;
    },
    [firebaseUser, profile.uid, threads]
  );

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      if (firebaseUser) {
        updateDoc(
          doc(db, 'users', firebaseUser.uid, 'notifications', notificationId),
          { read: true }
        ).catch(() => {});
      }
    },
    [firebaseUser]
  );

  const toggleFollowUser = useCallback(
    (targetUid: string) => {
      if (!isAuthorized) return;
      if (!targetUid || targetUid === profile.uid) return;
      const result = toggleFollowState(
        followedUserIds,
        targetUid,
        followedUserIds.length
      );
      hasRemoteFollowingRef.current = true;
      setFollowedUserIds(result.followedIds);
      writeStorage(STORAGE_KEYS.FOLLOWED_IDS, result.followedIds);
      setProfile((prev) => ({
        ...prev,
        followingCount: result.followedIds.length,
        updatedAtMs: Date.now(),
      }));
      if (firebaseUser) {
        const followRef = doc(
          db,
          'users',
          firebaseUser.uid,
          'following',
          targetUid
        );
        const followerMirrorRef = doc(
          db,
          'users',
          targetUid,
          'followers',
          firebaseUser.uid
        );
        const syncOp = result.isFollowing
          ? setDoc(followRef, {
              followerId: firebaseUser.uid,
              targetUid,
              createdAt: serverTimestamp(),
            })
          : deleteDoc(followRef);
        syncOp.catch((err) =>
          handleFirestoreError(
            err,
            OperationType.WRITE,
            `users/${firebaseUser.uid}/following/${targetUid}`
          )
        );
        const mirrorOp = result.isFollowing
          ? setDoc(followerMirrorRef, {
              followerId: firebaseUser.uid,
              targetUid,
              createdAt: serverTimestamp(),
            })
          : deleteDoc(followerMirrorRef);
        mirrorOp.catch(() => {});
        updateDoc(doc(db, 'users', firebaseUser.uid), {
          followingCount: result.followedIds.length,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    [firebaseUser, followedUserIds, profile.uid]
  );

  const fetchOtherUserConnections = useCallback(
    async (targetUid: string) => {
      let remoteFollowersIds: string[] = [];
      let remoteFollowingIds: string[] = [];
      if (firebaseUser) {
        try {
          const [followersSnap, followingSnap] = await Promise.all([
            getDocs(
              query(
                collection(db, 'users', targetUid, 'followers'),
                where('targetUid', '==', targetUid)
              )
            ),
            getDocs(
              query(
                collection(db, 'users', targetUid, 'following'),
                where('followerId', '==', targetUid)
              )
            ),
          ]);
          remoteFollowersIds = followersSnap.docs.map((d) => d.id);
          remoteFollowingIds = followingSnap.docs.map((d) => d.id);
        } catch {
          // Seed-only creators do not have Firestore subcollections; fallback cleanly
        }
      }
      return computeOtherUserConnections(
        targetUid,
        profile,
        communityUsers,
        followedUserIds,
        followerUserIds,
        SEED_FOLLOW_GRAPH,
        remoteFollowersIds,
        remoteFollowingIds
      );
    },
    [communityUsers, firebaseUser, followedUserIds, followerUserIds, profile]
  );

  const fetchPublicUserProfile = useCallback(
    async (targetUid: string, fallbackPost?: Post): Promise<UserProfile | null> => {
      const localMatch = resolvePublicProfile(
        targetUid,
        profile,
        communityUsers,
        fallbackPost ? [fallbackPost, ...posts] : posts
      );
      if (
        firebaseUser &&
        targetUid !== firebaseUser.uid &&
        !communityUsers.some((c) => c.uid === targetUid)
      ) {
        const path = `users/${targetUid}`;
        try {
          const snap = await getDoc(doc(db, 'users', targetUid));
          if (snap.exists()) {
            const d = snap.data();
            return {
              uid: d.uid,
              displayName: d.displayName,
              handle: d.handle,
              bio: d.bio || '',
              avatarUrl: normalizeAssetUrl(d.avatarUrl || ''),
              location: d.location || '',
              interests: Array.isArray(d.interests) ? d.interests : [],
              followersCount: Number(d.followersCount || 0),
              followingCount: Number(d.followingCount || 0),
              onboardingCompleted: Boolean(d.onboardingCompleted),
              createdAtMs: timestampToMs(d.createdAt),
              updatedAtMs: timestampToMs(d.updatedAt),
            };
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, path);
        }
      }
      return localMatch;
    },
    [communityUsers, firebaseUser, posts, profile]
  );

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (firebaseUser) {
      const batch = writeBatch(db);
      notifications
        .filter((n) => !n.read)
        .forEach((n) => {
          batch.update(
            doc(db, 'users', firebaseUser.uid, 'notifications', n.id),
            { read: true }
          );
        });
      batch.commit().catch(() => {});
    }
  }, [firebaseUser, notifications]);

  const addStory = useCallback(
    async (caption: string, imageUrl: string) => {
      requireAuthorized();
      const now = Date.now();
      const storyId = makeSafeId('story');
      const trimmedCaption = caption.trim();
      const safeCaption =
        trimmedCaption.length > 280
          ? `${trimmedCaption.slice(0, 277).trimEnd()}...`
          : trimmedCaption;
      const newStory: StoryItem = {
        id: storyId,
        authorId: profile.uid,
        authorName: profile.displayName,
        authorHandle: profile.handle,
        authorAvatar: profile.avatarUrl,
        imageUrl,
        caption: safeCaption,
        createdAtMs: now,
        expiresAtMs: now + 24 * 3_600_000,
      };
      if (firebaseUser) {
        try {
          await setDoc(doc(db, 'stories', storyId), {
            id: storyId,
            authorId: firebaseUser.uid,
            authorName: profile.displayName,
            authorHandle: profile.handle,
            authorAvatar: profile.avatarUrl,
            imageUrl: newStory.imageUrl,
            caption: newStory.caption,
            expiresAtMs: newStory.expiresAtMs,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `stories/${storyId}`);
        }
      } else {
        setLocalStories((prev) => [...prev, newStory]);
        broadcastRef.current?.postMessage({ type: 'story:new', story: newStory });
      }
      await triggerNotification({
        actorId: profile.uid,
        actorName: profile.displayName,
        actorAvatar: profile.avatarUrl,
        type: 'system',
        title: 'Story added to your header',
        body: newStory.caption || 'Shared a new 24h visual story.',
        targetPostId: '',
      });
      return newStory;
    },
    [firebaseUser, profile, requireAuthorized, triggerNotification]
  );

  const sharePostToStory = useCallback(
    async (post: Post) => {
      requireAuthorized();
      const { imageUrl, caption } = buildStoryFromPost(post);
      return await addStory(caption, imageUrl);
    },
    [addStory, requireAuthorized]
  );

  const markStoryViewed = useCallback((storyId: string) => {
    setViewedStoryIds((prev) =>
      prev.includes(storyId) ? prev : [...prev, storyId]
    );
  }, []);

  const connections = computeConnections(
    communityUsers,
    followerUserIds,
    followedUserIds
  );
  const storyGroups = groupStoriesByAuthor(
    stories,
    profile.uid,
    viewedStoryIds
  );

  const normalizedProfile: UserProfile = {
    ...profile,
    avatarUrl: normalizeAssetUrl(profile.avatarUrl),
    followersCount: connections.followers.length,
    followingCount: connections.following.length,
  };

  return {
    firebaseUser,
    isAuthenticated,
    isAuthorized,
    isLocalAutostart: autostart,
    authReady,
    authError,
    authLoading,
    loginWithGoogle,
    logout,
    theme,
    toggleTheme,
    setThemeExplicit,
    pushPermission,
    pushEnabled,
    enablePushNotifications,
    profile: normalizedProfile,
    privateSettings,
    updateProfile,
    updatePrivateSettings,
    restartOnboarding,
    completeOnboarding,
    posts,
    stories,
    storyGroups,
    viewedStoryIds,
    addStory,
    sharePostToStory,
    markStoryViewed,
    onlineUserIds,
    commentsByPost,
    likedPostIds,
    bookmarkedPostIds,
    followedUserIds,
    followerUserIds,
    communityUsers,
    connections,
    toggleFollowUser,
    fetchPublicUserProfile,
    fetchOtherUserConnections,
    createPost,
    toggleLike,
    toggleBookmark,
    addComment,
    threads,
    messagesByChat,
    subscribeChatMessages,
    sendChatMessage,
    startDirectThread,
    notifications,
    activeToast,
    dismissToast: () => setActiveToast(null),
    triggerNotification,
    markNotificationRead,
    markAllNotificationsRead,
  };
}
