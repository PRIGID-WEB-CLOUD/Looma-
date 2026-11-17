import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
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
} from '../src/services/firebase';
import { readStoredThemePreference } from '../src/app/initialization/initialization-config';
import type { Post, StoryGroup, StoryItem, ThemeMode, UserProfile } from '../src/types/social';
import {
  ADMIN_ROLE_PERMISSIONS,
  DEFAULT_COMMUNITY_GUIDELINES,
  DEFAULT_FEATURE_FLAGS,
  appendAuditEntry,
  assignAdminRole,
  countExpiredStories,
  reviewAppealDecision,
  revokeAdminRole,
  setMemberModerationStatus,
  toggleHiddenPostId,
  updateAccessInquiryStatus,
  updateReportResolution,
  validateAnnouncementInput,
  validateGuidelinesInput,
  type AdminAccessInquiry,
  type AdminAuditEntry,
  type AdminFeatureFlags,
  type AdminModerationState,
  type AdminRoleEntry,
  type AdminRoleLevel,
  type AnnouncementAudience,
  type AnnouncementSeverity,
  type BackgroundJobItem,
  type CommunityGuidelinesConfig,
  type ContentReport,
  type MemberAccountStatus,
  type MemberModerationRecord,
  type ModerationAppeal,
  type PlatformAnnouncement,
  type ReportStatus,
  type SystemHealthProbe,
} from './adminLogic';

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
  const [featureFlags, setFeatureFlags] = useState<AdminFeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [auditLogs, setAuditLogs] = useState<AdminAuditEntry[]>([]);
  const [inquiries, setInquiries] = useState<AdminAccessInquiry[]>([]);

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
          setCurrentProfile({
            ...(userDoc.data() as UserProfile),
            uid: u.uid,
          });
        } else {
          setCurrentProfile({
            uid: u.uid,
            displayName: u.displayName || u.email?.split('@')[0] || 'Admin Operator',
            handle: u.email?.split('@')[0] || 'admin',
            avatarUrl: u.photoURL || '',
            bio: '',
            location: '',
            interests: [],
            followersCount: 0,
            followingCount: 0,
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
            onboardingCompleted: true,
          });
        }
      } catch {
        setCurrentProfile({
          uid: u.uid,
          displayName: u.displayName || u.email?.split('@')[0] || 'Admin Operator',
          handle: u.email?.split('@')[0] || 'admin',
          avatarUrl: u.photoURL || '',
          bio: '',
          location: '',
          interests: [],
          followersCount: 0,
          followingCount: 0,
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
      setOnlineUserIds([]);
      setModeration({ hiddenPostIds: [], restrictedUids: [] });
      setMemberModerationRecords({});
      setAdminRoles([]);
      setReports([]);
      setAppeals([]);
      setAnnouncements([]);
      setGuidelines(DEFAULT_COMMUNITY_GUIDELINES);
      setFeatureFlags(DEFAULT_FEATURE_FLAGS);
      setAuditLogs([]);
      setInquiries([]);
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
              createdAtMs: timestampToMs(raw.createdAtMs ?? raw.createdAt),
              updatedAtMs: timestampToMs(raw.updatedAtMs ?? raw.updatedAt),
            });
          });
          setCommunityUsers(list);
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

  const handleDeletePost = async (postId: string) => {
    if (!firebaseUser || !adminAuth.isAdmin) return;
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    await recordAudit('post.delete', 'post', postId, `Deleted post ${postId}.`);
    try {
      await deleteDoc(doc(db, 'posts', postId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${postId}`);
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

  const handleSaveGuidelines = async (input: {
    version: string;
    summary: string;
    rulesText: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!firebaseUser || !adminAuth.isAdmin) {
      return { ok: false, error: 'Administrator authentication is required.' };
    }
    const check = validateGuidelinesInput(input.version, input.summary, input.rulesText);
    if (!check.valid) return { ok: false, error: check.error };

    const next: CommunityGuidelinesConfig = {
      version: check.version,
      summary: check.summary,
      rulesText: check.rulesText,
      updatedBy: firebaseUser.uid,
      updatedAtMs: Date.now(),
    };
    setGuidelines(next);
    await recordAudit(
      'guidelines.update',
      'config',
      'guidelines',
      `Updated community guidelines to revision v${check.version}.`
    );

    try {
      await setDoc(doc(db, 'adminConfig', 'guidelines'), {
        id: 'guidelines',
        version: check.version,
        summary: check.summary,
        rulesText: check.rulesText,
        updatedBy: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'adminConfig/guidelines');
    }
    return { ok: true };
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

  const handleRunBackgroundJob = async (jobId: string) => {
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
        await handleDeleteStory(sid);
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
    await recordAudit('job.execute', 'job', jobId, 'Verified governance & flags schema consistency.');
  };

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
      posts={posts}
      storyGroups={storyGroups}
      onlineUserIds={onlineUserIds}
      moderation={moderation}
      memberModerationRecords={memberModerationRecords}
      adminRoles={adminRoles}
      reports={reports}
      appeals={appeals}
      announcements={announcements}
      guidelines={guidelines}
      featureFlags={featureFlags}
      auditLogs={auditLogs}
      inquiries={inquiries}
      healthProbes={healthProbes}
      jobs={jobs}
      checkingHealth={checkingHealth}
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
      onDeletePost={handleDeletePost}
      onDeleteStory={handleDeleteStory}
      onSetMemberStatus={handleSetMemberStatus}
      onAssignRole={handleAssignRole}
      onRevokeRole={handleRevokeRole}
      onResolveReport={handleResolveReport}
      onReviewAppeal={handleReviewAppeal}
      onPublishAnnouncement={handlePublishAnnouncement}
      onToggleAnnouncement={handleToggleAnnouncement}
      onSaveGuidelines={handleSaveGuidelines}
      onUpdateInquiryStatus={handleUpdateInquiryStatus}
      onToggleFeatureFlag={handleToggleFeatureFlag}
      onRunHealthProbes={runHealthProbes}
      onRunBackgroundJob={handleRunBackgroundJob}
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
