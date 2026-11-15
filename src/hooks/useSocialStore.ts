import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
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
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
} from 'firebase/firestore';
import {
  auth,
  db,
  deleteCurrentAuthUser,
  handleFirestoreError,
  OperationType,
  reloadCurrentUser,
  resendVerificationEmail,
  signInWithGoogle,
  signInWithApple,
  signInWithEmail,
  signUpWithEmail,
  signOutAccount,
  testFirestoreConnection,
} from '../services/firebase';
import { deleteUploadedMedia } from '../services/storage';
import {
  buildFallbackPrivateSettings,
  buildFallbackUserProfile,
  isTransientFirestoreError,
} from '../utils/firebaseResilience';
import {
  createInitialMemberProfile,
  isDemoPostId,
  isDemoUserId,
  stripDemoComments,
  stripDemoMessages,
  stripDemoNotifications,
  stripDemoPosts,
  stripDemoStories,
  stripDemoThreads,
  stripDemoUsers,
} from '../services/seedData';
import {
  dispatchBrowserPush,
  getPushPermissionState,
  requestPushPermission,
  type PushPermissionState,
} from '../services/notifications';
import type {
  AppNotification,
  CallParticipant,
  CallSession,
  ChatMessage,
  ChatThread,
  IncomingCallInvite,
  Post,
  PostCategory,
  PostComment,
  StoryItem,
  ThemeMode,
  UserPrivateSettings,
  UserProfile,
} from '../types/social';
import {
  addGroupParticipantsState,
  buildStoryFromPost,
  canUseAutostart,
  computeConnections,
  computeOtherUserConnections,
  createGroupThreadRecord,
  extractMentions,
  formatChatPushPayload,
  formatVoiceNote,
  groupStoriesByAuthor,
  isAuthorizedSession,
  normalizeAssetUrl,
  POST_CATEGORIES,
  promoteGroupAdminState,
  removeGroupParticipantState,
  resolvePublicProfile,
  sanitizeHandle,
  sanitizeMediaTitle,
  shouldDispatchChatPushNotification,
  toggleFollowState,
  validateGroupChatInput,
} from '../utils/socialLogic';
import { extractStorageKeyFromUrl } from '../utils/storageLogic';

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
  MUTED_CHATS: 'looma_muted_chats_v1',
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

