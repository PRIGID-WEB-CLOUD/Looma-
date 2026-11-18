import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { AdminView } from './AdminView';
import { useAdminRole } from './useAdminRole';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithEmail,
  signInWithGoogle,
  signOutAccount,
  testFirestoreConnection,
  updateAuthUserProfile,
} from '../src/services/firebase';
import { uploadMediaToCloudflareR2 } from '../src/services/storage';
import { readStoredThemePreference } from '../src/app/initialization/initialization-config';
import { ADMIN_SYNC_STORAGE_KEYS } from '../src/hooks/useSocialStore';
import {
  enrichCommentWithVerifiedAuthor,
  enrichPostWithVerifiedAuthor,
  enrichStoryGroupsWithVerifiedAuthors,
  enrichVerificationRequestWithUser,
  extractHashtags,
  extractMentions,
  mergeSavedHashtags,
  normalizeAssetUrl,
  normalizeHashtag,
  POPULAR_HASHTAGS,
  sanitizeMediaTitle,
} from '../src/utils/socialLogic';
import type { LegalDocId } from '../src/utils/legalLogic';
import type {
  ChatThread,
  Post,
  PostCategory,
  PostCategoryRecord,
  StoryGroup,
  StoryItem,
  ThemeMode,
  UserProfile,
} from '../src/types/social';
import {
  ADMIN_ROLE_PERMISSIONS,
  DEFAULT_COMMUNITY_GUIDELINES,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_PRIVACY_CONFIG,
  DEFAULT_TERMS_CONFIG,
  appendAuditEntry,
  assignAdminRole,
  countExpiredStories,
  isAllowlistedAdminEmail,
  removeMemberFromChatIds,
  reviewAppealDecision,
  reviewVerificationRequestDecision,
  revokeAdminRole,
  setMemberModerationStatus,
  sortVerificationRequests,
  toggleHiddenPostId,
  updateAccessInquiryStatus,
  updateReportResolution,
  validateAnnouncementInput,
  validateCategoryInput,
  validateDirectWarningInput,
  validateGroupChatModerationTitle,
  validateLegalConfigInput,
  validateProfileSanitizeInput,
  type AdminAccessInquiry,
  type AdminAuditEntry,
  type AdminCallRoomSummary,
  type AdminCommentItem,
  type AdminFeatureFlags,
  type AdminModerationState,
  type AdminRoleEntry,
  type AdminRoleLevel,
  type AnnouncementAudience,
  type AnnouncementSeverity,
  type BackgroundJobItem,
  type CommunityGuidelinesConfig,
  type ContentReport,
  type LegalPolicyConfig,
  type MemberAccountStatus,
  type MemberModerationRecord,
  type ModerationAppeal,
  type PlatformAnnouncement,
  type R2MediaObjectItem,
  type ReportStatus,
  type SystemHealthProbe,
  type VerificationRequest,
} from './adminLogic';

function sanitizeAdminHandle(raw: string | undefined): string {
  const cleaned = (raw || 'admin').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (cleaned.length >= 3) return cleaned.slice(0, 32);
  return `${cleaned}_op`.slice(0, 32).padEnd(3, '_');
}

function mirrorAdminStorage(key: string, value: unknown) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Ignore storage quota errors
  }
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AdminErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Unexpected administrator console error.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-2xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h1 className="font-display text-xl font-bold text-red-700 dark:text-red-400">
              Administrator Session Interrupted
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 break-words font-mono">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[40px] px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              Reload Admin Console
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function timestampToMs(val: unknown, fallback: number = Date.now()): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (
    val &&
    typeof val === 'object' &&
    'toMillis' in val &&
    typeof (val as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (val as { toMillis: () => number }).toMillis();
  }
  return fallback;
}

function createEmptyAdminProfile(): UserProfile {
  return {
    uid: '',
    displayName: 'Admin Operator',
    handle: 'admin',
    avatarUrl: '',
    bio: '',
    location: '',
    interests: [],
    followersCount: 0,
    followingCount: 0,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    onboardingCompleted: true,
  };
}

export interface AdminAppProps {
  embedded?: boolean;
}

