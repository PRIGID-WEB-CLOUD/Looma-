import { useMemo, useState } from 'react';
import {
  Activity,
  FileWarning,
  Flag,
  LayoutDashboard,
  LogIn,
  LogOut,
  Megaphone,
  Moon,
  ShieldAlert,
  Sparkles,
  Send,
  Sun,
  Users,
} from 'lucide-react';
import { Avatar } from '../src/components/Avatar';
import { LoomaLogo } from '../src/components/LoomaLogo';
import type { Post, PostCategory, StoryGroup, ThemeMode, UserProfile } from '../src/types/social';
import {
  computeCategoryBreakdown,
  computeExtendedWorkspaceMetrics,
  filterAdminMembers,
  filterAdminPosts,
  type AdminAccessInquiry,
  type AdminAuditEntry,
  type AdminAuthorizationResult,
  type AdminFeatureFlags,
  type AdminMemberFilter,
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
import { OverviewAnalyticsSection } from './components/OverviewAnalyticsSection';
import { MembersRolesSection } from './components/MembersRolesSection';
import { UsersDirectorySection } from './components/UsersDirectorySection';
import { ContentModerationSection } from './components/ContentModerationSection';
import { ReportsAppealsSection } from './components/ReportsAppealsSection';
import { GovernanceSection } from './components/GovernanceSection';
import { SystemOpsSection } from './components/SystemOpsSection';
import { AdminPublisherSection } from './components/AdminPublisherSection';

export type AdminSectionId =
  | 'overview'
  | 'members'
  | 'users'
  | 'publisher'
  | 'moderation'
  | 'reports'
  | 'governance'
  | 'system';

interface AdminViewProps {
  theme: ThemeMode;
  authReady: boolean;
  checkingAdminDoc: boolean;
  adminAuth: AdminAuthorizationResult;
  currentProfile: UserProfile;
  accountEmail: string | null;
  firestoreConnected: boolean | null;
  syncErrors?: Record<string, string>;
  authError: string | null;
  communityUsers: UserProfile[];
  posts: Post[];
  storyGroups: StoryGroup[];
  onlineUserIds: string[];
  moderation: AdminModerationState;
  memberModerationRecords: Record<string, MemberModerationRecord>;
  adminRoles: AdminRoleEntry[];
  reports: ContentReport[];
  appeals: ModerationAppeal[];
  announcements: PlatformAnnouncement[];
  guidelines: CommunityGuidelinesConfig;
  featureFlags: AdminFeatureFlags;
  auditLogs: AdminAuditEntry[];
  inquiries: AdminAccessInquiry[];
  healthProbes: SystemHealthProbe[];
  jobs: BackgroundJobItem[];
  checkingHealth: boolean;
  onSetTheme: (theme: ThemeMode) => void;
  onSignInGoogle: () => Promise<void>;
  onSignInEmail?: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onToggleHidePost: (postId: string) => void;
  onDeletePost: (postId: string) => Promise<void>;
  onDeleteStory: (storyId: string) => Promise<void>;
  onSetMemberStatus: (
    targetUid: string,
    status: MemberAccountStatus,
    reason: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onAssignRole: (input: {
    uid: string;
    email: string;
    displayName: string;
    role: AdminRoleLevel;
  }) => Promise<{ ok: boolean; error?: string }>;
  onRevokeRole: (uid: string) => Promise<{ ok: boolean; error?: string }>;
  onResolveReport: (
    reportId: string,
    status: ReportStatus,
    resolutionAction: string,
    extraAction?: 'hide-post' | 'restrict-author'
  ) => Promise<void>;
  onReviewAppeal: (
    appealId: string,
    decision: 'approved' | 'rejected',
    reviewerNote: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onPublishAnnouncement: (input: {
    title: string;
    body: string;
    severity: AnnouncementSeverity;
    audience: AnnouncementAudience;
  }) => Promise<{ ok: boolean; error?: string }>;
  onToggleAnnouncement: (id: string) => Promise<void>;
  onSaveGuidelines: (input: {
    version: string;
    summary: string;
    rulesText: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onUpdateInquiryStatus: (id: string, status: AdminAccessInquiry['status']) => void;
  onToggleFeatureFlag: (
    key: keyof Omit<AdminFeatureFlags, 'updatedBy' | 'updatedAtMs'>
  ) => Promise<void>;
  onRunHealthProbes: () => Promise<void>;
  onRunBackgroundJob: (jobId: string) => Promise<void>;
  onToggleVerify?: (
    targetUid: string,
    isVerified: boolean
  ) => Promise<{ ok: boolean; error?: string }>;
  onPublishPost: (input: {
    caption: string;
    category: PostCategory;
    imageUrl: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

const SECTION_NAV: Array<{
  id: AdminSectionId;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Overview & Analytics', icon: LayoutDashboard },
  { id: 'publisher', label: 'Publisher Hub', icon: Sparkles },
  { id: 'members', label: 'Team & Roles', icon: ShieldAlert },
  { id: 'users', label: 'Community Users', icon: Users },
  { id: 'moderation', label: 'Feed & Stories', icon: FileWarning },
  { id: 'reports', label: 'Reports & Appeals', icon: Flag },
  { id: 'governance', label: 'Governance & Policy', icon: Megaphone },
  { id: 'system', label: 'System, Flags & Audit', icon: Activity },
];

export function AdminView({
  theme,
  authReady,
  checkingAdminDoc,
  adminAuth,
  currentProfile,
  accountEmail,
  firestoreConnected,
  syncErrors = {},
  authError,
  communityUsers,
  posts,
  storyGroups,
  onlineUserIds,
  moderation,
  memberModerationRecords,
  adminRoles,
  reports,
  appeals,
  announcements,
  guidelines,
  featureFlags,
  auditLogs,
  inquiries,
  healthProbes,
  jobs,
  checkingHealth,
  onSetTheme,
  onSignInGoogle,
  onSignInEmail,
  onSignOut,
  onToggleHidePost,
  onDeletePost,
  onDeleteStory,
  onSetMemberStatus,
  onAssignRole,
  onRevokeRole,
  onResolveReport,
  onReviewAppeal,
  onPublishAnnouncement,
  onToggleAnnouncement,
  onSaveGuidelines,
  onUpdateInquiryStatus,
  onToggleFeatureFlag,
  onRunHealthProbes,
  onRunBackgroundJob,
  onToggleVerify,
  onPublishPost,
}: AdminViewProps) {
  const [section, setSection] = useState<AdminSectionId>('overview');
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [adminLoginEmail, setAdminLoginEmail] = useState('');
  const [adminLoginPassword, setAdminLoginPassword] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState<AdminMemberFilter>('all');
  const [postSearch, setPostSearch] = useState('');
  const [postCategory, setPostCategory] = useState<'All' | PostCategory | 'Hidden'>('All');

  const allMembers = useMemo(() => {
    const byUid = new Map<string, UserProfile>();
    if (currentProfile.uid) {
      byUid.set(currentProfile.uid, currentProfile);
    }
    for (const user of communityUsers) {
      if (user.uid) {
        byUid.set(user.uid, user);
      }
    }
    return Array.from(byUid.values());
  }, [communityUsers, currentProfile]);

  const metrics = useMemo(
    () =>
      computeExtendedWorkspaceMetrics({
        currentProfile,
        communityUsers,
        posts,
        storyGroups,
        onlineUserIds,
        moderation,
        memberModerationRecords,
        inquiries,
        reports,
        appeals,
        announcements,
        adminRoles,
      }),
    [
      adminRoles,
      announcements,
      appeals,
      communityUsers,
      currentProfile,
      inquiries,
      memberModerationRecords,
      moderation,
      onlineUserIds,
      posts,
      reports,
      storyGroups,
    ]
  );

  const categoryBreakdown = useMemo(() => computeCategoryBreakdown(posts), [posts]);

  const suspendedUids = useMemo(
    () =>
      Object.values(memberModerationRecords)
        .filter((r) => r.status === 'suspended')
        .map((r) => r.uid),
    [memberModerationRecords]
  );

  const restrictedUidsCombined = useMemo(
    () =>
      Array.from(
        new Set([
          ...moderation.restrictedUids,
          ...Object.values(memberModerationRecords)
            .filter((r) => r.status === 'restricted')
            .map((r) => r.uid),
        ])
      ),
    [memberModerationRecords, moderation.restrictedUids]
  );

  const adminUids = useMemo(() => adminRoles.map((r) => r.uid), [adminRoles]);

  const filteredMembers = useMemo(
    () =>
      filterAdminMembers(
        allMembers,
        memberSearch,
        memberFilter,
        onlineUserIds,
        restrictedUidsCombined,
        suspendedUids,
        adminUids
      ),
    [
      adminUids,
      allMembers,
      memberFilter,
      memberSearch,
      onlineUserIds,
      restrictedUidsCombined,
      suspendedUids,
    ]
  );

  const filteredPosts = useMemo(
    () => filterAdminPosts(posts, postSearch, postCategory, moderation.hiddenPostIds),
    [moderation.hiddenPostIds, postCategory, postSearch, posts]
  );

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);
  const hiddenSet = useMemo(() => new Set(moderation.hiddenPostIds), [moderation.hiddenPostIds]);
  const restrictedSet = useMemo(
    () => new Set(restrictedUidsCombined),
    [restrictedUidsCombined]
  );

  // Loading state while verifying session or /admins/{uid}
  if (!authReady || checkingAdminDoc) {
    return (
      <div
        data-testid="admin-loading"
        className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6"
      >
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <LoomaLogo />
          <div className="space-y-2">
            <div className="h-4 w-48 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
            <div className="h-3 w-72 rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
          </div>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
            Verifying administrator credentials...
          </p>
        </div>
      </div>
    );
  }

  // Signed-out or unauthorized Admin Gate
  if (!adminAuth.isAdmin) {
    const isUnauthenticated = adminAuth.reason === 'unauthenticated';
    return (
      <div
        data-testid="admin-access-denied"
        className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors looma-stage-enter"
      >
        <header className="h-16 px-4 md:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LoomaLogo />
            <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-800 text-[11px] font-mono font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Admin Console
            </span>
          </div>

          <button
            type="button"
            onClick={() => onSetTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 md:p-8">
          <section className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-mono uppercase font-semibold text-amber-700 dark:text-amber-300">
                  Restricted Administrator Console
                </p>
                <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                  {isUnauthenticated
                    ? 'Sign in with an administrator account'
                    : 'Administrator role required'}
                </h1>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {isUnauthenticated
                ? 'Authenticate with an allowlisted or assigned Looma operator Google account to access moderation queues, user governance, feature flags, and audit logs.'
                : adminAuth.reason === 'unverified'
                  ? 'Your account email must be verified before administrator privileges can be checked.'
                  : `Signed in as ${accountEmail || currentProfile.displayName} (@${currentProfile.handle}). This console is restricted to authorized workspace administrators.`}
            </p>

            {authError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300"
              >
                {authError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {isUnauthenticated ? (
                <>
                  <button
                    type="button"
                    onClick={() => void onSignInGoogle()}
                    className="min-h-[44px] px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" aria-hidden="true" />
                    <span>Sign in with Google</span>
                  </button>
                  {onSignInEmail && (
                    <button
                      type="button"
                      onClick={() => setShowEmailLogin((prev) => !prev)}
                      className="min-h-[44px] px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {showEmailLogin ? 'Hide Email Sign In' : 'Use Email & Password'}
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  className="min-h-[44px] px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
                >
                  Sign Out &amp; Switch Account
                </button>
              )}
            </div>

            {isUnauthenticated && onSignInEmail && showEmailLogin && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!adminLoginEmail.trim() || !adminLoginPassword) return;
                  setEmailSubmitting(true);
                  try {
                    await onSignInEmail(adminLoginEmail.trim(), adminLoginPassword);
                  } finally {
                    setEmailSubmitting(false);
                  }
                }}
                className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div>
                  <label
                    htmlFor="admin-login-email"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Operator Email
                  </label>
                  <input
                    id="admin-login-email"
                    type="email"
                    required
                    value={adminLoginEmail}
                    onChange={(e) => setAdminLoginEmail(e.target.value)}
                    placeholder="operator@studio.com"
                    className="w-full min-h-[42px] px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="admin-login-password"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Password
                  </label>
                  <input
                    id="admin-login-password"
                    type="password"
                    required
                    value={adminLoginPassword}
                    onChange={(e) => setAdminLoginPassword(e.target.value)}
                    placeholder="Enter operator password"
                    className="w-full min-h-[42px] px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={emailSubmitting}
                  className="w-full min-h-[42px] px-4 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-blue-600 dark:hover:bg-blue-500 dark:hover:text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
                >
                  {emailSubmitting ? 'Signing in...' : 'Sign In to Admin Console'}
                </button>
              </form>
            )}
          </section>
        </main>
      </div>
    );
  }

  const activeSectionMeta = SECTION_NAV.find((item) => item.id === section)!;
  const accountLabel = `Operator: ${accountEmail || currentProfile.handle}`;

  return (
    <div
      data-testid="admin-dashboard"
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row transition-colors looma-stage-enter"
    >
      {/* Desktop Sidebar (256px) */}
      <aside
        aria-label="Admin console sections"
        className="hidden lg:flex lg:w-64 shrink-0 flex-col justify-between border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <LoomaLogo />
          </div>

          <nav className="space-y-1">
            {SECTION_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === section;
              const badgeCount =
                item.id === 'reports'
                  ? metrics.openReports + metrics.pendingAppeals
                  : item.id === 'governance'
                    ? metrics.pendingInquiries
                    : 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setSection(item.id)}
                  className={`w-full min-h-[40px] px-3 rounded-lg flex items-center justify-between text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                  {badgeCount > 0 && (
                    <span className="font-mono text-[11px] tabular-nums text-blue-600 dark:text-blue-400">
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar src={currentProfile.avatarUrl} name={currentProfile.displayName} size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {currentProfile.displayName}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {accountEmail || `@${currentProfile.handle}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onSignOut()}
            className="w-full min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar: Breadcrumbs Left + Admin Actions Right */}
        <header className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md">
          <div className="h-16 px-4 md:px-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
              <span className="font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                Looma Admin
              </span>
              <span className="text-slate-400 shrink-0" aria-hidden="true">
                /
              </span>
              <span className="font-display font-bold text-slate-900 dark:text-white truncate">
                {activeSectionMeta.label}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="lg:hidden min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
              <button
                type="button"
                onClick={() => onSetTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Moon className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Section Navigation */}
          <nav
            aria-label="Admin sections mobile"
            className="lg:hidden px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto"
          >
            {SECTION_NAV.map((item) => {
              const isActive = item.id === section;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </header>

        {/* Contextual Banner: Maintenance Mode, Offline Connection, or Firestore Sync Warnings */}
        {(featureFlags.maintenanceMode ||
          firestoreConnected === false ||
          Object.keys(syncErrors).length > 0) && (
          <div className="px-4 md:px-8 pt-4 max-w-6xl w-full mx-auto space-y-2">
            {featureFlags.maintenanceMode && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                Maintenance Mode flag is ON — member feeds display a scheduled maintenance banner.
              </div>
            )}
            {firestoreConnected === false && (
              <div className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-2.5 text-xs font-medium text-red-700 dark:text-red-300">
                Unable to reach Firestore server telemetry check. Verify network connectivity.
              </div>
            )}
            {Object.keys(syncErrors).length > 0 && (
              <div
                role="alert"
                className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-2.5 text-xs font-medium text-red-700 dark:text-red-300"
              >
                Firestore permission or sync issue on{' '}
                <span className="font-mono font-semibold">
                  {Object.keys(syncErrors).join(', ')}
                </span>
                : {Object.values(syncErrors)[0]}
              </div>
            )}
          </div>
        )}

        <main className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto space-y-6">
          {section === 'overview' && (
            <OverviewAnalyticsSection
              metrics={metrics}
              categoryBreakdown={categoryBreakdown}
              posts={posts}
              hiddenSet={hiddenSet}
              announcements={announcements}
              accountLabel={accountLabel}
              onNavigateSection={setSection}
            />
          )}

          {section === 'publisher' && (
            <AdminPublisherSection
              currentProfile={currentProfile}
              onPublishPost={onPublishPost}
              onPublishAnnouncement={onPublishAnnouncement}
            />
          )}

          {section === 'members' && (
            <MembersRolesSection
              currentAdminUid={currentProfile.uid}
              members={filteredMembers}
              memberSearch={memberSearch}
              memberFilter={memberFilter}
              onlineSet={onlineSet}
              restrictedSet={restrictedSet}
              moderationRecords={memberModerationRecords}
              adminRoles={adminRoles}
              onChangeSearch={setMemberSearch}
              onChangeFilter={setMemberFilter}
              onSetMemberStatus={onSetMemberStatus}
              onAssignRole={onAssignRole}
              onRevokeRole={onRevokeRole}
            />
          )}

          {section === 'users' && (
            <UsersDirectorySection
              currentAdminUid={currentProfile.uid}
              communityUsers={communityUsers}
              onlineUserIds={onlineUserIds}
              restrictedSet={restrictedSet}
              moderationRecords={memberModerationRecords}
              onSetMemberStatus={onSetMemberStatus}
              onToggleVerify={onToggleVerify}
            />
          )}

          {section === 'moderation' && (
            <ContentModerationSection
              posts={filteredPosts}
              storyGroups={storyGroups}
              hiddenSet={hiddenSet}
              postSearch={postSearch}
              postCategory={postCategory}
              onChangePostSearch={setPostSearch}
              onChangePostCategory={setPostCategory}
              onToggleHidePost={onToggleHidePost}
              onDeletePost={onDeletePost}
              onDeleteStory={onDeleteStory}
            />
          )}

          {section === 'reports' && (
            <ReportsAppealsSection
              reports={reports}
              appeals={appeals}
              onResolveReport={onResolveReport}
              onReviewAppeal={onReviewAppeal}
            />
          )}

          {section === 'governance' && (
            <GovernanceSection
              announcements={announcements}
              guidelines={guidelines}
              inquiries={inquiries}
              onPublishAnnouncement={onPublishAnnouncement}
              onToggleAnnouncement={onToggleAnnouncement}
              onSaveGuidelines={onSaveGuidelines}
              onUpdateInquiryStatus={onUpdateInquiryStatus}
            />
          )}

          {section === 'system' && (
            <SystemOpsSection
              featureFlags={featureFlags}
              auditLogs={auditLogs}
              healthProbes={healthProbes}
              jobs={jobs}
              checkingHealth={checkingHealth}
              onToggleFlag={onToggleFeatureFlag}
              onRunHealthProbes={onRunHealthProbes}
              onRunBackgroundJob={onRunBackgroundJob}
            />
          )}
        </main>
      </div>
    </div>
  );
}
