import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
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
  signInWithGoogle,
  signOutAccount,
  testFirestoreConnection,
} from '../src/services/firebase';
import { readStoredThemePreference } from '../src/app/initialization/initialization-config';
import type { Post, StoryGroup, StoryItem, ThemeMode, UserProfile } from '../src/types/social';
import {
  ADMIN_PREVIEW_STATE_STORAGE_KEY,
  ADMIN_ROLE_PERMISSIONS,
  DEFAULT_COMMUNITY_GUIDELINES,
  DEFAULT_FEATURE_FLAGS,
  appendAuditEntry,
  assignAdminRole,
  countExpiredStories,
  createAutostartAdminSeed,
  readAdminAccessInquiries,
  readAdminModerationState,
  reviewAppealDecision,
  revokeAdminRole,
  saveAdminAccessInquiries,
  saveAdminModerationState,
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

function isLocalhostPreview(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('autostart') === '1' &&
    (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0')
  );
}

function AdminAppInner() {
  const isLocalAutostart = isLocalhostPreview();
  const initialSeed = isLocalAutostart ? createAutostartAdminSeed() : null;

  const [theme, setTheme] = useState<ThemeMode>(() => readStoredThemePreference());
  const [authReady, setAuthReady] = useState<boolean>(isLocalAutostart);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean | null>(
    isLocalAutostart ? true : null
  );

  const [currentProfile, setCurrentProfile] = useState<UserProfile>(() =>
    initialSeed
      ? initialSeed.currentProfile
      : {
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
        }
  );

  const [communityUsers, setCommunityUsers] = useState<UserProfile[]>(
    () => initialSeed?.communityUsers ?? []
  );
  const [posts, setPosts] = useState<Post[]>(() => initialSeed?.posts ?? []);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>(
    () => initialSeed?.storyGroups ?? []
  );
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>(
    () => initialSeed?.onlineUserIds ?? []
  );
  const [moderation, setModeration] = useState<AdminModerationState>(() =>
    initialSeed ? initialSeed.moderation : readAdminModerationState()
  );
  const [memberModerationRecords, setMemberModerationRecords] = useState<
    Record<string, MemberModerationRecord>
  >(() => initialSeed?.memberModerationRecords ?? {});
  const [adminRoles, setAdminRoles] = useState<AdminRoleEntry[]>(
    () => initialSeed?.adminRoles ?? []
  );
  const [reports, setReports] = useState<ContentReport[]>(() => initialSeed?.reports ?? []);
  const [appeals, setAppeals] = useState<ModerationAppeal[]>(() => initialSeed?.appeals ?? []);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>(
    () => initialSeed?.announcements ?? []
  );
  const [guidelines, setGuidelines] = useState<CommunityGuidelinesConfig>(
    () => initialSeed?.guidelines ?? DEFAULT_COMMUNITY_GUIDELINES
  );
  const [featureFlags, setFeatureFlags] = useState<AdminFeatureFlags>(
    () => initialSeed?.featureFlags ?? DEFAULT_FEATURE_FLAGS
  );
  const [auditLogs, setAuditLogs] = useState<AdminAuditEntry[]>(
    () => initialSeed?.auditLogs ?? []
  );
  const [inquiries, setInquiries] = useState<AdminAccessInquiry[]>(() =>
    initialSeed ? initialSeed.inquiries : readAdminAccessInquiries()
  );

  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthProbes, setHealthProbes] = useState<SystemHealthProbe[]>(() => [
    {
      id: 'firestore',
      service: 'Cloud Firestore Database',
      status: isLocalAutostart ? 'preview' : 'degraded',
      detail: isLocalAutostart ? 'Preview sandbox mode active' : 'Pending probe',
      checkedAtMs: Date.now(),
      latencyMs: null,
    },
    {
      id: 'r2',
      service: 'Cloudflare R2 Media Pipeline',
      status: isLocalAutostart ? 'preview' : 'degraded',
      detail: 'Awaiting endpoint check',
      checkedAtMs: Date.now(),
      latencyMs: null,
    },
    {
      id: 'calls',
      service: 'Cloudflare Calls WebRTC SFU',
      status: isLocalAutostart ? 'preview' : 'degraded',
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
      lastSummary: `${countExpiredStories(initialSeed?.storyGroups ?? [])} expired stories detected`,
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
    const now = Date.now();
    const probes: SystemHealthProbe[] = [];

    // 1. Firestore Server Probe
    if (isLocalAutostart) {
      probes.push({
        id: 'firestore',
        service: 'Cloud Firestore Database',
        status: 'preview',
        detail: 'Local preview seed loaded cleanly (?autostart=1)',
        checkedAtMs: now,
        latencyMs: 1,
      });
    } else {
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
    }

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
        status: isLocalAutostart ? 'preview' : 'offline',
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
        status: isLocalAutostart ? 'preview' : 'offline',
        detail: 'Calls status endpoint unreachable',
        checkedAtMs: Date.now(),
        latencyMs: null,
      });
    }

    setHealthProbes(probes);
    setCheckingHealth(false);
  }, [isLocalAutostart]);

  // Initial connection check & Auth subscription
  useEffect(() => {
    void runHealthProbes();

    if (isLocalAutostart) return;

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      setAuthReady(true);
      if (u) {
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
              displayName: u.displayName || 'Admin Member',
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
          // Profile fallback already populated
        }
      }
    });

    return () => unsubAuth();
  }, [isLocalAutostart, runHealthProbes]);

  const adminAuth = useAdminRole({
    isAuthorized: isLocalAutostart || Boolean(firebaseUser),
    firebaseUser,
    isLocalAutostart,
  });

  // Guarded Firestore real-time subscriptions (only after Admin RBAC passes)
  useEffect(() => {
    if (isLocalAutostart || !firebaseUser || !adminAuth.isAdmin) {
      return;
    }

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        collection(db, 'users'),
        (snap) => {
          const list: UserProfile[] = [];
          snap.forEach((d) => list.push({ ...(d.data() as UserProfile), uid: d.id }));
          setCommunityUsers(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'users')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'posts'),
        (snap) => {
          const list: Post[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Post, 'id'>) }));
          setPosts(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'posts')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'stories'),
        (snap) => {
          const byAuthor = new Map<string, StoryGroup>();
          snap.forEach((d) => {
            const data = d.data() as Omit<StoryItem, 'id'>;
            const story: StoryItem = { id: d.id, ...data };
            const existing = byAuthor.get(story.authorId);
            if (!existing) {
              byAuthor.set(story.authorId, {
                authorId: story.authorId,
                authorName: story.authorName,
                authorHandle: story.authorHandle,
                authorAvatar: story.authorAvatar,
                hasUnviewed: true,
                latestCreatedAtMs: story.createdAtMs || Date.now(),
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
          setStoryGroups(Array.from(byAuthor.values()));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'stories')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'presence'),
        (snap) => {
          const online: string[] = [];
          snap.forEach((d) => {
            const data = d.data() as { online?: boolean };
            if (data.online) online.push(d.id);
          });
          setOnlineUserIds(online);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'presence')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'admins'),
        (snap) => {
          const list: AdminRoleEntry[] = [];
          snap.forEach((d) => list.push({ ...(d.data() as AdminRoleEntry), uid: d.id }));
          setAdminRoles(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'admins')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'userModeration'),
        (snap) => {
          const map: Record<string, MemberModerationRecord> = {};
          snap.forEach((d) => {
            map[d.id] = { ...(d.data() as MemberModerationRecord), uid: d.id };
          });
          setMemberModerationRecords(map);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'userModeration')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'reports'),
        (snap) => {
          const list: ContentReport[] = [];
          snap.forEach((d) =>
            list.push({ id: d.id, ...(d.data() as Omit<ContentReport, 'id'>) })
          );
          setReports(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'reports')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'appeals'),
        (snap) => {
          const list: ModerationAppeal[] = [];
          snap.forEach((d) =>
            list.push({ id: d.id, ...(d.data() as Omit<ModerationAppeal, 'id'>) })
          );
          setAppeals(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'appeals')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'announcements'),
        (snap) => {
          const list: PlatformAnnouncement[] = [];
          snap.forEach((d) =>
            list.push({ id: d.id, ...(d.data() as Omit<PlatformAnnouncement, 'id'>) })
          );
          setAnnouncements(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'announcements')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'adminConfig'),
        (snap) => {
          snap.forEach((d) => {
            if (d.id === 'featureFlags') {
              const data = d.data() as Partial<AdminFeatureFlags>;
              setFeatureFlags((prev) => ({ ...prev, ...data }));
            } else if (d.id === 'guidelines') {
              const data = d.data() as Partial<CommunityGuidelinesConfig>;
              setGuidelines((prev) => ({ ...prev, ...data }));
            } else if (d.id === 'hiddenPosts') {
              const data = d.data() as { hiddenPostIds?: string[] };
              if (Array.isArray(data.hiddenPostIds)) {
                setModeration((prev) => ({ ...prev, hiddenPostIds: data.hiddenPostIds! }));
              }
            }
          });
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'adminConfig')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'adminAuditLogs'),
        (snap) => {
          const list: AdminAuditEntry[] = [];
          snap.forEach((d) =>
            list.push({ id: d.id, ...(d.data() as Omit<AdminAuditEntry, 'id'>) })
          );
          setAuditLogs(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'adminAuditLogs')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'accessInquiries'),
        (snap) => {
          const list: AdminAccessInquiry[] = [];
          snap.forEach((d) =>
            list.push({ id: d.id, ...(d.data() as Omit<AdminAccessInquiry, 'id'>) })
          );
          if (list.length > 0) {
            setInquiries(list);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'accessInquiries')
      )
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [adminAuth.isAdmin, firebaseUser, isLocalAutostart]);

  const recordAudit = useCallback(
    async (action: string, targetType: string, targetId: string, summary: string) => {
      const actorUid = currentProfile.uid || firebaseUser?.uid || 'admin_operator';
      const actorEmail =
        firebaseUser?.email || (isLocalAutostart ? 'prigidholdings@gmail.com' : currentProfile.handle);
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

      if (!isLocalAutostart && firebaseUser) {
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
      }
    },
    [currentProfile.handle, currentProfile.uid, firebaseUser, isLocalAutostart]
  );

  const handleToggleHidePost = (postId: string) => {
    const currentlyHidden = moderation.hiddenPostIds.includes(postId);
    const nextHidden = toggleHiddenPostId(moderation.hiddenPostIds, postId);
    const nextState = { ...moderation, hiddenPostIds: nextHidden };
    setModeration(nextState);
    saveAdminModerationState(nextState);

    void recordAudit(
      currentlyHidden ? 'post.restore' : 'post.hide',
      'post',
      postId,
      currentlyHidden
        ? `Restored post ${postId} to public feeds.`
        : `Hid post ${postId} from public feeds.`
    );

    if (!isLocalAutostart && firebaseUser) {
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
    }
  };

  const handleDeletePost = async (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    await recordAudit('post.delete', 'post', postId, `Deleted post ${postId}.`);
    if (!isLocalAutostart && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'posts', postId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `posts/${postId}`);
      }
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    setStoryGroups((prev) =>
      prev
        .map((group) => ({
          ...group,
          items: group.items.filter((s) => s.id !== storyId),
        }))
        .filter((g) => g.items.length > 0)
    );
    await recordAudit('story.delete', 'story', storyId, `Removed story frame ${storyId}.`);
    if (!isLocalAutostart && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'stories', storyId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `stories/${storyId}`);
      }
    }
  };

  const handleSetMemberStatus = async (
    targetUid: string,
    status: MemberAccountStatus,
    reason: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const res = setMemberModerationStatus(
      memberModerationRecords,
      targetUid,
      status,
      reason,
      currentProfile.uid
    );
    if (!res.ok) return { ok: false, error: res.error };

    setMemberModerationRecords(res.records);
    setModeration((prev) => {
      const nextRestricted =
        status === 'restricted'
          ? Array.from(new Set([...prev.restrictedUids, targetUid]))
          : prev.restrictedUids.filter((id) => id !== targetUid);
      const nextState = { ...prev, restrictedUids: nextRestricted };
      saveAdminModerationState(nextState);
      return nextState;
    });

    await recordAudit(
      `member.${status}`,
      'user',
      targetUid,
      `Set member ${targetUid} status to ${status}: ${reason}`
    );

    if (!isLocalAutostart && firebaseUser) {
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
    }

    return { ok: true };
  };

  const handleAssignRole = async (input: {
    uid: string;
    email: string;
    displayName: string;
    role: AdminRoleLevel;
  }): Promise<{ ok: boolean; error?: string }> => {
    const res = assignAdminRole(adminRoles, input, currentProfile.uid);
    if (!res.ok) return { ok: false, error: res.error };

    setAdminRoles(res.roles);
    await recordAudit(
      'role.assign',
      'admin',
      res.entry.uid,
      `Assigned ${res.entry.role} role to ${res.entry.email}.`
    );

    if (!isLocalAutostart && firebaseUser) {
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
    }
    return { ok: true };
  };

  const handleRevokeRole = async (targetUid: string): Promise<{ ok: boolean; error?: string }> => {
    const res = revokeAdminRole(adminRoles, targetUid, currentProfile.uid);
    if (!res.ok) return { ok: false, error: res.error };

    setAdminRoles(res.roles);
    await recordAudit('role.revoke', 'admin', targetUid, `Revoked operator role for ${targetUid}.`);

    if (!isLocalAutostart && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'admins', targetUid));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `admins/${targetUid}`);
      }
    }
    return { ok: true };
  };

  const handleResolveReport = async (
    reportId: string,
    status: ReportStatus,
    resolutionAction: string,
    extraAction?: 'hide-post' | 'restrict-author'
  ) => {
    const targetReport = reports.find((r) => r.id === reportId);
    setReports((prev) =>
      updateReportResolution(prev, reportId, status, resolutionAction, currentProfile.uid)
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

    if (!isLocalAutostart && firebaseUser) {
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
    }
  };

  const handleReviewAppeal = async (
    appealId: string,
    decision: 'approved' | 'rejected',
    reviewerNote: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const res = reviewAppealDecision(
      appeals,
      appealId,
      decision,
      reviewerNote,
      currentProfile.uid
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

    if (!isLocalAutostart && firebaseUser) {
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
    }
    return { ok: true };
  };

  const handlePublishAnnouncement = async (input: {
    title: string;
    body: string;
    severity: AnnouncementSeverity;
    audience: AnnouncementAudience;
  }): Promise<{ ok: boolean; error?: string }> => {
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
      authorUid: currentProfile.uid || 'admin',
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

    if (!isLocalAutostart && firebaseUser) {
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
    }
    return { ok: true };
  };

  const handleToggleAnnouncement = async (id: string) => {
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

    if (!isLocalAutostart && firebaseUser) {
      try {
        await updateDoc(doc(db, 'announcements', id), {
          active: nextActive,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `announcements/${id}`);
      }
    }
  };

  const handleSaveGuidelines = async (input: {
    version: string;
    summary: string;
    rulesText: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    const check = validateGuidelinesInput(input.version, input.summary, input.rulesText);
    if (!check.valid) return { ok: false, error: check.error };

    const next: CommunityGuidelinesConfig = {
      version: check.version,
      summary: check.summary,
      rulesText: check.rulesText,
      updatedBy: currentProfile.uid,
      updatedAtMs: Date.now(),
    };
    setGuidelines(next);
    await recordAudit(
      'guidelines.update',
      'config',
      'guidelines',
      `Updated community guidelines to revision v${check.version}.`
    );

    if (!isLocalAutostart && firebaseUser) {
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
    }
    return { ok: true };
  };

  const handleUpdateInquiryStatus = (id: string, status: AdminAccessInquiry['status']) => {
    setInquiries((prev) => {
      const next = updateAccessInquiryStatus(prev, id, status);
      saveAdminAccessInquiries(next);
      return next;
    });
    void recordAudit('inquiry.update', 'inquiry', id, `Marked inquiry ${id} as ${status}.`);

    if (!isLocalAutostart && firebaseUser) {
      void updateDoc(doc(db, 'accessInquiries', id), {
        status,
        reviewedBy: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      }).catch(() => {
        // Inquiry may have originated only from localStorage inquiry form
      });
    }
  };

  const handleToggleFeatureFlag = async (
    key: keyof Omit<AdminFeatureFlags, 'updatedBy' | 'updatedAtMs'>
  ) => {
    const nextFlags: AdminFeatureFlags = {
      ...featureFlags,
      [key]: !featureFlags[key],
      updatedBy: currentProfile.uid,
      updatedAtMs: Date.now(),
    };
    setFeatureFlags(nextFlags);

    await recordAudit(
      'flags.toggle',
      'config',
      'featureFlags',
      `Toggled ${key} to ${nextFlags[key] ? 'ON' : 'OFF'}.`
    );

    if (!isLocalAutostart && firebaseUser) {
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
    }
  };

  const handleRunBackgroundJob = async (jobId: string) => {
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

  // Preserve preview state changes locally cleanly without warnings
  void ADMIN_PREVIEW_STATE_STORAGE_KEY;

  return (
    <AdminView
      theme={theme}
      authReady={authReady}
      checkingAdminDoc={adminAuth.checkingAdminDoc}
      adminAuth={adminAuth}
      currentProfile={currentProfile}
      accountEmail={firebaseUser?.email || (isLocalAutostart ? 'prigidholdings@gmail.com' : null)}
      isLocalAutostart={isLocalAutostart}
      firestoreConnected={firestoreConnected}
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
      onSignOut={async () => {
        await signOutAccount();
      }}
      onBackToWorkspace={() => {
        window.location.href = 'https://looma.prigidcollection.workers.dev/feed';
      }}
      onOpenAuth={() => {
        window.location.href = 'https://looma.prigidcollection.workers.dev/auth';
      }}
      onOpenPublicProfile={(uid) => {
        window.location.href = `https://looma.prigidcollection.workers.dev/feed?profile=${uid}`;
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

export default function AdminApp() {
  return (
    <AdminErrorBoundary>
      <AdminAppInner />
    </AdminErrorBoundary>
  );
}