async function readDocResilient(
  ref: DocumentReference<DocumentData>
): Promise<DocumentSnapshot<DocumentData> | null> {
  try {
    return await getDoc(ref);
  } catch (err) {
    if (!isTransientFirestoreError(err)) {
      throw err;
    }
    try {
      return await getDocFromCache(ref);
    } catch {
      return null;
    }
  }
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
        return stripDemoUsers(
          stored.filter((acc) => acc.uid !== 'guest_local_user')
        );
      }
      return [];
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

  const [remotePosts, setRemotePosts] = useState<Post[]>([]);
  const [localPosts, setLocalPosts] = useState<Post[]>(() => {
    const stored = stripDemoPosts(readStorage<Post[]>(STORAGE_KEYS.POSTS, []));
    if (stored.length > 0) return stored;
    if (autostart) {
      return [
        {
          id: 'post_seed_1',
          authorId: 'creator_sophia',
          authorName: 'Sophia Chen',
          authorHandle: 'sophia.studio',
          authorAvatar:
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          caption:
            'Morning architectural walk around the pavilion #Design #Architecture. Loving the light and clean lines.',
          category: 'Architecture',
          imageUrl:
            'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800',
          likesCount: 24,
          commentsCount: 3,
          createdAtMs: Date.now() - 1000 * 60 * 60 * 2,
          updatedAtMs: Date.now() - 1000 * 60 * 60 * 2,
        },
        {
          id: 'post_seed_2',
          authorId: 'creator_marcus',
          authorName: 'Marcus Vance',
          authorHandle: 'marcus.vance',
          authorAvatar:
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
          caption:
            'Capturing dawn mist in the Cascade Mountains. Nature never ceases to amaze me. #Photography #Travel',
          category: 'Photography',
          imageUrl:
            'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800',
          likesCount: 42,
          commentsCount: 7,
          createdAtMs: Date.now() - 1000 * 60 * 60 * 5,
          updatedAtMs: Date.now() - 1000 * 60 * 60 * 5,
        },
      ];
    }
    return [];
  });

  const [commentsByPost, setCommentsByPost] = useState<
    Record<string, PostComment[]>
  >(() =>
    stripDemoComments(
      readStorage<Record<string, PostComment[]>>(STORAGE_KEYS.COMMENTS, {})
    )
  );

  const [likedPostIds, setLikedPostIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.LIKED_IDS, []).filter(
      (id) => !isDemoPostId(id)
    )
  );
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.BOOKMARK_IDS, []).filter(
      (id) => !isDemoPostId(id)
    )
  );
  const [followedUserIds, setFollowedUserIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.FOLLOWED_IDS, []).filter(
      (id) => !isDemoUserId(id)
    )
  );
  const [followerUserIds, setFollowerUserIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.FOLLOWER_IDS, []).filter(
      (id) => !isDemoUserId(id)
    )
  );
  const hasRemoteFollowingRef = useRef(false);
  const [communityUsers, setCommunityUsers] = useState<UserProfile[]>(() => {
    if (autostart) {
      return [
        {
          uid: 'creator_sophia',
          displayName: 'Sophia Chen',
          handle: 'sophia.studio',
          avatarUrl:
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          bio: 'Senior UX Architect & Design Lead',
          location: 'San Francisco, CA',
          interests: ['Design', 'Architecture'],
          followersCount: 1420,
          followingCount: 380,
          onboardingCompleted: true,
          createdAtMs: Date.now() - 86400000 * 30,
          updatedAtMs: Date.now(),
        },
        {
          uid: 'creator_marcus',
          displayName: 'Marcus Vance',
          handle: 'marcus.vance',
          avatarUrl:
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
          bio: 'Landscape & Architectural Photographer',
          location: 'Seattle, WA',
          interests: ['Photography', 'Travel'],
          followersCount: 890,
          followingCount: 210,
          onboardingCompleted: true,
          createdAtMs: Date.now() - 86400000 * 15,
          updatedAtMs: Date.now(),
        },
      ];
    }
    return [];
  });

  const [remoteStories, setRemoteStories] = useState<StoryItem[]>([]);
  const [localStories, setLocalStories] = useState<StoryItem[]>(() =>
    stripDemoStories(readStorage<StoryItem[]>(STORAGE_KEYS.STORIES, []))
  );
  const [viewedStoryIds, setViewedStoryIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.VIEWED_STORIES, [])
  );
  const [remoteOnlineIds, setRemoteOnlineIds] = useState<string[]>(() =>
    autostart ? ['creator_sophia'] : []
  );
  const onlineUserIds = Array.from(
    new Set([
      ...(isAuthenticated ? [profile.uid] : []),
      ...remoteOnlineIds.filter((id) => !isDemoUserId(id)),
    ])
  );
  const hydratedRemotePostIdsRef = useRef<Set<string>>(new Set());

  const [threads, setThreads] = useState<ChatThread[]>(() => {
    const stored = stripDemoThreads(
      readStorage<ChatThread[]>(STORAGE_KEYS.CHATS, [])
    );
    if (stored.length > 0) return stored;
    if (autostart) {
      return [
        {
          id: 'chat_sophia_direct',
          isGroup: false,
          title: 'Sophia Chen',
          partnerHandle: 'sophia.studio',
          partnerAvatar:
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          memberIds: [profile.uid, 'creator_sophia'],
          adminIds: [profile.uid, 'creator_sophia'],
          lastMessageText: '🎤 Voice message',
          lastMessageSenderId: 'creator_sophia',
          createdAtMs: Date.now() - 1000 * 60 * 60 * 24,
          updatedAtMs: Date.now() - 1000 * 60 * 5,
        },
      ];
    }
    return [];
  });
  const [messagesByChat, setMessagesByChat] = useState<
    Record<string, ChatMessage[]>
  >(() => {
    const stored = stripDemoMessages(
      readStorage<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, {})
    );
    if (Object.keys(stored).length > 0) return stored;
    if (autostart) {
      return {
        chat_sophia_direct: [
          {
            id: 'msg_seed_1',
            chatId: 'chat_sophia_direct',
            senderId: 'creator_sophia',
            senderName: 'Sophia Chen',
            senderAvatar:
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            text: 'Hey Alex! Loved your latest post on the feed. Here is a quick voice note about our upcoming sprint!',
            memberIds: [profile.uid, 'creator_sophia'],
            createdAtMs: Date.now() - 1000 * 60 * 15,
          },
          {
            id: 'msg_seed_2',
            chatId: 'chat_sophia_direct',
            senderId: 'creator_sophia',
            senderName: 'Sophia Chen',
            senderAvatar:
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            text: formatVoiceNote(
              'https://cdn.freesound.org/previews/612/612082_5674468-lq.mp3',
              14
            ),
            memberIds: [profile.uid, 'creator_sophia'],
            createdAtMs: Date.now() - 1000 * 60 * 10,
          },
          {
            id: 'msg_seed_3',
            chatId: 'chat_sophia_direct',
            senderId: profile.uid,
            senderName: profile.displayName,
            senderAvatar: profile.avatarUrl,
            text: 'Awesome note Sophia! Check out this reference link for the UI components: https://developer.mozilla.org/en-US/docs/Web/CSS',
            memberIds: [profile.uid, 'creator_sophia'],
            createdAtMs: Date.now() - 1000 * 60 * 4,
          },
        ],
      };
    }
    return {};
  });
  const [mutedChatIds, setMutedChatIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.MUTED_CHATS, [])
  );

  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    stripDemoNotifications(
      readStorage<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, [])
    )
  );

  const [activeToast, setActiveToast] = useState<AppNotification | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const themeRef = useRef<ThemeMode>(theme);
  const pushEnabledRef = useRef<boolean>(pushEnabled);
  const profileRef = useRef<UserProfile>(profile);
  const privateSettingsRef = useRef<UserPrivateSettings>(privateSettings);
  const mutedChatIdsRef = useRef<string[]>(mutedChatIds);
  const threadsRef = useRef<ChatThread[]>(threads);
  const communityUsersRef = useRef<UserProfile[]>(communityUsers);
  const initialChatsSyncedRef = useRef(false);
  const notifiedChatStampsRef = useRef<Set<string>>(new Set());
  const leftChatIdsRef = useRef<Set<string>>(new Set());
  const [incomingCallInvite, setIncomingCallInvite] =
    useState<IncomingCallInvite | null>(null);
  const declinedCallIdsRef = useRef<Set<string>>(new Set());
  const callSessionRef = useRef<CallSession | null>(null);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    pushEnabledRef.current = pushEnabled;
  }, [pushEnabled]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    privateSettingsRef.current = privateSettings;
  }, [privateSettings]);

  useEffect(() => {
    mutedChatIdsRef.current = mutedChatIds;
    writeStorage(STORAGE_KEYS.MUTED_CHATS, mutedChatIds);
  }, [mutedChatIds]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    communityUsersRef.current = communityUsers;
  }, [communityUsers]);

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

  const notifyIncomingChatMessage = useCallback(
    (params: {
      thread: Pick<ChatThread, 'id' | 'title' | 'isGroup'>;
      senderId: string;
      senderName: string;
      senderAvatar: string;
      text: string;
      dedupeKey: string;
    }) => {
      if (notifiedChatStampsRef.current.has(params.dedupeKey)) {
        return;
      }
      const allowed = shouldDispatchChatPushNotification({
        senderId: params.senderId,
        currentUid: profileRef.current.uid,
        chatId: params.thread.id,
        mutedChatIds: mutedChatIdsRef.current,
        notifyMessages: privateSettingsRef.current.notifyMessages,
      });
      if (!allowed) return;

      notifiedChatStampsRef.current.add(params.dedupeKey);
      if (notifiedChatStampsRef.current.size > 200) {
        const first = notifiedChatStampsRef.current.values().next().value;
        if (first) notifiedChatStampsRef.current.delete(first);
      }

      const payload = formatChatPushPayload(
        params.thread,
        params.senderName,
        params.text
      );
      const newNotif: AppNotification = {
        id: makeSafeId('notif_msg'),
        recipientId: profileRef.current.uid,
        actorId: params.senderId,
        actorName: params.senderName,
        actorAvatar: params.senderAvatar || '',
        type: 'message',
        title: payload.title,
        body: payload.body,
        targetPostId: '',
        read: false,
        createdAtMs: Date.now(),
      };
      setNotifications((prev) => [newNotif, ...prev]);
      showToast(newNotif);
    },
    [showToast]
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
        | { type: 'chat:thread_created'; thread: ChatThread }
        | { type: 'chat:thread_updated'; thread: ChatThread }
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
      } else if (payload.type === 'chat:thread_created') {
        if (
          payload.thread.memberIds.includes(profileRef.current.uid) &&
          !leftChatIdsRef.current.has(payload.thread.id)
        ) {
          setThreads((prev) =>
            prev.some((t) => t.id === payload.thread.id)
              ? prev
              : [payload.thread, ...prev]
          );
        }
      } else if (payload.type === 'chat:thread_updated') {
        const stillMember = payload.thread.memberIds.includes(
          profileRef.current.uid
        );
        setThreads((prev) => {
          if (!stillMember) {
            return prev.filter((t) => t.id !== payload.thread.id);
          }
          const exists = prev.some((t) => t.id === payload.thread.id);
          const next = exists
            ? prev.map((t) =>
                t.id === payload.thread.id ? payload.thread : t
              )
            : [payload.thread, ...prev];
          return [...next].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
        });
      } else if (payload.type === 'chat:message') {
        setMessagesByChat((prev) => {
          const existing = prev[payload.threadId] || [];
          if (existing.some((m) => m.id === payload.message.id)) return prev;
          return {
            ...prev,
            [payload.threadId]: [...existing, payload.message],
          };
        });
        const matchedThread = threadsRef.current.find(
          (t) => t.id === payload.threadId
        );
        setThreads((prev) =>
          prev
            .map((t) =>
              t.id === payload.threadId
                ? {
                    ...t,
                    lastMessageText: payload.message.text,
                    lastMessageSenderId: payload.message.senderId,
                    updatedAtMs: payload.message.createdAtMs,
                  }
                : t
            )
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        );
        if (matchedThread) {
          notifyIncomingChatMessage({
            thread: matchedThread,
            senderId: payload.message.senderId,
            senderName: payload.message.senderName,
            senderAvatar: payload.message.senderAvatar,
            text: payload.message.text,
            dedupeKey: `msg:${payload.message.id}`,
          });
        }
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
  }, [notifyIncomingChatMessage, showToast]);

  // Startup Firestore connectivity verification
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  const hydrateVerifiedUser = useCallback(
    async (user: User) => {
      const cachedProfile = readStorage<UserProfile | null>(
        STORAGE_KEYS.PROFILE,
        null
      );
      const cachedSettings = readStorage<UserPrivateSettings | null>(
        STORAGE_KEYS.SETTINGS,
        null
      );
      const fallbackProfile = buildFallbackUserProfile(
        user,
        cachedProfile,
        autostart
      );
      const fallbackSettings = buildFallbackPrivateSettings(
        user,
        cachedSettings,
        pushEnabledRef.current,
        themeRef.current
      );

      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await readDocResilient(userRef);
        let hydratedProfile: UserProfile = fallbackProfile;
        let hydratedSettings: UserPrivateSettings = fallbackSettings;

        if (snap && snap.exists()) {
          const d = snap.data();
          const resolvedDisplayName =
            (!d.displayName || d.displayName === 'Looma Member') &&
            user.displayName
              ? user.displayName.trim().slice(0, 60)
              : d.displayName;
          const resolvedAvatar = normalizeAssetUrl(
            d.avatarUrl || user.photoURL || ''
          );
          hydratedProfile = {
            uid: d.uid || user.uid,
            displayName: resolvedDisplayName,
            handle: d.handle || fallbackProfile.handle,
            bio: d.bio ?? '',
            avatarUrl: resolvedAvatar,
            location: d.location ?? '',
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
        } else if (snap && !snap.exists()) {
          const newProfile: UserProfile = {
            ...fallbackProfile,
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
          };
          hydratedProfile = newProfile;
          setDoc(userRef, {
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
          }).catch(() => {});
          setDoc(doc(db, 'users', user.uid, 'private', 'settings'), {
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
          }).catch(() => {});
        }

        try {
          const settingsSnap = await readDocResilient(
            doc(db, 'users', user.uid, 'private', 'settings')
          );
          if (settingsSnap && settingsSnap.exists()) {
            const s = settingsSnap.data();
            hydratedSettings = {
              uid: s.uid || user.uid,
              email: s.email || user.email || '',
              pushEnabled: Boolean(s.pushEnabled ?? true),
              themePreference:
                s.themePreference === 'dark' ? 'dark' : 'light',
              notifyLikes: Boolean(s.notifyLikes ?? true),
              notifyComments: Boolean(s.notifyComments ?? true),
              notifyMessages: Boolean(s.notifyMessages ?? true),
              profileVisibility:
                s.profileVisibility === 'followers' ? 'followers' : 'public',
              messagePrivacy:
                s.messagePrivacy === 'following' ? 'following' : 'everyone',
            };
          }
        } catch {
          // Keep fallback private settings if transient failure occurs
        }

        setAuthError(null);
        setFirebaseUser(user);
        setProfile(hydratedProfile);
        setPrivateSettings(hydratedSettings);
        setIsAuthenticated(true);
        writeStorage(STORAGE_KEYS.SESSION_ACTIVE, true);
        writeStorage(STORAGE_KEYS.PROFILE, hydratedProfile);
      } catch (err) {
        if (!isTransientFirestoreError(err)) {
          console.error('Failed to load user profile', err);
        }
        setAuthError(null);
        setFirebaseUser(user);
        setProfile(fallbackProfile);
        setPrivateSettings(fallbackSettings);
        setIsAuthenticated(true);
        writeStorage(STORAGE_KEYS.SESSION_ACTIVE, true);
        writeStorage(STORAGE_KEYS.PROFILE, fallbackProfile);
      } finally {
        setAuthReady(true);
      }
    },
    [autostart]
  );

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
        await hydrateVerifiedUser(user);
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
  }, [autostart, hydrateVerifiedUser]);

  // Firestore real-time listeners when authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified) return;

    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const unsubOwnProfile = onSnapshot(
      userDocRef,
      (snap) => {
        if (snap.metadata.fromCache) return;
        if (snap.exists()) {
          const d = snap.data();
          const synced: UserProfile = {
            uid: d.uid || firebaseUser.uid,
            displayName: d.displayName || profileRef.current.displayName,
            handle: d.handle || profileRef.current.handle,
            bio: d.bio ?? '',
            avatarUrl: normalizeAssetUrl(
              d.avatarUrl || firebaseUser.photoURL || ''
            ),
            location: d.location ?? '',
            interests: Array.isArray(d.interests) ? d.interests : [],
            followersCount: Number(d.followersCount || 0),
            followingCount: Number(d.followingCount || 0),
            onboardingCompleted: Boolean(d.onboardingCompleted),
            createdAtMs: timestampToMs(d.createdAt),
            updatedAtMs: timestampToMs(d.updatedAt),
          };
          setProfile(synced);
          writeStorage(STORAGE_KEYS.PROFILE, synced);
        } else {
          const seed = profileRef.current;
          setDoc(userDocRef, {
            uid: firebaseUser.uid,
            displayName: seed.displayName,
            handle: seed.handle,
            bio: seed.bio,
            avatarUrl: seed.avatarUrl,
            location: seed.location,
            interests: seed.interests.slice(0, 8),
            followersCount: 0,
            followingCount: 0,
            onboardingCompleted: seed.onboardingCompleted,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      },
      (err) => {
        if (isTransientFirestoreError(err)) return;
        handleFirestoreError(
          err,
          OperationType.GET,
          `users/${firebaseUser.uid}`
        );
      }
    );

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
            mediaTitle: sanitizeMediaTitle(
              typeof d.mediaTitle === 'string' ? d.mediaTitle : ''
            ),
            category: d.category,
            likesCount: Number(d.likesCount || 0),
            commentsCount: Number(d.commentsCount || 0),
            createdAtMs: timestampToMs(d.createdAt),
            updatedAtMs: timestampToMs(d.updatedAt),
          };
        });
        const filtered = mapped.filter(
          (p) => !isDemoPostId(p.id) && !isDemoUserId(p.authorId)
        );
        setRemotePosts(filtered.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      (err) => {
        if (isTransientFirestoreError(err)) return;
        handleFirestoreError(err, OperationType.LIST, 'posts');
      }
    );

    const chatsQuery = query(
      collection(db, 'chats'),
      where('memberIds', 'array-contains', firebaseUser.uid)
    );
    initialChatsSyncedRef.current = false;
    const unsubChats = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const mapped: ChatThread[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          const memberIds = Array.isArray(d.memberIds) ? d.memberIds : [];
          const isGroup = Boolean(d.isGroup);
          const adminIds = Array.isArray(d.adminIds) ? d.adminIds : undefined;
          const partnerUid =
            memberIds.find((id: string) => id !== firebaseUser.uid) || memberIds[0];
          const partnerProfile = communityUsersRef.current.find(
            (u) => u.uid === partnerUid
          );
          return {
            id: d.id || docSnap.id,
            title: d.title,
            isGroup,
            memberIds,
            ...(adminIds ? { adminIds } : {}),
            partnerAvatar: partnerProfile?.avatarUrl || '',
            partnerHandle: isGroup
              ? `${memberIds.length} members`
              : partnerProfile?.handle || 'direct',
            lastMessageText: d.lastMessageText || '',
            lastMessageSenderId: d.lastMessageSenderId || '',
            createdAtMs: timestampToMs(d.createdAt),
            updatedAtMs: timestampToMs(d.updatedAt),
          };
        });

        if (initialChatsSyncedRef.current) {
          for (const change of snapshot.docChanges()) {
            if (change.type === 'added' || change.type === 'modified') {
              const d = change.doc.data();
              const senderId = String(d.lastMessageSenderId || '');
              const text = String(d.lastMessageText || '');
              const updatedAtMs = timestampToMs(d.updatedAt);
              if (senderId && senderId !== firebaseUser.uid && text) {
                const senderProfile = communityUsersRef.current.find(
                  (u) => u.uid === senderId
                );
                notifyIncomingChatMessage({
                  thread: {
                    id: d.id || change.doc.id,
                    title: d.title || 'Looma Chat',
                    isGroup: Boolean(d.isGroup),
                  },
                  senderId,
                  senderName: senderProfile?.displayName || 'Community Member',
                  senderAvatar: senderProfile?.avatarUrl || '',
                  text,
                  dedupeKey: `thread:${d.id || change.doc.id}:${senderId}:${text}:${updatedAtMs}`,
                });
              }
            }
          }
        }
        initialChatsSyncedRef.current = true;

        setThreads(
          stripDemoThreads(mapped).sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        );
      },
      (err) => {
        if (isTransientFirestoreError(err)) return;
        handleFirestoreError(err, OperationType.LIST, 'chats');
      }
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
      (err) => {
        if (isTransientFirestoreError(err)) return;
        handleFirestoreError(
          err,
          OperationType.LIST,
          `users/${firebaseUser.uid}/notifications`
        );
      }
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
      (err) => {
        if (isTransientFirestoreError(err)) return;
        handleFirestoreError(
          err,
          OperationType.LIST,
          `users/${firebaseUser.uid}/bookmarks`
        );
      }
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
              avatarUrl: normalizeAssetUrl(d.avatarUrl || ''),
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
            (u) => u.uid !== firebaseUser.uid && !isDemoUserId(u.uid)
          );
        setCommunityUsers(remoteMembers);
      })
      .catch((err) => {
        if (isTransientFirestoreError(err)) return;
        handleFirestoreError(err, OperationType.LIST, 'users');
      });

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
        const filtered = stripDemoStories(mapped);
        setRemoteStories(filtered.sort((a, b) => a.createdAtMs - b.createdAtMs));
      },
      (err) => {
        if (isTransientFirestoreError(err)) return;
        handleFirestoreError(err, OperationType.LIST, 'stories');
      }
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
      (err) => {
        if (isTransientFirestoreError(err)) return;
        handleFirestoreError(
          err,
          OperationType.LIST,
          `users/${firebaseUser.uid}/following`
        );
      }
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
      (err) => {
        if (isTransientFirestoreError(err)) return;
        handleFirestoreError(
          err,
          OperationType.LIST,
          `users/${firebaseUser.uid}/followers`
        );
      }
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
      (err) => {
        if (isTransientFirestoreError(err)) return;
        handleFirestoreError(err, OperationType.LIST, 'presence');
      }
    );

    const callsQuery = query(
      collection(db, 'calls'),
      where('memberIds', 'array-contains', firebaseUser.uid)
    );
    const unsubCalls = onSnapshot(
      callsQuery,
      (snapshot) => {
        const now = Date.now();
        let nextInvite: IncomingCallInvite | null = null;
        for (const docSnap of snapshot.docs) {
          const d = docSnap.data();
          const callId = d.id || docSnap.id;
          const status = String(d.status || '');
          const createdAtMs = timestampToMs(d.createdAt);
          if (status === 'ended') {
            if (callSessionRef.current?.callId === callId) {
              setCallSession(null);
            }
            continue;
          }
          if (
            status === 'ringing' &&
            d.callerId !== firebaseUser.uid &&
            !declinedCallIdsRef.current.has(callId) &&
            callSessionRef.current?.callId !== callId &&
            now - createdAtMs < 120_000
          ) {
            nextInvite = {
              callId,
              chatId: String(d.chatId || ''),
              title: String(d.title || 'Incoming Call'),
              callerId: String(d.callerId || ''),
              callerName: String(d.callerName || 'Looma Member'),
              callerAvatar: normalizeAssetUrl(String(d.callerAvatar || '')),
              isAudioOnly: Boolean(d.isAudioOnly),
              memberIds: Array.isArray(d.memberIds) ? d.memberIds : [],
              createdAtMs,
            };
          }
        }
        setIncomingCallInvite(nextInvite);
      },
      (err) => {
        if (isTransientFirestoreError(err)) return;
      }
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
      unsubOwnProfile();
      unsubPosts();
      unsubChats();
      unsubNotifs();
      unsubBookmarks();
      unsubStories();
      unsubFollowing();
      unsubFollowers();
      unsubPresence();
      unsubCalls();
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

  const posts: Post[] = firebaseUser ? remotePosts : localPosts;

  const nowMs = Date.now();
  const stories: StoryItem[] = (firebaseUser ? remoteStories : localStories).filter(
    (s) => s.expiresAtMs > nowMs
  );

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

  const loginWithApple = useCallback(async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithApple();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Apple sign-in popup was closed or blocked.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const loginWithEmail = useCallback(async (email: string, pass: string) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithEmail(email, pass);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Invalid email or password.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const signupWithEmail = useCallback(
    async (email: string, pass: string, name: string) => {
      setAuthError(null);
      setAuthLoading(true);
      try {
        await signUpWithEmail(email, pass, name);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Could not create account.';
        setAuthError(msg);
      } finally {
        setAuthLoading(false);
      }
    },
    []
  );

  const resendEmailVerificationLink = useCallback(async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await resendVerificationEmail();
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Unable to send verification email.'
      );
      throw err;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const refreshVerificationStatus = useCallback(async (): Promise<boolean> => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const updated = await reloadCurrentUser();
      if (updated && updated.emailVerified) {
        await updated.getIdToken(true);
        await hydrateVerifiedUser(updated);
        return true;
      }
      setAuthError('Email is still unverified. Open the link we sent to your inbox, then try again.');
      return false;
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Unable to refresh verification status.'
      );
      return false;
    } finally {
      setAuthLoading(false);
    }
  }, [hydrateVerifiedUser]);

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
    setIncomingCallInvite(null);
    setCallSession(null);
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

  const deleteAccount = useCallback(async () => {
    requireAuthorized();
    if (firebaseUser) {
      const uid = firebaseUser.uid;
      const userRef = doc(db, 'users', uid);
      const settingsRef = doc(db, 'users', uid, 'private', 'settings');
      const presenceRef = doc(db, 'presence', uid);
      let savedUserDoc: DocumentData | null = null;
      let savedSettingsDoc: DocumentData | null = null;

      try {
        const [uSnap, sSnap] = await Promise.all([
          getDoc(userRef).catch(() => null),
          getDoc(settingsRef).catch(() => null),
        ]);
        if (uSnap?.exists()) savedUserDoc = uSnap.data();
        if (sSnap?.exists()) savedSettingsDoc = sSnap.data();

        await Promise.all([
          deleteDoc(presenceRef).catch(() => {}),
          deleteDoc(settingsRef).catch(() => {}),
          deleteDoc(userRef).catch(() => {}),
        ]);

        await deleteCurrentAuthUser();
      } catch (err) {
        if (savedUserDoc) {
          await setDoc(userRef, savedUserDoc).catch(() => {});
        }
        if (savedSettingsDoc) {
          await setDoc(settingsRef, savedSettingsDoc).catch(() => {});
        }
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('requires-recent-login')) {
          throw new Error(
            'For security, please sign out and sign back in before deleting your account.'
          );
        }
        throw err instanceof Error
          ? err
          : new Error('Unable to delete Firebase account.');
      }
    }
    try {
      for (const key of Object.values(STORAGE_KEYS)) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore storage cleanup error
    }
    setIsAuthenticated(false);
    setAuthError(null);
    setIncomingCallInvite(null);
    setCallSession(null);
    setLocalPosts([]);
    setLocalStories([]);
    setThreads([]);
    setMessagesByChat({});
    setNotifications([]);
    const resetProfile = createInitialMemberProfile({
      onboardingCompleted: false,
    });
    setProfile(resetProfile);
  }, [firebaseUser, requireAuthorized]);

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
      const mediaTitle = sanitizeMediaTitle(extra?.mediaTitle);

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

  const deletePost = useCallback(
    async (post: Post) => {
      requireAuthorized();
      if (post.authorId !== profile.uid) {
        throw new Error('You can only delete your own posts.');
      }

      const isRemotePost = remotePosts.some((rp) => rp.id === post.id);
      if (firebaseUser && isRemotePost) {
        try {
          await deleteDoc(doc(db, 'posts', post.id));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `posts/${post.id}`);
        }
      } else {
        setLocalPosts((prev) => prev.filter((p) => p.id !== post.id));
      }

      const mediaCandidates = [post.imageUrl, post.videoUrl, post.audioUrl].filter(
        (u): u is string => Boolean(u && extractStorageKeyFromUrl(u))
      );
      if (firebaseUser) {
        await Promise.all(
          mediaCandidates.map((url) =>
            deleteUploadedMedia(url, { ignoreNotFound: true }).catch((err) => {
              console.warn('Media cleanup warning for post deletion:', err);
            })
          )
        );
      }

      setCommentsByPost((prev) => {
        if (!prev[post.id]) return prev;
        const copy = { ...prev };
        delete copy[post.id];
        return copy;
      });
      setLikedPostIds((prev) => prev.filter((id) => id !== post.id));
      setBookmarkedPostIds((prev) => prev.filter((id) => id !== post.id));
    },
    [firebaseUser, profile.uid, remotePosts, requireAuthorized]
  );

  const deleteComment = useCallback(
    async (post: Post, commentId: string) => {
      requireAuthorized();
      const postComments = commentsByPost[post.id] || [];
      const targetComment = postComments.find((c) => c.id === commentId);
      if (
        targetComment &&
        targetComment.authorId !== profile.uid &&
        post.authorId !== profile.uid
      ) {
        throw new Error('You can only delete your own comments or comments on your posts.');
      }

      setCommentsByPost((prev) => ({
        ...prev,
        [post.id]: (prev[post.id] || []).filter((c) => c.id !== commentId),
      }));

      const isRemotePost = remotePosts.some((rp) => rp.id === post.id);
      if (firebaseUser && isRemotePost) {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'posts', post.id, 'comments', commentId));
        if (post.commentsCount >= 1) {
          batch.update(doc(db, 'posts', post.id), {
            commentsCount: increment(-1),
            updatedAt: serverTimestamp(),
          });
        }
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.DELETE,
            `posts/${post.id}/comments/${commentId}`
          );
        }
      } else {
        setLocalPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) }
              : p
          )
        );
      }
    },
    [commentsByPost, firebaseUser, profile.uid, remotePosts, requireAuthorized]
  );

  const subscribeChatMessages = useCallback(
    (chatId: string) => {
      if (!firebaseUser) return () => {};
      const q = query(
        collection(db, 'chats', chatId, 'messages'),
        where('memberIds', 'array-contains', firebaseUser.uid)
      );
      let initialLoad = true;
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
          if (!initialLoad) {
            const activeThread = threadsRef.current.find((t) => t.id === chatId);
            for (const change of snap.docChanges()) {
              if (change.type === 'added') {
                const d = change.doc.data();
                const msgId = d.id || change.doc.id;
                if (activeThread && d.senderId && d.senderId !== firebaseUser.uid) {
                  notifyIncomingChatMessage({
                    thread: activeThread,
                    senderId: d.senderId,
                    senderName: d.senderName || 'Community Member',
                    senderAvatar: d.senderAvatar || '',
                    text: d.text || '',
                    dedupeKey: `msg:${msgId}`,
                  });
                }
              }
            }
          }
          initialLoad = false;
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
    [firebaseUser, notifyIncomingChatMessage]
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
          const threadSnap = await readDocResilient(threadRef);
          const batch = writeBatch(db);
          let syncedMemberIds = memberIds;
          if (!threadSnap || !threadSnap.exists()) {
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
            const remoteData = threadSnap.data();
            if (Array.isArray(remoteData.memberIds) && remoteData.memberIds.length > 0) {
              syncedMemberIds = remoteData.memberIds;
            }
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
            memberIds: syncedMemberIds,
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
    [firebaseUser, profile, requireAuthorized]
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
      broadcastRef.current?.postMessage({
        type: 'chat:thread_created',
        thread: newThread,
      });

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
    [firebaseUser, profile.uid, requireAuthorized, threads]
  );

  const createGroupThread = useCallback(
    async (title: string, participantIds: string[]): Promise<ChatThread> => {
      requireAuthorized();
      const validation = validateGroupChatInput(title, participantIds, profile.uid);
      if (!validation.valid || !validation.title || !validation.memberIds) {
        throw new Error(validation.error || 'Invalid group chat details.');
      }

      const pool = [...communityUsers];
      const participants = validation.memberIds
        .filter((uid) => uid !== profile.uid)
        .map(
          (uid) =>
            pool.find((u) => u.uid === uid) || {
              uid,
              displayName: uid,
              handle: sanitizeHandle(uid),
              bio: '',
              avatarUrl: '',
              location: 'Looma',
              interests: [],
              followersCount: 0,
              followingCount: 0,
              onboardingCompleted: true,
              createdAtMs: Date.now(),
              updatedAtMs: Date.now(),
            }
        );

      const chatId = makeSafeId('group');
      const now = Date.now();
      const newThread = createGroupThreadRecord({
        id: chatId,
        title: validation.title,
        creator: profile,
        participants,
        nowMs: now,
      });

      setThreads((prev) => [newThread, ...prev]);
      broadcastRef.current?.postMessage({
        type: 'chat:thread_created',
        thread: newThread,
      });

      if (firebaseUser) {
        try {
          await setDoc(doc(db, 'chats', chatId), {
            id: chatId,
            title: newThread.title,
            isGroup: true,
            memberIds: newThread.memberIds,
            adminIds: newThread.adminIds || [firebaseUser.uid],
            lastMessageText: newThread.lastMessageText,
            lastMessageSenderId: firebaseUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `chats/${chatId}`);
        }
      }

      await triggerNotification({
        actorId: profile.uid,
        actorName: profile.displayName,
        actorAvatar: profile.avatarUrl,
        type: 'message',
        title: `Group "${newThread.title}" created`,
        body: `${newThread.memberIds.length} participants ready for real-time messaging.`,
        targetPostId: '',
      });

      return newThread;
    },
    [communityUsers, firebaseUser, profile, requireAuthorized, triggerNotification]
  );

  const persistGroupThreadUpdate = useCallback(
    async (updatedThread: ChatThread) => {
      if (!firebaseUser) return;
      const threadRef = doc(db, 'chats', updatedThread.id);
      try {
        const snap = await readDocResilient(threadRef);
        const adminPayload =
          Array.isArray(updatedThread.adminIds) && updatedThread.adminIds.length > 0
            ? { adminIds: updatedThread.adminIds }
            : {};
        if (!snap || !snap.exists()) {
          await setDoc(threadRef, {
            id: updatedThread.id,
            title: updatedThread.title,
            isGroup: true,
            memberIds: updatedThread.memberIds,
            adminIds: updatedThread.adminIds || [firebaseUser.uid],
            lastMessageText: updatedThread.lastMessageText,
            lastMessageSenderId: firebaseUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(threadRef, {
            title: updatedThread.title,
            memberIds: updatedThread.memberIds,
            ...adminPayload,
            lastMessageText: updatedThread.lastMessageText,
            lastMessageSenderId: firebaseUser.uid,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `chats/${updatedThread.id}`
        );
      }
    },
    [firebaseUser]
  );

  const addGroupParticipants = useCallback(
    async (chatId: string, participantIds: string[]): Promise<ChatThread | null> => {
      requireAuthorized();
      const target = threads.find((t) => t.id === chatId);
      if (!target || !target.isGroup) return null;

      const pool = [...communityUsers];
      const usersToAdd = participantIds
        .map((uid) => pool.find((u) => u.uid === uid))
        .filter((u): u is UserProfile => Boolean(u));

      const result = addGroupParticipantsState(
        target,
        usersToAdd,
        profile.displayName
      );
      if (result.error) {
        throw new Error(result.error);
      }
      if (result.addedUsers.length === 0) {
        return target;
      }

      setThreads((prev) =>
        prev
          .map((t) => (t.id === chatId ? result.thread : t))
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      );
      broadcastRef.current?.postMessage({
        type: 'chat:thread_updated',
        thread: result.thread,
      });

      await persistGroupThreadUpdate(result.thread);

      await triggerNotification({
        actorId: profile.uid,
        actorName: profile.displayName,
        actorAvatar: profile.avatarUrl,
        type: 'message',
        title: `${result.thread.title}`,
        body: result.thread.lastMessageText,
        targetPostId: '',
      });

      return result.thread;
    },
    [
      communityUsers,
      persistGroupThreadUpdate,
      profile,
      requireAuthorized,
      threads,
      triggerNotification,
    ]
  );

  const removeGroupParticipant = useCallback(
    async (chatId: string, targetUid: string): Promise<ChatThread | null> => {
      requireAuthorized();
      const target = threads.find((t) => t.id === chatId);
      if (!target || !target.isGroup) return null;

      const pool = [profile, ...communityUsers];
      const member = pool.find((u) => u.uid === targetUid);
      const targetName =
        targetUid === profile.uid
          ? profile.displayName
          : member?.displayName || targetUid;

      const result = removeGroupParticipantState(
        target,
        targetUid,
        targetName,
        profile.uid
      );
      if (result.error) {
        throw new Error(result.error);
      }

      // Persist before removing self from Firestore memberIds so rules allow existing member update
      await persistGroupThreadUpdate(result.thread);

      if (result.removedSelf) {
        leftChatIdsRef.current.add(chatId);
        setThreads((prev) => prev.filter((t) => t.id !== chatId));
      } else {
        setThreads((prev) =>
          prev
            .map((t) => (t.id === chatId ? result.thread : t))
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        );
      }

      broadcastRef.current?.postMessage({
        type: 'chat:thread_updated',
        thread: result.thread,
      });

      await triggerNotification({
        actorId: profile.uid,
        actorName: profile.displayName,
        actorAvatar: profile.avatarUrl,
        type: 'message',
        title: `${result.thread.title}`,
        body: result.thread.lastMessageText,
        targetPostId: '',
      });

      return result.thread;
    },
    [
      communityUsers,
      persistGroupThreadUpdate,
      profile,
      requireAuthorized,
      threads,
      triggerNotification,
    ]
  );

  const renameGroupThread = useCallback(
    async (chatId: string, nextTitle: string): Promise<ChatThread | null> => {
      requireAuthorized();
      const target = threads.find((t) => t.id === chatId);
      const cleanTitle = nextTitle.trim().slice(0, 80);
      if (!target || !target.isGroup || !cleanTitle) return null;

      const updated: ChatThread = {
        ...target,
        title: cleanTitle,
        lastMessageText: `${profile.displayName} renamed the group to "${cleanTitle}"`,
        lastMessageSenderId: profile.uid,
        updatedAtMs: Date.now(),
      };

      setThreads((prev) =>
        prev
          .map((t) => (t.id === chatId ? updated : t))
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      );
      broadcastRef.current?.postMessage({
        type: 'chat:thread_updated',
        thread: updated,
      });
      await persistGroupThreadUpdate(updated);
      return updated;
    },
    [persistGroupThreadUpdate, profile, requireAuthorized, threads]
  );

  const promoteGroupAdmin = useCallback(
    async (chatId: string, targetUid: string): Promise<ChatThread | null> => {
      requireAuthorized();
      const target = threads.find((t) => t.id === chatId);
      if (!target || !target.isGroup) return null;

      const pool = [profile, ...communityUsers];
      const member = pool.find((u) => u.uid === targetUid);
      const targetName = member?.displayName || targetUid;
      const result = promoteGroupAdminState(
        target,
        targetUid,
        targetName,
        profile.uid
      );
      if (result.error) {
        throw new Error(result.error);
      }

      setThreads((prev) =>
        prev
          .map((t) => (t.id === chatId ? result.thread : t))
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      );
      broadcastRef.current?.postMessage({
        type: 'chat:thread_updated',
        thread: result.thread,
      });
      await persistGroupThreadUpdate(result.thread);
      return result.thread;
    },
    [communityUsers, persistGroupThreadUpdate, profile, requireAuthorized, threads]
  );

  const toggleMuteChat = useCallback((chatId: string) => {
    setMutedChatIds((prev) =>
      prev.includes(chatId)
        ? prev.filter((id) => id !== chatId)
        : [...prev, chatId]
    );
  }, []);

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
        syncOp.catch((err) => {
          if (isTransientFirestoreError(err)) return;
          handleFirestoreError(
            err,
            OperationType.WRITE,
            `users/${firebaseUser.uid}/following/${targetUid}`
          );
        });
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
        {},
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
          const snap = await readDocResilient(doc(db, 'users', targetUid));
          if (snap && snap.exists()) {
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
          if (!isTransientFirestoreError(err)) {
            handleFirestoreError(err, OperationType.GET, path);
          }
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

  const deleteStory = useCallback(
    async (story: StoryItem) => {
      requireAuthorized();
      if (story.authorId !== profile.uid) {
        throw new Error('You can only delete your own stories.');
      }
      if (firebaseUser) {
        try {
          await deleteDoc(doc(db, 'stories', story.id));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `stories/${story.id}`);
        }
        if (story.imageUrl && extractStorageKeyFromUrl(story.imageUrl)) {
          await deleteUploadedMedia(story.imageUrl, { ignoreNotFound: true }).catch(
            (err) => {
              console.warn('Media cleanup warning for story deletion:', err);
            }
          );
        }
      } else {
        setLocalStories((prev) => prev.filter((s) => s.id !== story.id));
      }
    },
    [firebaseUser, profile.uid, requireAuthorized]
  );

  const [callSession, setCallSession] = useState<CallSession | null>(null);

  useEffect(() => {
    callSessionRef.current = callSession;
  }, [callSession]);

  const startCall = useCallback(
    async (thread: ChatThread, isAudioOnly: boolean) => {
      requireAuthorized();
      const callId = makeSafeId('call');
      const uniqueMembers = Array.from(
        new Set([profile.uid, ...thread.memberIds].filter(Boolean))
      ).slice(0, 10);

      const participants: CallParticipant[] = uniqueMembers.map((uid) => {
        const u = communityUsersRef.current.find((member) => member.uid === uid);
        return {
          uid,
          name:
            uid === profile.uid
              ? profile.displayName
              : u?.displayName || 'Participant',
          avatar: uid === profile.uid ? profile.avatarUrl : u?.avatarUrl || '',
          isMuted: false,
          isVideoOff: isAudioOnly,
          connectionState: uid === profile.uid ? 'joined' : 'invited',
        };
      });

      if (firebaseUser) {
        await setDoc(doc(db, 'calls', callId), {
          id: callId,
          chatId: thread.id,
          title: thread.title,
          callerId: firebaseUser.uid,
          callerName: profile.displayName,
          callerAvatar: profile.avatarUrl,
          isAudioOnly,
          status: 'ringing',
          memberIds: uniqueMembers,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setCallSession({
        callId,
        chatId: thread.id,
        title: thread.title,
        callerId: profile.uid,
        callerName: profile.displayName,
        callerAvatar: profile.avatarUrl,
        isAudioOnly,
        active: true,
        status: 'ringing',
        isMuted: false,
        isVideoOff: isAudioOnly,
        isScreenSharing: false,
        participants,
        startedAtMs: Date.now(),
      });
    },
    [firebaseUser, profile.avatarUrl, profile.displayName, profile.uid, requireAuthorized]
  );

  const startInstantCall = useCallback(
    async (title: string = 'Studio Live Room', isAudioOnly: boolean = false) => {
      requireAuthorized();
      const callId = makeSafeId('call');
      const roomChatId = makeSafeId('room');
      const memberIds = [profile.uid];

      if (firebaseUser) {
        await setDoc(doc(db, 'calls', callId), {
          id: callId,
          chatId: roomChatId,
          title: title.trim().slice(0, 80) || 'Studio Live Room',
          callerId: firebaseUser.uid,
          callerName: profile.displayName,
          callerAvatar: profile.avatarUrl,
          isAudioOnly,
          status: 'ringing',
          memberIds,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setCallSession({
        callId,
        chatId: roomChatId,
        title,
        callerId: profile.uid,
        callerName: profile.displayName,
        callerAvatar: profile.avatarUrl,
        isAudioOnly,
        active: true,
        status: 'ringing',
        isMuted: false,
        isVideoOff: isAudioOnly,
        isScreenSharing: false,
        participants: [
          {
            uid: profile.uid,
            name: profile.displayName,
            avatar: profile.avatarUrl || '',
            isMuted: false,
            isVideoOff: isAudioOnly,
            connectionState: 'joined',
          },
        ],
        startedAtMs: Date.now(),
      });
    },
    [firebaseUser, profile.avatarUrl, profile.displayName, profile.uid, requireAuthorized]
  );

  const startCallWithUser = useCallback(
    async (creator: UserProfile, isAudioOnly: boolean) => {
      const thread = await startDirectThread(creator);
      await startCall(thread, isAudioOnly);
    },
    [startCall, startDirectThread]
  );

  const acceptIncomingCall = useCallback(
    async (invite: IncomingCallInvite) => {
      requireAuthorized();
      setIncomingCallInvite(null);
      const participants: CallParticipant[] = invite.memberIds.map((uid) => {
        const u = communityUsersRef.current.find((member) => member.uid === uid);
        return {
          uid,
          name:
            uid === profile.uid
              ? profile.displayName
              : uid === invite.callerId
                ? invite.callerName
                : u?.displayName || 'Participant',
          avatar:
            uid === profile.uid
              ? profile.avatarUrl
              : uid === invite.callerId
                ? invite.callerAvatar
                : u?.avatarUrl || '',
          isMuted: false,
          isVideoOff: invite.isAudioOnly,
          connectionState: uid === profile.uid || uid === invite.callerId ? 'joined' : 'invited',
        };
      });

      if (firebaseUser) {
        await updateDoc(doc(db, 'calls', invite.callId), {
          status: 'active',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

      setCallSession({
        callId: invite.callId,
        chatId: invite.chatId,
        title: invite.title,
        callerId: invite.callerId,
        callerName: invite.callerName,
        callerAvatar: invite.callerAvatar,
        isAudioOnly: invite.isAudioOnly,
        active: true,
        status: 'active',
        isMuted: false,
        isVideoOff: invite.isAudioOnly,
        isScreenSharing: false,
        participants,
        startedAtMs: Date.now(),
      });
    },
    [firebaseUser, profile.avatarUrl, profile.displayName, profile.uid, requireAuthorized]
  );

  const declineIncomingCall = useCallback(
    async (invite: IncomingCallInvite) => {
      declinedCallIdsRef.current.add(invite.callId);
      setIncomingCallInvite(null);
      if (firebaseUser) {
        await setDoc(doc(db, 'calls', invite.callId, 'peers', firebaseUser.uid), {
          callId: invite.callId,
          uid: firebaseUser.uid,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          cfSessionId: '',
          audioTrackName: '',
          videoTrackName: '',
          isMuted: true,
          isVideoOff: true,
          isScreenSharing: false,
          state: 'declined',
          memberIds: invite.memberIds,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
        if (invite.memberIds.length <= 2) {
          await updateDoc(doc(db, 'calls', invite.callId), {
            status: 'ended',
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      }
    },
    [firebaseUser, profile.avatarUrl, profile.displayName]
  );

  const publishCallPeerSession = useCallback(
    async (
      callId: string,
      payload: {
        cfSessionId: string;
        audioTrackName?: string;
        videoTrackName?: string;
        isMuted: boolean;
        isVideoOff: boolean;
        isScreenSharing: boolean;
        state: 'joined' | 'declined' | 'left';
      }
    ) => {
      if (!firebaseUser || !callId) return;
      const session = callSessionRef.current;
      const memberIds =
        session?.participants.map((p) => p.uid).filter(Boolean) || [firebaseUser.uid];
      const safeMemberIds = memberIds.includes(firebaseUser.uid)
        ? memberIds
        : [firebaseUser.uid, ...memberIds];

      await setDoc(doc(db, 'calls', callId, 'peers', firebaseUser.uid), {
        callId,
        uid: firebaseUser.uid,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        cfSessionId: payload.cfSessionId.slice(0, 128),
        audioTrackName: (payload.audioTrackName || '').slice(0, 64),
        videoTrackName: (payload.videoTrackName || '').slice(0, 64),
        isMuted: payload.isMuted,
        isVideoOff: payload.isVideoOff,
        isScreenSharing: payload.isScreenSharing,
        state: payload.state,
        memberIds: safeMemberIds.slice(0, 10),
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      if (payload.state === 'joined' && session?.status === 'ringing') {
        await updateDoc(doc(db, 'calls', callId), {
          status: 'active',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    [firebaseUser, profile.avatarUrl, profile.displayName]
  );

  const subscribeCallPeers = useCallback(
    (callId: string, onPeers: (peers: CallParticipant[]) => void) => {
      if (!firebaseUser || !callId) return () => {};
      const peersQuery = query(
        collection(db, 'calls', callId, 'peers'),
        where('memberIds', 'array-contains', firebaseUser.uid)
      );
      return onSnapshot(
        peersQuery,
        (snapshot) => {
          const peers: CallParticipant[] = snapshot.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              uid: String(d.uid || docSnap.id),
              name: String(d.displayName || 'Participant'),
              avatar: normalizeAssetUrl(String(d.avatarUrl || '')),
              isMuted: Boolean(d.isMuted),
              isVideoOff: Boolean(d.isVideoOff),
              isScreenSharing: Boolean(d.isScreenSharing),
              connectionState:
                d.state === 'declined' || d.state === 'left' ? d.state : 'joined',
              cfSessionId: String(d.cfSessionId || ''),
              audioTrackName: String(d.audioTrackName || ''),
              videoTrackName: String(d.videoTrackName || ''),
            };
          });
          onPeers(peers);
          setCallSession((prev) => {
            if (!prev || prev.callId !== callId) return prev;
            const byUid = new Map(prev.participants.map((p) => [p.uid, p]));
            for (const p of peers) {
              const existing = byUid.get(p.uid);
              byUid.set(p.uid, existing ? { ...existing, ...p } : p);
            }
            return {
              ...prev,
              participants: Array.from(byUid.values()),
            };
          });
        },
        () => {}
      );
    },
    [firebaseUser]
  );

  const endCall = useCallback(() => {
    const active = callSessionRef.current;
    setCallSession(null);
    if (firebaseUser && active?.callId) {
      const memberIds = active.participants.map((p) => p.uid);
      const safeMembers = memberIds.includes(firebaseUser.uid)
        ? memberIds
        : [firebaseUser.uid, ...memberIds];
      setDoc(doc(db, 'calls', active.callId, 'peers', firebaseUser.uid), {
        callId: active.callId,
        uid: firebaseUser.uid,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        cfSessionId: '',
        audioTrackName: '',
        videoTrackName: '',
        isMuted: true,
        isVideoOff: true,
        isScreenSharing: false,
        state: 'left',
        memberIds: safeMembers.slice(0, 10),
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      const otherJoined = active.participants.some(
        (p) => p.uid !== firebaseUser.uid && p.connectionState === 'joined'
      );
      if (active.callerId === firebaseUser.uid || !otherJoined) {
        updateDoc(doc(db, 'calls', active.callId), {
          status: 'ended',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    }
  }, [firebaseUser, profile.avatarUrl, profile.displayName]);

  const toggleCallMute = useCallback(() => {
    setCallSession((prev) => (prev ? { ...prev, isMuted: !prev.isMuted } : null));
  }, []);

  const toggleCallVideo = useCallback(() => {
    setCallSession((prev) => (prev ? { ...prev, isVideoOff: !prev.isVideoOff } : null));
  }, []);

  const toggleCallScreenShare = useCallback(() => {
    setCallSession((prev) => (prev ? { ...prev, isScreenSharing: !prev.isScreenSharing } : null));
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
    loginWithApple,
    loginWithEmail,
    signupWithEmail,
    resendEmailVerificationLink,
    refreshVerificationStatus,
    logout,
    deleteAccount,
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
    deleteStory,
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
    deletePost,
    toggleLike,
    toggleBookmark,
    addComment,
    deleteComment,
    threads,
    messagesByChat,
    mutedChatIds,
    subscribeChatMessages,
    sendChatMessage,
    startDirectThread,
    createGroupThread,
    addGroupParticipants,
    removeGroupParticipant,
    renameGroupThread,
    promoteGroupAdmin,
    toggleMuteChat,
    notifications,
    activeToast,
    dismissToast: () => setActiveToast(null),
    triggerNotification,
    markNotificationRead,
    markAllNotificationsRead,
    callSession,
    incomingCallInvite,
    startCall,
    startCallWithUser,
    startInstantCall,
    acceptIncomingCall,
    declineIncomingCall,
    publishCallPeerSession,
    subscribeCallPeers,
    endCall,
    toggleCallMute,
    toggleCallVideo,
    toggleCallScreenShare,
  };
}