function AdminAppInner(_props: AdminAppProps) {
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredThemePreference());
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean | null>(null);
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({});

  const [currentProfile, setCurrentProfile] = useState<UserProfile>(createEmptyAdminProfile);
  const [communityUsers, setCommunityUsers] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [comments, setComments] = useState<AdminCommentItem[]>([]);
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [calls, setCalls] = useState<AdminCallRoomSummary[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [moderation, setModeration] = useState<AdminModerationState>({
    hiddenPostIds: [],
    restrictedUids: [],
  });
  const [memberModerationRecords, setMemberModerationRecords] = useState<
    Record<string, MemberModerationRecord>
  >({});
  const [adminRoles, setAdminRoles] = useState<AdminRoleEntry[]>([]);
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [appeals, setAppeals] = useState<ModerationAppeal[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [guidelines, setGuidelines] = useState<CommunityGuidelinesConfig>(
    DEFAULT_COMMUNITY_GUIDELINES
  );
  const [termsConfig, setTermsConfig] = useState<LegalPolicyConfig>(DEFAULT_TERMS_CONFIG);
  const [privacyConfig, setPrivacyConfig] = useState<LegalPolicyConfig>(DEFAULT_PRIVACY_CONFIG);
  const [featureFlags, setFeatureFlags] = useState<AdminFeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [auditLogs, setAuditLogs] = useState<AdminAuditEntry[]>([]);
  const [inquiries, setInquiries] = useState<AdminAccessInquiry[]>([]);
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([]);
  const [savedHashtags, setSavedHashtags] = useState<string[]>(POPULAR_HASHTAGS);
  const [dynamicHashtags, setDynamicHashtags] = useState<string[]>([]);
  const [categories, setCategories] = useState<PostCategoryRecord[]>([]);
  const [r2Objects, setR2Objects] = useState<R2MediaObjectItem[]>([]);
  const [r2TotalBytes, setR2TotalBytes] = useState(0);
  const [r2Loading, setR2Loading] = useState(false);
  const [r2Error, setR2Error] = useState<string | null>(null);
  const [autoMaintenanceEnabled, setAutoMaintenanceEnabled] = useState(false);

  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthProbes, setHealthProbes] = useState<SystemHealthProbe[]>(() => [
    {
      id: 'firestore',
      service: 'Cloud Firestore Database',
      status: 'degraded',
      detail: 'Pending probe',
      checkedAtMs: Date.now(),
      latencyMs: null,
    },
    {
      id: 'r2',
      service: 'Cloudflare R2 Media Pipeline',
      status: 'degraded',
      detail: 'Awaiting endpoint check',
      checkedAtMs: Date.now(),
      latencyMs: null,
    },
    {
      id: 'calls',
      service: 'Cloudflare Calls WebRTC SFU',
      status: 'degraded',
      detail: 'Awaiting endpoint check',
      checkedAtMs: Date.now(),
      latencyMs: null,
    },
  ]);

  const [jobs, setJobs] = useState<BackgroundJobItem[]>(() => [
    {
      id: 'job_expired_stories',
      name: 'Expired Story TTL Purge',
      description: 'Identifies and removes 24-hour story frames past their expiration timestamp.',
      cadence: 'Hourly',
      lastRunAtMs: null,
      lastStatus: 'idle',
      lastSummary: '0 expired stories detected',
    },
    {
      id: 'job_guidelines_sync',
      name: 'Governance & Flags Consistency Verification',
      description: 'Validates active announcement status and community guidelines revision schema.',
      cadence: 'Every 6 hours',
      lastRunAtMs: null,
      lastStatus: 'idle',
      lastSummary: 'Ready for verification run',
    },
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('looma_theme_v1', JSON.stringify(theme));
    } catch {
      // Ignore
    }
  }, [theme]);

  // Mirror admin governance state to localStorage for local/autostart tab sync
  useEffect(() => {
    mirrorAdminStorage(ADMIN_SYNC_STORAGE_KEYS.FEATURE_FLAGS, featureFlags);
  }, [featureFlags]);

  useEffect(() => {
    mirrorAdminStorage(ADMIN_SYNC_STORAGE_KEYS.HIDDEN_POSTS, moderation.hiddenPostIds);
  }, [moderation.hiddenPostIds]);

  useEffect(() => {
    mirrorAdminStorage(ADMIN_SYNC_STORAGE_KEYS.GUIDELINES, guidelines);
  }, [guidelines]);

  useEffect(() => {
    mirrorAdminStorage(ADMIN_SYNC_STORAGE_KEYS.TERMS, termsConfig);
  }, [termsConfig]);

  useEffect(() => {
    mirrorAdminStorage(ADMIN_SYNC_STORAGE_KEYS.PRIVACY, privacyConfig);
  }, [privacyConfig]);

  useEffect(() => {
    mirrorAdminStorage(ADMIN_SYNC_STORAGE_KEYS.ANNOUNCEMENTS, announcements);
  }, [announcements]);

  useEffect(() => {
    mirrorAdminStorage(ADMIN_SYNC_STORAGE_KEYS.USER_MODERATION, memberModerationRecords);
  }, [memberModerationRecords]);

  useEffect(() => {
    mirrorAdminStorage(ADMIN_SYNC_STORAGE_KEYS.REPORTS, reports);
  }, [reports]);

  useEffect(() => {
    mirrorAdminStorage(ADMIN_SYNC_STORAGE_KEYS.APPEALS, appeals);
  }, [appeals]);

  const runHealthProbes = useCallback(async () => {
    setCheckingHealth(true);
    const probes: SystemHealthProbe[] = [];

    // 1. Firestore Server Probe
    const start = performance.now();
    const ok = await testFirestoreConnection();
    const latency = Math.round(performance.now() - start);
    setFirestoreConnected(ok);
    probes.push({
      id: 'firestore',
      service: 'Cloud Firestore Database',
      status: ok ? 'healthy' : 'offline',
      detail: ok
        ? 'Server-side document probe responded cleanly'
        : 'Unable to reach Firestore backend',
      checkedAtMs: Date.now(),
      latencyMs: latency,
    });

    // 2. Worker R2 Storage Status Probe
    try {
      const sStart = performance.now();
      const res = await fetch('/api/storage/status');
      const sLat = Math.round(performance.now() - sStart);
      if (res.ok) {
        const data = (await res.json()) as { configured?: boolean; mode?: string };
        probes.push({
          id: 'r2',
          service: 'Cloudflare R2 Media Pipeline',
          status: data.configured ? 'healthy' : 'degraded',
          detail: data.configured
            ? `Active mode: ${data.mode || 'r2-binding'}`
            : 'R2 credentials not configured in local dev runtime',
          checkedAtMs: Date.now(),
          latencyMs: sLat,
        });
      } else {
        probes.push({
          id: 'r2',
          service: 'Cloudflare R2 Media Pipeline',
          status: 'degraded',
          detail: `Storage status HTTP ${res.status}`,
          checkedAtMs: Date.now(),
          latencyMs: sLat,
        });
      }
    } catch {
      probes.push({
        id: 'r2',
        service: 'Cloudflare R2 Media Pipeline',
        status: 'offline',
        detail: 'Storage status endpoint unreachable',
        checkedAtMs: Date.now(),
        latencyMs: null,
      });
    }

    // 3. Worker Calls SFU Status Probe
    try {
      const cStart = performance.now();
      const res = await fetch('/api/calls/status');
      const cLat = Math.round(performance.now() - cStart);
      if (res.ok) {
        const data = (await res.json()) as {
          configured?: boolean;
          hasTurnConfigured?: boolean;
        };
        probes.push({
          id: 'calls',
          service: 'Cloudflare Calls WebRTC SFU',
          status: data.configured ? 'healthy' : 'degraded',
          detail: data.configured
            ? data.hasTurnConfigured
              ? 'SFU + TURN relay active'
              : 'SFU configured without TURN fallback'
            : 'Calls credentials not configured in local dev runtime',
          checkedAtMs: Date.now(),
          latencyMs: cLat,
        });
      } else {
        probes.push({
          id: 'calls',
          service: 'Cloudflare Calls WebRTC SFU',
          status: 'degraded',
          detail: `Calls status HTTP ${res.status}`,
          checkedAtMs: Date.now(),
          latencyMs: cLat,
        });
      }
    } catch {
      probes.push({
        id: 'calls',
        service: 'Cloudflare Calls WebRTC SFU',
        status: 'offline',
        detail: 'Calls status endpoint unreachable',
        checkedAtMs: Date.now(),
        latencyMs: null,
      });
    }

    setHealthProbes(probes);
    setCheckingHealth(false);
  }, []);

  // Firebase Auth subscription (always enforced)
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      setAuthReady(true);
      if (!u) {
        setCurrentProfile(createEmptyAdminProfile());
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) {
          const profileData = userDoc.data() as UserProfile;
          setCurrentProfile({
            ...profileData,
            uid: u.uid,
            avatarUrl: normalizeAssetUrl(String(profileData.avatarUrl || '')),
            isVerified: true,
          });
          if (!profileData.isVerified) {
            updateDoc(doc(db, 'users', u.uid), {
              isVerified: true,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
        } else {
          const safeHandle = sanitizeAdminHandle(u.email?.split('@')[0] || 'admin');
          const safeDisplayName = (u.displayName || u.email?.split('@')[0] || 'Master Admin')
            .trim()
            .slice(0, 60);
          const newProfile: UserProfile = {
            uid: u.uid,
            displayName: safeDisplayName,
            handle: safeHandle,
            avatarUrl: u.photoURL || '',
            bio: 'Master Admin Operator & Workspace Publisher',
            location: 'Looma HQ',
            interests: ['Architecture', 'Design', 'Governance'],
            followersCount: 0,
            followingCount: 0,
            isVerified: true,
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
            onboardingCompleted: true,
          };
          setCurrentProfile(newProfile);
          setDoc(doc(db, 'users', u.uid), {
            uid: u.uid,
            displayName: safeDisplayName,
            handle: safeHandle,
            bio: newProfile.bio,
            avatarUrl: newProfile.avatarUrl,
            location: newProfile.location,
            interests: newProfile.interests,
            followersCount: 0,
            followingCount: 0,
            onboardingCompleted: true,
            isVerified: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      } catch {
        setCurrentProfile({
          uid: u.uid,
          displayName: u.displayName || u.email?.split('@')[0] || 'Master Admin',
          handle: u.email?.split('@')[0] || 'admin',
          avatarUrl: u.photoURL || '',
          bio: 'Master Admin Operator & Workspace Publisher',
          location: 'Looma HQ',
          interests: ['Architecture', 'Design', 'Governance'],
          followersCount: 1,
          followingCount: 1,
          isVerified: true,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          onboardingCompleted: true,
        });
      }
    });

    return () => unsubAuth();
  }, []);

  const adminAuth = useAdminRole({
    isAuthorized: Boolean(firebaseUser),
    firebaseUser,
  });

  const reportSyncError = useCallback((err: unknown, path: string) => {
    const message = err instanceof Error ? err.message : String(err);
    try {
      handleFirestoreError(err, OperationType.LIST, path);
    } catch {
      // Structured Firestore error already logged by handleFirestoreError; surface in UI instead of crashing listener.
    }
    setSyncErrors((prev) => ({ ...prev, [path]: message }));
  }, []);

  const clearSyncError = useCallback((path: string) => {
    setSyncErrors((prev) => {
      if (!(path in prev)) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  // Guarded Firestore real-time subscriptions (only after Admin RBAC passes)
  useEffect(() => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      setCommunityUsers([]);
      setPosts([]);
      setStoryGroups([]);
      setComments([]);
      setChats([]);
      setCalls([]);
      setDynamicHashtags([]);
      setOnlineUserIds([]);
      setModeration({ hiddenPostIds: [], restrictedUids: [] });
      setMemberModerationRecords({});
      setAdminRoles([]);
      setReports([]);
      setAppeals([]);
      setAnnouncements([]);
      setGuidelines(DEFAULT_COMMUNITY_GUIDELINES);
      setTermsConfig(DEFAULT_TERMS_CONFIG);
      setPrivacyConfig(DEFAULT_PRIVACY_CONFIG);
      setFeatureFlags(DEFAULT_FEATURE_FLAGS);
      setAuditLogs([]);
      setInquiries([]);
      setR2Objects([]);
      setR2TotalBytes(0);
      setR2Error(null);
      setSyncErrors({});
      return;
    }

    void runHealthProbes();

    // Ensure allowlisted bootstrap operator has a persisted /admins/{uid} document
    if (adminAuth.reason === 'ok-allowlist' && !adminAuth.checkingAdminDoc && firebaseUser.email) {
      const adminRef = doc(db, 'admins', firebaseUser.uid);
      void getDoc(adminRef)
        .then((snap) => {
          if (snap.exists()) return;
          return setDoc(adminRef, {
            uid: firebaseUser.uid,
            email: firebaseUser.email!.trim().toLowerCase(),
            displayName:
              (firebaseUser.displayName || firebaseUser.email!.split('@')[0] || 'Admin Operator').slice(0, 60),
            role: 'super_admin',
            permissions: ADMIN_ROLE_PERMISSIONS.super_admin,
            grantedBy: firebaseUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        })
        .catch(() => {
          // Non-fatal; allowlist still grants access
        });
    }

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        collection(db, 'users'),
        (snap) => {
          clearSyncError('users');
          const list: UserProfile[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            list.push({
              ...(raw as unknown as UserProfile),
              uid: d.id,
              avatarUrl: normalizeAssetUrl(String(raw.avatarUrl || '')),
              isVerified: Boolean(raw.isVerified) || d.id === firebaseUser.uid,
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
              updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt),
            });
          });
          setCommunityUsers(list);
          const ownSynced = list.find((u) => u.uid === firebaseUser.uid);
          if (ownSynced) {
            setCurrentProfile(ownSynced);
          }
        },
        (err) => reportSyncError(err, 'users')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'posts'),
        (snap) => {
          clearSyncError('posts');
          const list: Post[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            list.push({
              ...(raw as unknown as Omit<Post, 'id'>),
              id: d.id,
              authorVerified:
                Boolean(raw.authorVerified) || raw.authorId === firebaseUser.uid,
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
              updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt),
            });
          });
          setPosts(list);
        },
        (err) => reportSyncError(err, 'posts')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'hashtags'),
        (snap) => {
          clearSyncError('hashtags');
          const dynamicTags: string[] = [];
          snap.forEach((d) => {
            const raw = d.data() as { tag?: string };
            if (typeof raw.tag === 'string' && raw.tag.trim()) {
              dynamicTags.push(raw.tag.trim());
            }
          });
          setDynamicHashtags(dynamicTags);
          setSavedHashtags(mergeSavedHashtags(POPULAR_HASHTAGS, dynamicTags));
        },
        (err) => reportSyncError(err, 'hashtags')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'categories'),
        (snap) => {
          clearSyncError('categories');
          const list: PostCategoryRecord[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            list.push({
              id: d.id,
              name: typeof raw.name === 'string' ? raw.name : d.id,
              description: typeof raw.description === 'string' ? raw.description : '',
              createdBy: typeof raw.createdBy === 'string' ? raw.createdBy : '',
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
              updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt),
            });
          });
          setCategories(list);
        },
        (err) => reportSyncError(err, 'categories')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collectionGroup(db, 'comments'), limit(120)),
        (snap) => {
          clearSyncError('comments');
          const list: AdminCommentItem[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            const parentPostId = d.ref.parent.parent?.id || '';
            list.push({
              id: d.id,
              postId:
                typeof raw.postId === 'string' && raw.postId ? raw.postId : parentPostId,
              authorId: typeof raw.authorId === 'string' ? raw.authorId : '',
              authorName: typeof raw.authorName === 'string' ? raw.authorName : 'Member',
              authorHandle: typeof raw.authorHandle === 'string' ? raw.authorHandle : 'member',
              authorAvatar: typeof raw.authorAvatar === 'string' ? raw.authorAvatar : '',
              text: typeof raw.text === 'string' ? raw.text : '',
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
            });
          });
          setComments(list);
        },
        (err) => reportSyncError(err, 'comments')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'chats'), limit(60)),
        (snap) => {
          clearSyncError('chats');
          const list: ChatThread[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            const memberIds = Array.isArray(raw.memberIds)
              ? raw.memberIds.filter((v): v is string => typeof v === 'string')
              : [];
            const adminIds = Array.isArray(raw.adminIds)
              ? raw.adminIds.filter((v): v is string => typeof v === 'string')
              : undefined;
            list.push({
              id: d.id,
              title: typeof raw.title === 'string' && raw.title ? raw.title : 'Conversation',
              isGroup: Boolean(raw.isGroup),
              memberIds,
              adminIds,
              partnerAvatar: '',
              partnerHandle: '',
              lastMessageText: typeof raw.lastMessageText === 'string' ? raw.lastMessageText : '',
              lastMessageSenderId:
                typeof raw.lastMessageSenderId === 'string' ? raw.lastMessageSenderId : '',
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
              updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt),
            });
          });
          setChats(list);
        },
        (err) => reportSyncError(err, 'chats')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'calls'), limit(60)),
        (snap) => {
          clearSyncError('calls');
          const list: AdminCallRoomSummary[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            const status =
              raw.status === 'active' || raw.status === 'ringing' ? raw.status : 'ended';
            const memberIds = Array.isArray(raw.memberIds)
              ? raw.memberIds.filter((v): v is string => typeof v === 'string')
              : [];
            list.push({
              id: d.id,
              chatId: typeof raw.chatId === 'string' ? raw.chatId : '',
              title: typeof raw.title === 'string' && raw.title ? raw.title : 'Call Room',
              callerId: typeof raw.callerId === 'string' ? raw.callerId : '',
              callerName: typeof raw.callerName === 'string' ? raw.callerName : 'Member',
              isAudioOnly: Boolean(raw.isAudioOnly),
              status,
              memberIds,
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
              updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt),
            });
          });
          setCalls(list);
        },
        (err) => reportSyncError(err, 'calls')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'stories'),
        (snap) => {
          clearSyncError('stories');
          const byAuthor = new Map<string, StoryGroup>();
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            const story: StoryItem = {
              ...(raw as unknown as Omit<StoryItem, 'id'>),
              id: d.id,
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
            };
            const existing = byAuthor.get(story.authorId);
            if (!existing) {
              byAuthor.set(story.authorId, {
                authorId: story.authorId,
                authorName: story.authorName,
                authorHandle: story.authorHandle,
                authorAvatar: story.authorAvatar,
                hasUnviewed: true,
                latestCreatedAtMs: story.createdAtMs,
                items: [story],
              });
            } else {
              existing.items.push(story);
              existing.latestCreatedAtMs = Math.max(
                existing.latestCreatedAtMs,
                story.createdAtMs || 0
              );
            }
          });
          const nextGroups = Array.from(byAuthor.values());
          setStoryGroups(nextGroups);
          const expiredCount = countExpiredStories(nextGroups);
          setJobs((prev) =>
            prev.map((job) =>
              job.id === 'job_expired_stories' && job.lastStatus === 'idle'
                ? { ...job, lastSummary: `${expiredCount} expired stories detected` }
                : job
            )
          );
        },
        (err) => reportSyncError(err, 'stories')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'presence'),
        (snap) => {
          clearSyncError('presence');
          const online: string[] = [];
          snap.forEach((d) => {
            const data = d.data() as { online?: boolean };
            if (data.online) online.push(d.id);
          });
          setOnlineUserIds(online);
        },
        (err) => reportSyncError(err, 'presence')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'admins'),
        (snap) => {
          clearSyncError('admins');
          const list: AdminRoleEntry[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            list.push({
              ...(raw as unknown as AdminRoleEntry),
              uid: d.id,
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
              updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt),
            });
          });
          setAdminRoles(list);
        },
        (err) => reportSyncError(err, 'admins')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'userModeration'),
        (snap) => {
          clearSyncError('userModeration');
          const map: Record<string, MemberModerationRecord> = {};
          const restrictedUids: string[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            const record: MemberModerationRecord = {
              ...(raw as unknown as MemberModerationRecord),
              uid: d.id,
              updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt),
            };
            map[d.id] = record;
            if (record.status === 'restricted') {
              restrictedUids.push(d.id);
            }
          });
          setMemberModerationRecords(map);
          setModeration((prev) => ({ ...prev, restrictedUids }));
        },
        (err) => reportSyncError(err, 'userModeration')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'reports'),
        (snap) => {
          clearSyncError('reports');
          const list: ContentReport[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            list.push({
              ...(raw as unknown as Omit<ContentReport, 'id'>),
              id: d.id,
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
              updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt),
            });
          });
          setReports(list);
        },
        (err) => reportSyncError(err, 'reports')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'appeals'),
        (snap) => {
          clearSyncError('appeals');
          const list: ModerationAppeal[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            list.push({
              ...(raw as unknown as Omit<ModerationAppeal, 'id'>),
              id: d.id,
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
              updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt),
            });
          });
          setAppeals(list);
        },
        (err) => reportSyncError(err, 'appeals')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'announcements'),
        (snap) => {
          clearSyncError('announcements');
          const list: PlatformAnnouncement[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            list.push({
              ...(raw as unknown as Omit<PlatformAnnouncement, 'id'>),
              id: d.id,
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
              updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt),
            });
          });
          setAnnouncements(list);
        },
        (err) => reportSyncError(err, 'announcements')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'adminConfig'),
        (snap) => {
          clearSyncError('adminConfig');
          let nextHiddenPosts: string[] = [];
          let hasFlags = false;
          let hasGuidelines = false;
          let hasTerms = false;
          let hasPrivacy = false;
          snap.forEach((d) => {
            if (d.id === 'featureFlags') {
              hasFlags = true;
              const raw = d.data() as Record<string, unknown>;
              setFeatureFlags({
                ...DEFAULT_FEATURE_FLAGS,
                ...(raw as Partial<AdminFeatureFlags>),
                updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt, 0),
              });
            } else if (d.id === 'guidelines') {
              hasGuidelines = true;
              const raw = d.data() as Record<string, unknown>;
              setGuidelines({
                ...DEFAULT_COMMUNITY_GUIDELINES,
                ...(raw as Partial<CommunityGuidelinesConfig>),
                updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt, 0),
              });
            } else if (d.id === 'terms') {
              hasTerms = true;
              const raw = d.data() as Record<string, unknown>;
              setTermsConfig({
                ...DEFAULT_TERMS_CONFIG,
                ...(raw as Partial<LegalPolicyConfig>),
                updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt, 0),
              });
            } else if (d.id === 'privacy') {
              hasPrivacy = true;
              const raw = d.data() as Record<string, unknown>;
              setPrivacyConfig({
                ...DEFAULT_PRIVACY_CONFIG,
                ...(raw as Partial<LegalPolicyConfig>),
                updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt, 0),
              });
            } else if (d.id === 'hiddenPosts') {
              const data = d.data() as { hiddenPostIds?: string[] };
              if (Array.isArray(data.hiddenPostIds)) {
                nextHiddenPosts = data.hiddenPostIds;
              }
            }
          });
          if (!hasFlags) {
            setFeatureFlags(DEFAULT_FEATURE_FLAGS);
          }
          if (!hasGuidelines) {
            setGuidelines(DEFAULT_COMMUNITY_GUIDELINES);
          }
          if (!hasTerms) {
            setTermsConfig(DEFAULT_TERMS_CONFIG);
          }
          if (!hasPrivacy) {
            setPrivacyConfig(DEFAULT_PRIVACY_CONFIG);
          }
          setModeration((prev) => ({ ...prev, hiddenPostIds: nextHiddenPosts }));
        },
        (err) => reportSyncError(err, 'adminConfig')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'adminAuditLogs'),
        (snap) => {
          clearSyncError('adminAuditLogs');
          const list: AdminAuditEntry[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            list.push({
              ...(raw as unknown as Omit<AdminAuditEntry, 'id'>),
              id: d.id,
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
            });
          });
          setAuditLogs(list);
        },
        (err) => reportSyncError(err, 'adminAuditLogs')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'accessInquiries'),
        (snap) => {
          clearSyncError('accessInquiries');
          const list: AdminAccessInquiry[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            list.push({
              ...(raw as unknown as Omit<AdminAccessInquiry, 'id'>),
              id: d.id,
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
              updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt),
            });
          });
          setInquiries(list);
        },
        (err) => reportSyncError(err, 'accessInquiries')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'verificationRequests'),
        (snap) => {
          clearSyncError('verificationRequests');
          const list: VerificationRequest[] = [];
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            list.push({
              id: String(raw.id || d.id),
              uid: String(raw.uid || ''),
              displayName: String(raw.displayName || 'Looma Member'),
              handle: String(raw.handle || 'looma_member'),
              avatarUrl: normalizeAssetUrl(String(raw.avatarUrl || '')),
              reason: String(raw.reason || ''),
              links: Array.isArray(raw.links)
                ? raw.links.filter((l): l is string => typeof l === 'string')
                : [],
              status:
                raw.status === 'approved' || raw.status === 'rejected'
                  ? raw.status
                  : 'pending',
              reviewerUid: typeof raw.reviewerUid === 'string' ? raw.reviewerUid : '',
              reviewerNote: typeof raw.reviewerNote === 'string' ? raw.reviewerNote : '',
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
              updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt),
            });
          });
          const sorted = sortVerificationRequests(list);
          setVerificationRequests(sorted);
          mirrorAdminStorage('looma_verification_requests_v1', sorted);
        },
        (err) => reportSyncError(err, 'verificationRequests')
      )
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [
    adminAuth.checkingAdminDoc,
    adminAuth.isAdmin,
    adminAuth.reason,
    clearSyncError,
    firebaseUser,
    reportSyncError,
    runHealthProbes,
  ]);

  const recordAudit = useCallback(
    async (action: string, targetType: string, targetId: string, summary: string) => {
      if (!firebaseUser || !adminAuth.isAdmin) return;
      const actorUid = firebaseUser.uid;
      const actorEmail = firebaseUser.email || currentProfile.handle;
      const createdAtMs = Date.now();
      const id = `audit_${createdAtMs}_${Math.random().toString(36).slice(2, 7)}`;

      setAuditLogs((prev) =>
        appendAuditEntry(prev, {
          id,
          actorUid,
          actorEmail,
          action,
          targetType,
          targetId,
          summary,
          createdAtMs,
        })
      );

      try {
        await setDoc(doc(db, 'adminAuditLogs', id), {
          id,
          actorUid,
          actorEmail,
          action,
          targetType,
          targetId,
          summary,
          createdAtMs,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `adminAuditLogs/${id}`);
      }
    },
    [adminAuth.isAdmin, currentProfile.handle, firebaseUser]
  );

  const handleToggleHidePost = (postId: string) => {
    if (!firebaseUser || !adminAuth.isAdmin) return;
    const currentlyHidden = moderation.hiddenPostIds.includes(postId);
    const nextHidden = toggleHiddenPostId(moderation.hiddenPostIds, postId);
    setModeration((prev) => ({ ...prev, hiddenPostIds: nextHidden }));

    void recordAudit(
      currentlyHidden ? 'post.restore' : 'post.hide',
      'post',
      postId,
      currentlyHidden
        ? `Restored post ${postId} to public feeds.`
        : `Hid post ${postId} from public feeds.`
    );

    void setDoc(
      doc(db, 'adminConfig', 'hiddenPosts'),
      {
        id: 'hiddenPosts',
        hiddenPostIds: nextHidden,
        updatedBy: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => handleFirestoreError(err, OperationType.WRITE, 'adminConfig/hiddenPosts'));
  };

  const handleEditPost = async (
    postId: string,
    updates: {
      caption: string;
      category: PostCategory;
      imageUrl: string;
      linkUrl?: string;
      mediaTitle?: string;
    }
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const existing = posts.find((p) => p.id === postId);
    const cleanCaption = updates.caption.trim();
    const cleanImageUrl = updates.imageUrl.trim();
    const cleanLinkUrl = (updates.linkUrl || '').trim();
    const cleanMediaTitle = (updates.mediaTitle || '').trim();

    if (
      !cleanCaption &&
      !cleanImageUrl &&
      !cleanLinkUrl &&
      !existing?.videoUrl &&
      !existing?.audioUrl
    ) {
      return { ok: false, error: 'A post must contain a caption, media URL, or reference link.' };
    }
    if (cleanCaption.length > 1200) {
      return { ok: false, error: 'Post caption cannot exceed 1200 characters.' };
    }
    if (cleanLinkUrl.length > 1000) {
      return { ok: false, error: 'Link URL cannot exceed 1000 characters.' };
    }
    if (cleanMediaTitle.length > 120) {
      return { ok: false, error: 'Media title cannot exceed 120 characters.' };
    }

    const now = Date.now();
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              caption: cleanCaption,
              category: updates.category,
              imageUrl: cleanImageUrl,
              linkUrl: cleanLinkUrl || undefined,
              mediaTitle: cleanMediaTitle || undefined,
              updatedAtMs: now,
            }
          : p
      )
    );

    try {
      await updateDoc(doc(db, 'posts', postId), {
        caption: cleanCaption,
        category: updates.category,
        imageUrl: cleanImageUrl,
        linkUrl: cleanLinkUrl,
        mediaTitle: cleanMediaTitle,
        updatedAt: serverTimestamp(),
      });
      await recordAudit(
        'post.edit',
        'post',
        postId,
        `Edited post ${postId} (${updates.category}).`
      );
      for (const tag of extractHashtags(cleanCaption)) {
        await handleCreateHashtag(tag);
      }
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `posts/${postId}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!firebaseUser || !adminAuth.isAdmin) return;
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setComments((prev) => prev.filter((c) => c.postId !== postId));
    await recordAudit('post.delete', 'post', postId, `Deleted post ${postId}.`);
    try {
      await deleteDoc(doc(db, 'posts', postId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${postId}`);
    }
  };

  const handleDeleteComment = async (
    postId: string,
    commentId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const parentPost = posts.find((p) => p.id === postId);
    setComments((prev) =>
      prev.filter((c) => !(c.id === commentId && c.postId === postId))
    );
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, commentsCount: Math.max(0, (p.commentsCount || 0) - 1) }
          : p
      )
    );

    try {
      await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
      if (parentPost && parentPost.commentsCount >= 1) {
        await updateDoc(doc(db, 'posts', postId), {
          commentsCount: increment(-1),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      await recordAudit(
        'comment.delete',
        'comment',
        commentId,
        `Deleted comment ${commentId} on post ${postId}.`
      );
      return { ok: true };
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `posts/${postId}/comments/${commentId}`
      );
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    if (!firebaseUser || !adminAuth.isAdmin) return;
    setStoryGroups((prev) =>
      prev
        .map((group) => ({
          ...group,
          items: group.items.filter((s) => s.id !== storyId),
        }))
        .filter((g) => g.items.length > 0)
    );
    await recordAudit('story.delete', 'story', storyId, `Removed story frame ${storyId}.`);
    try {
      await deleteDoc(doc(db, 'stories', storyId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `stories/${storyId}`);
    }
  };

  const handleSetMemberStatus = async (
    targetUid: string,
    status: MemberAccountStatus,
    reason: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const res = setMemberModerationStatus(
      memberModerationRecords,
      targetUid,
      status,
      reason,
      firebaseUser.uid
    );
    if (!res.ok) return { ok: false, error: res.error };

    setMemberModerationRecords(res.records);
    setModeration((prev) => {
      const nextRestricted =
        status === 'restricted'
          ? Array.from(new Set([...prev.restrictedUids, targetUid]))
          : prev.restrictedUids.filter((id) => id !== targetUid);
      return { ...prev, restrictedUids: nextRestricted };
    });

    await recordAudit(
      `member.${status}`,
      'user',
      targetUid,
      `Set member ${targetUid} status to ${status}: ${reason}`
    );

    try {
      await setDoc(doc(db, 'userModeration', targetUid), {
        uid: targetUid,
        status,
        reason: res.records[targetUid].reason,
        updatedBy: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `userModeration/${targetUid}`);
    }

    return { ok: true };
  };

  const handleAssignRole = async (input: {
    uid: string;
    email: string;
    displayName: string;
    role: AdminRoleLevel;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const res = assignAdminRole(adminRoles, input, firebaseUser.uid);
    if (!res.ok) return { ok: false, error: res.error };

    setAdminRoles(res.roles);
    await recordAudit(
      'role.assign',
      'admin',
      res.entry.uid,
      `Assigned ${res.entry.role} role to ${res.entry.email}.`
    );

    try {
      await setDoc(doc(db, 'admins', res.entry.uid), {
        uid: res.entry.uid,
        email: res.entry.email,
        displayName: res.entry.displayName,
        role: res.entry.role,
        permissions: ADMIN_ROLE_PERMISSIONS[res.entry.role],
        grantedBy: firebaseUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `admins/${res.entry.uid}`);
    }
    return { ok: true };
  };

  const handleRevokeRole = async (targetUid: string): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const res = revokeAdminRole(adminRoles, targetUid, firebaseUser.uid);
    if (!res.ok) return { ok: false, error: res.error };

    setAdminRoles(res.roles);
    await recordAudit('role.revoke', 'admin', targetUid, `Revoked operator role for ${targetUid}.`);

    try {
      await deleteDoc(doc(db, 'admins', targetUid));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `admins/${targetUid}`);
    }
    return { ok: true };
  };

  const handleResolveReport = async (
    reportId: string,
    status: ReportStatus,
    resolutionAction: string,
    extraAction?: 'hide-post' | 'restrict-author'
  ) => {
    if (!firebaseUser || !adminAuth.isAdmin) return;
    const targetReport = reports.find((r) => r.id === reportId);
    setReports((prev) =>
      updateReportResolution(prev, reportId, status, resolutionAction, firebaseUser.uid)
    );

    if (extraAction === 'hide-post' && targetReport?.targetId) {
      if (!moderation.hiddenPostIds.includes(targetReport.targetId)) {
        handleToggleHidePost(targetReport.targetId);
      }
    } else if (extraAction === 'restrict-author' && targetReport?.targetAuthorUid) {
      await handleSetMemberStatus(
        targetReport.targetAuthorUid,
        'restricted',
        `Restricted via report ${reportId}: ${resolutionAction}`
      );
    }

    await recordAudit(
      `report.${status}`,
      'report',
      reportId,
      `Report ${reportId} -> ${status}: ${resolutionAction}`
    );

    try {
      await updateDoc(doc(db, 'reports', reportId), {
        status,
        resolutionAction,
        reviewedBy: firebaseUser.uid,
        reviewedAtMs: status === 'open' ? 0 : Date.now(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reports/${reportId}`);
    }
  };

  const handleReviewAppeal = async (
    appealId: string,
    decision: 'approved' | 'rejected',
    reviewerNote: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const res = reviewAppealDecision(
      appeals,
      appealId,
      decision,
      reviewerNote,
      firebaseUser.uid
    );
    if (!res.ok) return { ok: false, error: res.error };

    setAppeals(res.appeals);

    if (decision === 'approved' && res.updated?.appellantUid) {
      await handleSetMemberStatus(
        res.updated.appellantUid,
        'active',
        `Appeal ${appealId} approved: ${reviewerNote}`
      );
    }

    await recordAudit(
      `appeal.${decision}`,
      'appeal',
      appealId,
      `Appeal ${appealId} ${decision}: ${reviewerNote}`
    );

    try {
      await updateDoc(doc(db, 'appeals', appealId), {
        status: decision,
        reviewerUid: firebaseUser.uid,
        reviewerNote: reviewerNote.trim(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `appeals/${appealId}`);
    }
    return { ok: true };
  };

  const handleToggleVerify = async (
    targetUid: string,
    isVerified: boolean
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    setCommunityUsers((prev) =>
      prev.map((u) => (u.uid === targetUid ? { ...u, isVerified } : u))
    );
    await recordAudit(
      isVerified ? 'user.verify' : 'user.revokeVerify',
      'user',
      targetUid,
      `${isVerified ? 'Granted' : 'Revoked'} verified blue tick badge for ${targetUid}.`
    );
    try {
      await updateDoc(doc(db, 'users', targetUid), {
        isVerified,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
    return { ok: true };
  };

  const handleReviewVerificationRequest = async (
    requestId: string,
    targetUid: string,
    decision: 'approved' | 'rejected',
    note: string = ''
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const res = reviewVerificationRequestDecision(
      verificationRequests,
      requestId,
      decision,
      firebaseUser.uid,
      note
    );
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    setVerificationRequests(res.requests);
    mirrorAdminStorage('looma_verification_requests_v1', res.requests);

    try {
      await updateDoc(doc(db, 'verificationRequests', requestId), {
        status: decision,
        reviewerUid: firebaseUser.uid,
        reviewerNote: res.updated.reviewerNote || '',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `verificationRequests/${requestId}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }

    if (decision === 'approved') {
      setCommunityUsers((prev) =>
        prev.map((u) => (u.uid === targetUid ? { ...u, isVerified: true } : u))
      );
      if (targetUid === firebaseUser.uid) {
        setCurrentProfile((prev) => ({ ...prev, isVerified: true }));
      }
      try {
        await updateDoc(doc(db, 'users', targetUid), {
          isVerified: true,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
        return { ok: false, error: (err as Error).message || String(err) };
      }
    }

    const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const notifTitle =
      decision === 'approved'
        ? 'Verification Badge Granted'
        : 'Verification Request Update';
    const notifBody =
      decision === 'approved'
        ? 'Your account is now verified. Your blue verification badge is visible across Looma.'
        : res.updated.reviewerNote
          ? `Your verification request was not approved: ${res.updated.reviewerNote}`.slice(0, 240)
          : 'Your verification request was not approved at this time. You may submit an updated request from Profile Settings.';
    try {
      await setDoc(doc(db, 'users', targetUid, 'notifications', notifId), {
        id: notifId,
        recipientId: targetUid,
        actorId: firebaseUser.uid,
        actorName: currentProfile.displayName,
        actorAvatar: currentProfile.avatarUrl || '',
        type: 'system',
        title: notifTitle,
        body: notifBody,
        targetPostId: '',
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch {
      // Notification write is best-effort after badge status update
    }

    await recordAudit(
      `verification.${decision}`,
      'user',
      targetUid,
      `${decision === 'approved' ? 'Approved' : 'Rejected'} verification request ${requestId} for ${targetUid}.${res.updated.reviewerNote ? ` Note: ${res.updated.reviewerNote}` : ''}`
    );

    return { ok: true };
  };

  const handleCreateHashtag = async (
    rawTag: string
  ): Promise<{ ok: boolean; tag?: string; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const clean = normalizeHashtag(rawTag);
    if (!clean) {
      return { ok: false, error: 'Enter 1-40 lowercase letters, numbers, or underscores.' };
    }
    setSavedHashtags((prev) => mergeSavedHashtags(prev, [clean]));
    try {
      const ref = doc(db, 'hashtags', clean);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          tag: clean,
          createdBy: firebaseUser.uid,
          createdAt: serverTimestamp(),
        });
        await recordAudit('hashtag.create', 'hashtag', clean, `Saved community hashtag #${clean}.`);
      }
      return { ok: true, tag: clean };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `hashtags/${clean}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handleDeleteHashtag = async (
    rawTag: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const clean = normalizeHashtag(rawTag);
    if (!clean) {
      return { ok: false, error: 'Invalid hashtag identifier.' };
    }
    const nextDynamic = dynamicHashtags.filter((t) => t.toLowerCase() !== clean);
    setDynamicHashtags(nextDynamic);
    setSavedHashtags(mergeSavedHashtags(POPULAR_HASHTAGS, nextDynamic));
    try {
      await deleteDoc(doc(db, 'hashtags', clean));
      await recordAudit(
        'hashtag.delete',
        'hashtag',
        clean,
        `Deleted community hashtag #${clean} from registry.`
      );
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `hashtags/${clean}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handleCreateCategory = async (
    rawName: string,
    rawDesc: string
  ): Promise<{ ok: boolean; category?: PostCategoryRecord; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const check = validateCategoryInput(rawName, rawDesc, categories);
    if (!check.valid) {
      return { ok: false, error: check.error || 'Invalid category inputs.' };
    }
    const categoryId = check.id;
    try {
      await setDoc(doc(db, 'categories', categoryId), {
        id: categoryId,
        name: check.name,
        description: check.description,
        createdBy: firebaseUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAudit(
        'category.create',
        'category',
        categoryId,
        `Created category "${check.name}" (${categoryId}).`
      );
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `categories/${categoryId}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handleDeleteCategory = async (
    categoryId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    try {
      await deleteDoc(doc(db, 'categories', categoryId));
      await recordAudit(
        'category.delete',
        'category',
        categoryId,
        `Deleted post category ${categoryId}.`
      );
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `categories/${categoryId}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handleUploadAdminMedia = async (
    file: File,
    folder: 'posts' | 'stories'
  ): Promise<{ ok: boolean; url?: string; kind?: string; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    try {
      const uploaded = await uploadMediaToCloudflareR2(file, folder);
      return { ok: true, url: uploaded.url, kind: uploaded.kind };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Cloudflare R2 upload failed.',
      };
    }
  };

  const handleAdminPublishPost = async (input: {
    caption: string;
    category: PostCategory;
    imageUrl: string;
    videoUrl?: string;
    linkUrl?: string;
    mediaTitle?: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const cleanCaption = input.caption.trim();
    const cleanImageUrl = input.imageUrl.trim();
    const cleanVideoUrl = (input.videoUrl || '').trim();
    const cleanLinkUrl = (input.linkUrl || '').trim();
    const cleanMediaTitle = sanitizeMediaTitle(input.mediaTitle);

    if (!cleanCaption && !cleanImageUrl && !cleanVideoUrl && !cleanLinkUrl) {
      return { ok: false, error: 'Post caption, media, or reference link is required.' };
    }
    const now = Date.now();
    const postId = `post_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const safeHandle = sanitizeAdminHandle(currentProfile.handle);
    const isMasterAdmin = Boolean(
      firebaseUser.email && isAllowlistedAdminEmail(firebaseUser.email)
    );
    const authorVerified = isMasterAdmin || Boolean(currentProfile.isVerified) || true;

    const newPost: Post = {
      id: postId,
      authorId: firebaseUser.uid,
      authorName: currentProfile.displayName,
      authorHandle: safeHandle,
      authorAvatar: currentProfile.avatarUrl,
      authorVerified,
      caption: cleanCaption,
      imageUrl: cleanImageUrl,
      ...(cleanVideoUrl ? { videoUrl: cleanVideoUrl } : {}),
      ...(cleanLinkUrl ? { linkUrl: cleanLinkUrl } : {}),
      ...(cleanMediaTitle ? { mediaTitle: cleanMediaTitle } : {}),
      category: input.category,
      likesCount: 0,
      commentsCount: 0,
      createdAtMs: now,
      updatedAtMs: now,
    };

    setPosts((prev) => [newPost, ...prev]);
    await recordAudit(
      'post.create',
      'post',
      postId,
      `Admin published post "${(cleanCaption || cleanMediaTitle || 'Media post').slice(0, 40)}..."`
    );

    try {
      await setDoc(doc(db, 'posts', postId), {
        id: postId,
        authorId: firebaseUser.uid,
        authorName: currentProfile.displayName,
        authorHandle: safeHandle,
        authorAvatar: currentProfile.avatarUrl,
        authorVerified,
        caption: cleanCaption,
        imageUrl: cleanImageUrl,
        ...(cleanVideoUrl ? { videoUrl: cleanVideoUrl } : {}),
        ...(cleanLinkUrl ? { linkUrl: cleanLinkUrl } : {}),
        ...(cleanMediaTitle ? { mediaTitle: cleanMediaTitle } : {}),
        category: input.category,
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Persist new hashtags automatically
      const tags = extractHashtags(cleanCaption);
      for (const tag of tags) {
        await handleCreateHashtag(tag);
      }

      // Dispatch mention notifications to referenced users
      const mentionedHandles = extractMentions(cleanCaption);
      for (const handle of mentionedHandles) {
        const targetUser = communityUsers.find(
          (u) => u.handle.toLowerCase() === handle.toLowerCase() && u.uid !== firebaseUser.uid
        );
        if (targetUser) {
          const notifId = `notif_${now}_${Math.random().toString(36).slice(2, 7)}`;
          await setDoc(doc(db, 'users', targetUser.uid, 'notifications', notifId), {
            id: notifId,
            recipientId: targetUser.uid,
            actorId: firebaseUser.uid,
            actorName: currentProfile.displayName,
            actorAvatar: currentProfile.avatarUrl || '',
            type: 'mention',
            title: `${currentProfile.displayName} mentioned you`,
            body: cleanCaption.slice(0, 220) || 'Tagged you in an official post.',
            targetPostId: postId,
            read: false,
            createdAt: serverTimestamp(),
          }).catch(() => {});
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `posts/${postId}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
    return { ok: true };
  };

  const handlePublishStory = async (input: {
    caption: string;
    imageUrl: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const cleanCaption = input.caption.trim().slice(0, 280);
    const cleanImageUrl = input.imageUrl.trim();
    if (!cleanImageUrl && !cleanCaption) {
      return { ok: false, error: 'Story image URL or caption is required.' };
    }
    const now = Date.now();
    const expiresAtMs = now + 86_400_000;
    const storyId = `story_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const safeHandle = sanitizeAdminHandle(currentProfile.handle);

    const storyItem: StoryItem = {
      id: storyId,
      authorId: firebaseUser.uid,
      authorName: currentProfile.displayName,
      authorHandle: safeHandle,
      authorAvatar: currentProfile.avatarUrl || '',
      imageUrl: cleanImageUrl,
      caption: cleanCaption,
      createdAtMs: now,
      expiresAtMs,
    };

    setStoryGroups((prev) => {
      const existing = prev.find((g) => g.authorId === firebaseUser.uid);
      if (!existing) {
        return [
          {
            authorId: firebaseUser.uid,
            authorName: currentProfile.displayName,
            authorHandle: safeHandle,
            authorAvatar: currentProfile.avatarUrl || '',
            items: [storyItem],
            hasUnviewed: true,
            latestCreatedAtMs: now,
          },
          ...prev,
        ];
      }
      return prev.map((g) =>
        g.authorId === firebaseUser.uid
          ? {
              ...g,
              latestCreatedAtMs: now,
              items: [storyItem, ...g.items],
            }
          : g
      );
    });

    try {
      await setDoc(doc(db, 'stories', storyId), {
        id: storyId,
        authorId: firebaseUser.uid,
        authorName: currentProfile.displayName,
        authorHandle: safeHandle,
        authorAvatar: currentProfile.avatarUrl || '',
        imageUrl: cleanImageUrl,
        caption: cleanCaption,
        expiresAtMs,
        createdAt: serverTimestamp(),
      });
      await recordAudit(
        'story.create',
        'story',
        storyId,
        `Published official 24-hour story "${(cleanCaption || 'Visual frame').slice(0, 40)}".`
      );
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `stories/${storyId}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handleAdminSanitizeProfile = async (
    targetUid: string,
    input: {
      displayName: string;
      handle: string;
      bio: string;
      location: string;
      avatarUrl: string;
    }
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const check = validateProfileSanitizeInput(input);
    if (!check.valid) return { ok: false, error: check.error };

    setCommunityUsers((prev) =>
      prev.map((u) =>
        u.uid === targetUid ? { ...u, ...check.data, updatedAtMs: Date.now() } : u
      )
    );
    if (targetUid === firebaseUser.uid) {
      setCurrentProfile((prev) => {
        const updatedSelf: UserProfile = {
          ...prev,
          ...check.data,
          updatedAtMs: Date.now(),
        };
        if (typeof BroadcastChannel !== 'undefined') {
          try {
            const ch = new BroadcastChannel('looma_realtime_sync');
            ch.postMessage({ type: 'profile:updated', profile: updatedSelf });
            ch.close();
          } catch {
            // Ignore cross-tab channel errors
          }
        }
        return updatedSelf;
      });
    }

    try {
      await updateDoc(doc(db, 'users', targetUid), {
        displayName: check.data.displayName,
        handle: check.data.handle,
        bio: check.data.bio,
        location: check.data.location,
        avatarUrl: check.data.avatarUrl,
        updatedAt: serverTimestamp(),
      });
      if (targetUid === firebaseUser.uid) {
        void updateAuthUserProfile(
          check.data.displayName,
          check.data.avatarUrl
        ).catch(() => {});
        void updateDoc(doc(db, 'admins', targetUid), {
          displayName: check.data.displayName,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      await recordAudit(
        'user.sanitizeProfile',
        'user',
        targetUid,
        `Updated profile fields for @${check.data.handle} (${targetUid}).`
      );
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handleSendDirectWarning = async (
    targetUid: string,
    title: string,
    body: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const check = validateDirectWarningInput(targetUid, title, body);
    if (!check.valid) return { ok: false, error: check.error };

    const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await setDoc(doc(db, 'users', targetUid, 'notifications', notifId), {
        id: notifId,
        recipientId: targetUid,
        actorId: firebaseUser.uid,
        actorName: currentProfile.displayName,
        actorAvatar: currentProfile.avatarUrl || '',
        type: 'system',
        title: check.title,
        body: check.body,
        targetPostId: '',
        read: false,
        createdAt: serverTimestamp(),
      });
      await recordAudit(
        'user.warn',
        'user',
        targetUid,
        `Sent official notice "${check.title}" to ${targetUid}.`
      );
      return { ok: true };
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `users/${targetUid}/notifications/${notifId}`
      );
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handlePurgeUserAccount = async (
    targetUid: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    if (!targetUid || targetUid === firebaseUser.uid) {
      return { ok: false, error: 'Administrators cannot purge their own account.' };
    }

    try {
      const userPostsSnap = await getDocs(
        query(collection(db, 'posts'), where('authorId', '==', targetUid))
      );
      for (const postDoc of userPostsSnap.docs) {
        await deleteDoc(doc(db, 'posts', postDoc.id));
      }

      const userStoriesSnap = await getDocs(
        query(collection(db, 'stories'), where('authorId', '==', targetUid))
      );
      for (const storyDoc of userStoriesSnap.docs) {
        await deleteDoc(doc(db, 'stories', storyDoc.id));
      }

      await deleteDoc(doc(db, 'userModeration', targetUid)).catch(() => {});
      await deleteDoc(doc(db, 'users', targetUid));

      setCommunityUsers((prev) => prev.filter((u) => u.uid !== targetUid));
      setPosts((prev) => prev.filter((p) => p.authorId !== targetUid));
      setStoryGroups((prev) => prev.filter((g) => g.authorId !== targetUid));
      setComments((prev) => prev.filter((c) => c.authorId !== targetUid));
      setMemberModerationRecords((prev) => {
        const next = { ...prev };
        delete next[targetUid];
        return next;
      });

      await recordAudit(
        'user.purge',
        'user',
        targetUid,
        `Purged account ${targetUid} (${userPostsSnap.size} posts, ${userStoriesSnap.size} stories).`
      );
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${targetUid}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handlePublishAnnouncement = async (input: {
    title: string;
    body: string;
    severity: AnnouncementSeverity;
    audience: AnnouncementAudience;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const check = validateAnnouncementInput(input.title, input.body);
    if (!check.valid) return { ok: false, error: check.error };

    const now = Date.now();
    const id = `ann_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const item: PlatformAnnouncement = {
      id,
      title: check.title,
      body: check.body,
      severity: input.severity,
      audience: input.audience,
      active: true,
      authorUid: firebaseUser.uid,
      authorName: currentProfile.displayName,
      createdAtMs: now,
      updatedAtMs: now,
    };

    setAnnouncements((prev) => [item, ...prev]);
    await recordAudit(
      'announcement.publish',
      'announcement',
      id,
      `Published announcement: ${check.title}`
    );

    try {
      await setDoc(doc(db, 'announcements', id), {
        id,
        title: check.title,
        body: check.body,
        severity: input.severity,
        audience: input.audience,
        active: true,
        authorUid: firebaseUser.uid,
        authorName: currentProfile.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `announcements/${id}`);
    }
    return { ok: true };
  };

  const handleToggleAnnouncement = async (id: string) => {
    if (!firebaseUser || !adminAuth.isAdmin) return;
    const existing = announcements.find((a) => a.id === id);
    if (!existing) return;
    const nextActive = !existing.active;

    setAnnouncements((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active: nextActive, updatedAtMs: Date.now() } : a))
    );
    await recordAudit(
      nextActive ? 'announcement.activate' : 'announcement.pause',
      'announcement',
      id,
      `${nextActive ? 'Activated' : 'Paused'} announcement "${existing.title}".`
    );

    try {
      await updateDoc(doc(db, 'announcements', id), {
        active: nextActive,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `announcements/${id}`);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!firebaseUser || !adminAuth.isAdmin) return;
    const existing = announcements.find((a) => a.id === id);
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    await recordAudit(
      'announcement.delete',
      'announcement',
      id,
      `Deleted announcement "${existing?.title || id}".`
    );
    try {
      await deleteDoc(doc(db, 'announcements', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `announcements/${id}`);
    }
  };

  const handleSaveLegalPolicy = async (
    docId: LegalDocId,
    input: {
      version: string;
      summary: string;
      rulesText: string;
    }
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const check = validateLegalConfigInput(docId, input.version, input.summary, input.rulesText);
    if (!check.valid) return { ok: false, error: check.error };

    const next: LegalPolicyConfig = {
      version: check.version,
      summary: check.summary,
      rulesText: check.rulesText,
      updatedBy: firebaseUser.uid,
      updatedAtMs: Date.now(),
    };
    if (docId === 'terms') {
      setTermsConfig(next);
    } else if (docId === 'privacy') {
      setPrivacyConfig(next);
    } else {
      setGuidelines(next);
    }

    await recordAudit(
      `${docId}.update`,
      'config',
      docId,
      `Updated ${docId} policy document to revision v${check.version}.`
    );

    try {
      await setDoc(doc(db, 'adminConfig', docId), {
        id: docId,
        version: check.version,
        summary: check.summary,
        rulesText: check.rulesText,
        updatedBy: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `adminConfig/${docId}`);
    }
    return { ok: true };
  };

  const handleModerateChatRename = async (
    chatId: string,
    nextTitle: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const check = validateGroupChatModerationTitle(nextTitle);
    if (!check.valid) return { ok: false, error: check.error };

    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, title: check.title, updatedAtMs: Date.now() } : c))
    );
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        title: check.title,
        updatedAt: serverTimestamp(),
      });
      await recordAudit('chat.rename', 'chat', chatId, `Renamed conversation ${chatId} to "${check.title}".`);
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handleDeleteChatThread = async (
    chatId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    try {
      await deleteDoc(doc(db, 'chats', chatId));
      await recordAudit('chat.delete', 'chat', chatId, `Deleted conversation thread ${chatId}.`);
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `chats/${chatId}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handleModerateChatRemoveMember = async (
    chatId: string,
    targetUid: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const targetChat = chats.find((c) => c.id === chatId);
    if (!targetChat) {
      return { ok: false, error: 'Conversation thread not found.' };
    }
    const updatedMembership = removeMemberFromChatIds(
      targetChat.memberIds,
      targetChat.adminIds,
      targetUid
    );
    if (!updatedMembership) {
      return handleDeleteChatThread(chatId);
    }

    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              memberIds: updatedMembership.memberIds,
              adminIds: updatedMembership.adminIds,
              updatedAtMs: Date.now(),
            }
          : c
      )
    );

    try {
      await updateDoc(doc(db, 'chats', chatId), {
        memberIds: updatedMembership.memberIds,
        adminIds: updatedMembership.adminIds,
        updatedAt: serverTimestamp(),
      });
      await recordAudit(
        'chat.removeMember',
        'chat',
        chatId,
        `Removed participant ${targetUid} from conversation ${chatId}.`
      );
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handleForceEndCall = async (
    callId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const target = calls.find((c) => c.id === callId);
    if (target?.status === 'ended') {
      return { ok: true };
    }
    setCalls((prev) =>
      prev.map((c) =>
        c.id === callId ? { ...c, status: 'ended', updatedAtMs: Date.now() } : c
      )
    );
    try {
      await updateDoc(doc(db, 'calls', callId), {
        status: 'ended',
        updatedAt: serverTimestamp(),
      });
      await recordAudit('call.end', 'call', callId, `Force-ended WebRTC call room ${callId}.`);
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `calls/${callId}`);
      return { ok: false, error: (err as Error).message || String(err) };
    }
  };

  const handleLoadR2Objects = useCallback(
    async (prefix?: string) => {
      if (!firebaseUser || !adminAuth.isAdmin) return;
      setR2Loading(true);
      setR2Error(null);
      try {
        const token = await firebaseUser.getIdToken();
        const raw = (prefix || '').trim().replace(/\/+$/, '');
        const isSubfolderFilter =
          raw === 'avatars' || raw === 'posts' || raw === 'stories' || raw === 'voice';
        const queryPrefix = isSubfolderFilter || !raw ? 'uploads/' : `${raw}/`;

        const res = await fetch(
          `/api/admin/storage/list?prefix=${encodeURIComponent(queryPrefix)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          items?: R2MediaObjectItem[];
          totalBytes?: number;
          error?: string;
        };
        if (!res.ok) {
          setR2Error(data.error || `Failed to query R2 bucket (HTTP ${res.status}).`);
          setR2Loading(false);
          return;
        }
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const filteredItems = isSubfolderFilter
          ? rawItems.filter((item) => item.folder === raw)
          : rawItems;
        const computedBytes = filteredItems.reduce((sum, item) => sum + (item.size || 0), 0);
        setR2Objects(filteredItems);
        setR2TotalBytes(computedBytes);
      } catch (err) {
        setR2Error(err instanceof Error ? err.message : 'Unable to reach R2 admin listing endpoint.');
      } finally {
        setR2Loading(false);
      }
    },
    [adminAuth.isAdmin, firebaseUser]
  );

  const handleDeleteR2Object = async (
    key: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/admin/storage/file?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        return { ok: false, error: data.error || `Delete failed (HTTP ${res.status}).` };
      }
      setR2Objects((prev) => {
        const next = prev.filter((item) => item.key !== key);
        setR2TotalBytes(next.reduce((sum, item) => sum + (item.size || 0), 0));
        return next;
      });
      await recordAudit('storage.delete', 'r2', key, `Deleted R2 object ${key}.`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to delete R2 object.' };
    }
  };

  const handleUpdateInquiryStatus = (id: string, status: AdminAccessInquiry['status']) => {
    if (!firebaseUser || !adminAuth.isAdmin) return;
    setInquiries((prev) => updateAccessInquiryStatus(prev, id, status));
    void recordAudit('inquiry.update', 'inquiry', id, `Marked inquiry ${id} as ${status}.`);

    void updateDoc(doc(db, 'accessInquiries', id), {
      status,
      reviewedBy: firebaseUser.uid,
      updatedAt: serverTimestamp(),
    }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `accessInquiries/${id}`));
  };

  const handleToggleFeatureFlag = async (
    key: keyof Omit<AdminFeatureFlags, 'updatedBy' | 'updatedAtMs'>
  ) => {
    if (!firebaseUser || !adminAuth.isAdmin) return;
    const nextFlags: AdminFeatureFlags = {
      ...featureFlags,
      [key]: !featureFlags[key],
      updatedBy: firebaseUser.uid,
      updatedAtMs: Date.now(),
    };
    setFeatureFlags(nextFlags);

    await recordAudit(
      'flags.toggle',
      'config',
      'featureFlags',
      `Toggled ${key} to ${nextFlags[key] ? 'ON' : 'OFF'}.`
    );

    try {
      await setDoc(doc(db, 'adminConfig', 'featureFlags'), {
        id: 'featureFlags',
        storiesEnabled: nextFlags.storiesEnabled,
        voiceNotesEnabled: nextFlags.voiceNotesEnabled,
        callsEnabled: nextFlags.callsEnabled,
        maintenanceMode: nextFlags.maintenanceMode,
        registrationsOpen: nextFlags.registrationsOpen,
        strictModerationQueue: nextFlags.strictModerationQueue,
        updatedBy: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'adminConfig/featureFlags');
    }
  };

  const handleRunBackgroundJob = useCallback(
    async (jobId: string) => {
      if (!firebaseUser || !adminAuth.isAdmin) return;
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, lastStatus: 'running' } : j))
      );

      if (jobId === 'job_expired_stories') {
        const now = Date.now();
        const expiredIds: string[] = [];
        for (const group of storyGroups) {
          for (const s of group.items) {
            if (s.expiresAtMs <= now) expiredIds.push(s.id);
          }
        }
        for (const sid of expiredIds) {
          setStoryGroups((prev) =>
            prev
              .map((group) => ({
                ...group,
                items: group.items.filter((s) => s.id !== sid),
              }))
              .filter((g) => g.items.length > 0)
          );
          try {
            await deleteDoc(doc(db, 'stories', sid));
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, `stories/${sid}`);
          }
        }
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  lastStatus: 'completed',
                  lastRunAtMs: Date.now(),
                  lastSummary: `Purged ${expiredIds.length} expired story frames`,
                }
              : j
          )
        );
        await recordAudit(
          'job.execute',
          'job',
          jobId,
          `Executed expired story cleanup (${expiredIds.length} removed).`
        );
        return;
      }

      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                lastStatus: 'completed',
                lastRunAtMs: Date.now(),
                lastSummary: `Verified guidelines v${guidelines.version} & ${
                  announcements.filter((a) => a.active).length
                } active banners`,
              }
            : j
        )
      );
      await recordAudit(
        'job.execute',
        'job',
        jobId,
        'Verified governance & flags schema consistency.'
      );
    },
    [adminAuth.isAdmin, announcements, firebaseUser, guidelines.version, recordAudit, storyGroups]
  );

  // Optional 5-minute automated maintenance sweep for expired stories
  useEffect(() => {
    if (!autoMaintenanceEnabled || !firebaseUser || !adminAuth.isAdmin) return;
    const timer = window.setInterval(() => {
      if (countExpiredStories(storyGroups) > 0) {
        void handleRunBackgroundJob('job_expired_stories');
      }
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [
    adminAuth.isAdmin,
    autoMaintenanceEnabled,
    firebaseUser,
    handleRunBackgroundJob,
    storyGroups,
  ]);

  const enrichedPosts = useMemo(
    () =>
      posts.map((p) =>
        enrichPostWithVerifiedAuthor(p, communityUsers, currentProfile)
      ),
    [communityUsers, currentProfile, posts]
  );

  const enrichedStoryGroups = useMemo(
    () =>
      enrichStoryGroupsWithVerifiedAuthors(
        storyGroups,
        communityUsers,
        currentProfile
      ),
    [communityUsers, currentProfile, storyGroups]
  );

  const enrichedComments = useMemo(
    () =>
      comments.map((c) => {
        const synced = enrichCommentWithVerifiedAuthor(
          {
            id: c.id,
            postId: c.postId,
            authorId: c.authorId,
            authorName: c.authorName,
            authorHandle: c.authorHandle,
            authorAvatar: c.authorAvatar,
            text: c.text,
            createdAtMs: c.createdAtMs,
          },
          communityUsers,
          currentProfile
        );
        return {
          ...c,
          authorName: synced.authorName,
          authorHandle: synced.authorHandle,
          authorAvatar: synced.authorAvatar,
        };
      }),
    [comments, communityUsers, currentProfile]
  );

  const enrichedVerificationRequests = useMemo(
    () =>
      verificationRequests.map((req) =>
        enrichVerificationRequestWithUser(req, communityUsers, currentProfile)
      ),
    [communityUsers, currentProfile, verificationRequests]
  );

  return (
    <AdminView
      theme={theme}
      authReady={authReady}
      checkingAdminDoc={adminAuth.checkingAdminDoc}
      adminAuth={adminAuth}
      currentProfile={currentProfile}
      accountEmail={firebaseUser?.email || null}
      firestoreConnected={firestoreConnected}
      syncErrors={syncErrors}
      authError={authError}
      communityUsers={communityUsers}
      posts={enrichedPosts}
      storyGroups={enrichedStoryGroups}
      comments={enrichedComments}
      chats={chats}
      calls={calls}
      onlineUserIds={onlineUserIds}
      moderation={moderation}
      memberModerationRecords={memberModerationRecords}
      adminRoles={adminRoles}
      reports={reports}
      appeals={appeals}
      announcements={announcements}
      guidelines={guidelines}
      termsConfig={termsConfig}
      privacyConfig={privacyConfig}
      featureFlags={featureFlags}
      auditLogs={auditLogs}
      inquiries={inquiries}
      verificationRequests={enrichedVerificationRequests}
      onReviewVerificationRequest={handleReviewVerificationRequest}
      healthProbes={healthProbes}
      jobs={jobs}
      checkingHealth={checkingHealth}
      autoMaintenanceEnabled={autoMaintenanceEnabled}
      r2Objects={r2Objects}
      r2TotalBytes={r2TotalBytes}
      r2Loading={r2Loading}
      r2Error={r2Error}
      onSetTheme={setTheme}
      onSignInGoogle={async () => {
        setAuthError(null);
        try {
          await signInWithGoogle();
        } catch (err) {
          setAuthError(
            err instanceof Error ? err.message : 'Unable to complete Google sign-in.'
          );
        }
      }}
      onSignInEmail={async (email, password) => {
        setAuthError(null);
        try {
          await signInWithEmail(email, password);
        } catch (err) {
          setAuthError(
            err instanceof Error ? err.message : 'Unable to complete email sign-in.'
          );
        }
      }}
      onSignOut={async () => {
        await signOutAccount();
      }}
      onToggleHidePost={handleToggleHidePost}
      onEditPost={handleEditPost}
      onDeletePost={handleDeletePost}
      onDeleteStory={handleDeleteStory}
      onDeleteComment={handleDeleteComment}
      onSetMemberStatus={handleSetMemberStatus}
      onSanitizeProfile={handleAdminSanitizeProfile}
      onSendWarning={handleSendDirectWarning}
      onPurgeUser={handlePurgeUserAccount}
      onAssignRole={handleAssignRole}
      onRevokeRole={handleRevokeRole}
      onResolveReport={handleResolveReport}
      onReviewAppeal={handleReviewAppeal}
      onPublishAnnouncement={handlePublishAnnouncement}
      onToggleAnnouncement={handleToggleAnnouncement}
      onDeleteAnnouncement={handleDeleteAnnouncement}
      onSaveLegalPolicy={handleSaveLegalPolicy}
      onUpdateInquiryStatus={handleUpdateInquiryStatus}
      onToggleFeatureFlag={handleToggleFeatureFlag}
      onRunHealthProbes={runHealthProbes}
      onRunBackgroundJob={handleRunBackgroundJob}
      onToggleAutoMaintenance={() => setAutoMaintenanceEnabled((prev) => !prev)}
      onToggleVerify={handleToggleVerify}
      onUploadMedia={handleUploadAdminMedia}
      onPublishPost={handleAdminPublishPost}
      onPublishStory={handlePublishStory}
      savedHashtags={savedHashtags}
      dynamicHashtags={dynamicHashtags}
      categories={categories}
      onCreateCategory={handleCreateCategory}
      onDeleteCategory={handleDeleteCategory}
      onCreateHashtag={handleCreateHashtag}
      onDeleteHashtag={handleDeleteHashtag}
      onRenameChat={handleModerateChatRename}
      onRemoveChatMember={handleModerateChatRemoveMember}
      onDeleteChat={handleDeleteChatThread}
      onForceEndCall={handleForceEndCall}
      onLoadR2Objects={handleLoadR2Objects}
      onDeleteR2Object={handleDeleteR2Object}
    />
  );
}

export default function AdminApp(props: AdminAppProps) {
  return (
    <AdminErrorBoundary>
      <AdminAppInner {...props} />
    </AdminErrorBoundary>
  );
}
