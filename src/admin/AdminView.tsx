import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  FileWarning,
  LayoutDashboard,
  Lock,
  Moon,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Trash2,
  Users,
} from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { LoomaLogo } from '../components/LoomaLogo';
import type { AccessInquiry } from '../landingpage/landingData';
import type { Post, PostCategory, StoryGroup, ThemeMode, UserProfile } from '../types/social';
import { formatRelativeTime, POST_CATEGORIES } from '../utils/socialLogic';
import {
  ADMIN_EMAILS,
  computeWorkspaceMetrics,
  filterAdminMembers,
  filterAdminPosts,
  type AdminAuthorizationResult,
  type AdminMemberFilter,
  type AdminModerationState,
} from './adminLogic';

export type AdminSectionId = 'overview' | 'members' | 'moderation' | 'security';

interface AdminViewProps {
  theme: ThemeMode;
  adminAuth: AdminAuthorizationResult;
  currentProfile: UserProfile;
  accountEmail: string | null;
  isLocalAutostart: boolean;
  communityUsers: UserProfile[];
  posts: Post[];
  storyGroups: StoryGroup[];
  onlineUserIds: string[];
  moderation: AdminModerationState;
  inquiries: AccessInquiry[];
  onSetTheme: (theme: ThemeMode) => void;
  onBackToWorkspace: () => void;
  onOpenAuth: () => void;
  onOpenPublicProfile: (uid: string) => void;
  onToggleHidePost: (postId: string) => void;
  onDeletePost: (postId: string) => Promise<void>;
  onToggleRestrictMember: (uid: string) => void;
  onUpdateInquiryStatus: (id: string, status: AccessInquiry['status']) => void;
}

const SECTION_NAV: Array<{
  id: AdminSectionId;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'moderation', label: 'Feed Moderation', icon: FileWarning },
  { id: 'security', label: 'Access & Inquiries', icon: ShieldCheck },
];

export function AdminView({
  theme,
  adminAuth,
  currentProfile,
  accountEmail,
  isLocalAutostart,
  communityUsers,
  posts,
  storyGroups,
  onlineUserIds,
  moderation,
  inquiries,
  onSetTheme,
  onBackToWorkspace,
  onOpenAuth,
  onOpenPublicProfile,
  onToggleHidePost,
  onDeletePost,
  onToggleRestrictMember,
  onUpdateInquiryStatus,
}: AdminViewProps) {
  const [section, setSection] = useState<AdminSectionId>('overview');
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
      computeWorkspaceMetrics({
        currentProfile,
        communityUsers,
        posts,
        storyGroups,
        onlineUserIds,
        moderation,
        inquiries,
      }),
    [
      communityUsers,
      currentProfile,
      inquiries,
      moderation,
      onlineUserIds,
      posts,
      storyGroups,
    ]
  );

  const filteredMembers = useMemo(
    () =>
      filterAdminMembers(
        allMembers,
        memberSearch,
        memberFilter,
        onlineUserIds,
        moderation.restrictedUids
      ),
    [allMembers, memberFilter, memberSearch, moderation.restrictedUids, onlineUserIds]
  );

  const filteredPosts = useMemo(
    () =>
      filterAdminPosts(
        posts,
        postSearch,
        postCategory,
        moderation.hiddenPostIds
      ),
    [moderation.hiddenPostIds, postCategory, postSearch, posts]
  );

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);
  const hiddenSet = useMemo(
    () => new Set(moderation.hiddenPostIds),
    [moderation.hiddenPostIds]
  );
  const restrictedSet = useMemo(
    () => new Set(moderation.restrictedUids),
    [moderation.restrictedUids]
  );

  // Restricted Admin Gate (authenticated non-admin or unverified email)
  if (!adminAuth.isAdmin) {
    return (
      <div
        data-testid="admin-access-denied"
        className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors looma-stage-enter"
      >
        <header className="h-16 px-4 md:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToWorkspace}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Workspace</span>
            </button>
            <LoomaLogo />
          </div>

          <button
            type="button"
            onClick={() => onSetTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 md:p-8">
          <section className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  Restricted Administrator Console
                </p>
                <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                  Administrator role required
                </h1>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {adminAuth.reason === 'unverified'
                ? 'Your account email must be verified before administrator privileges can be checked.'
                : `Signed in as ${accountEmail || currentProfile.displayName} (@${currentProfile.handle}). This console is restricted to authorized workspace administrators.`}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onBackToWorkspace}
                className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
              >
                Return to Member Feed
              </button>
              <button
                type="button"
                onClick={onOpenAuth}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Switch Account
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const activeSectionMeta = SECTION_NAV.find((item) => item.id === section)!;

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
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setSection(item.id)}
                  className={`w-full min-h-[42px] px-3 rounded-xl flex items-center justify-between text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'security' && metrics.pendingInquiries > 0 && (
                    <span className="font-mono text-[11px] tabular-nums text-blue-600 dark:text-blue-400">
                      {metrics.pendingInquiries}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar
              src={currentProfile.avatarUrl}
              name={currentProfile.displayName}
              size="sm"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {currentProfile.displayName}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {accountEmail || (isLocalAutostart ? 'Local Preview Admin' : `@${currentProfile.handle}`)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToWorkspace}
            className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Back to Member Feed</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar with Contextual Breadcrumbs + Primary Action */}
        <header className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md">
          <div className="h-16 px-4 md:px-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
              <button
                type="button"
                onClick={onBackToWorkspace}
                className="lg:hidden min-h-[38px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>App</span>
              </button>
              <span className="font-semibold text-slate-500 dark:text-slate-400 truncate">
                Looma Admin
              </span>
              <span className="text-slate-400" aria-hidden="true">
                /
              </span>
              <span className="font-display font-bold text-slate-900 dark:text-white truncate">
                {activeSectionMeta.label}
              </span>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onBackToWorkspace}
                className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Open Member Feed
              </button>
              <button
                type="button"
                onClick={() => onSetTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label={
                  theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
                }
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
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

        <main className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto space-y-6">
          {section === 'overview' && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                    Workspace Overview
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    Real-time counts across verified members, posts, active stories, and workspace inquiries.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  {adminAuth.reason === 'ok-local-preview'
                    ? 'Auth: Local Preview Admin'
                    : `Auth: ${accountEmail || currentProfile.handle}`}
                </span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Known Members
                  </p>
                  <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                    {metrics.totalMembers}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                    {metrics.onlineMembers} online · {metrics.restrictedMembers} restricted
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Feed Posts
                  </p>
                  <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                    {metrics.totalPosts}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                    {metrics.hiddenPosts} hidden from feed
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Active Stories
                  </p>
                  <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                    {metrics.activeStoryAuthors}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    24-hour story streams
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Pending Inquiries
                  </p>
                  <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                    {metrics.pendingInquiries}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    From public landing page
                  </p>
                </div>
              </div>

              {/* Protected Workspace Access Summary */}
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      Protected Workspace Access Enforcement
                    </h2>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Active
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Unauthenticated visitors are kept on the public Landing Page (/) and Legal
                  routes (/terms, /privacy, /guidelines). Navigating to /feed, /messages,
                  /settings, /profile, or /admin without an authenticated member session
                  redirects immediately to the Auth Page (/auth).
                </p>
              </section>

              {/* Recent Posts Table */}
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Recent Feed Submissions
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSection('moderation')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Moderate all
                  </button>
                </div>
                {posts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No member posts have been published yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                          <th className="py-3 px-6 font-semibold">Author</th>
                          <th className="py-3 px-4 font-semibold">Category</th>
                          <th className="py-3 px-4 font-semibold">Excerpt</th>
                          <th className="py-3 px-4 font-semibold text-right">Engagement</th>
                          <th className="py-3 px-6 font-semibold text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {posts.slice(0, 5).map((post) => {
                          const isHidden = hiddenSet.has(post.id);
                          return (
                            <tr
                              key={post.id}
                              className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                            >
                              <td className="py-3 px-6 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                                {post.authorName}
                              </td>
                              <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                {post.category}
                              </td>
                              <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                                {post.caption || 'Media attachment'}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                                {post.likesCount} likes · {post.commentsCount} comments
                              </td>
                              <td className="py-3 px-6 text-right whitespace-nowrap">
                                <span
                                  className={`text-xs font-semibold ${
                                    isHidden
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  {isHidden ? 'Hidden' : 'Visible'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {section === 'members' && (
            <section className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                    Member Directory
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    Inspect verified member profiles, online status, and workspace posting restrictions.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search
                      className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      aria-label="Search members"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search name or @handle"
                      className="min-h-[40px] pl-9 pr-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    {(['all', 'online', 'onboarded', 'restricted'] as AdminMemberFilter[]).map(
                      (mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setMemberFilter(mode)}
                          className={`min-h-[32px] px-3 rounded-lg text-xs font-semibold capitalize cursor-pointer whitespace-nowrap ${
                            memberFilter === mode
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {mode}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                {filteredMembers.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No members match the active search or filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                          <th className="py-3 px-6 font-semibold">Member</th>
                          <th className="py-3 px-4 font-semibold">Location</th>
                          <th className="py-3 px-4 font-semibold">Status</th>
                          <th className="py-3 px-4 font-semibold text-right">Followers</th>
                          <th className="py-3 px-6 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredMembers.map((member) => {
                          const isOnline = onlineSet.has(member.uid);
                          const isRestricted = restrictedSet.has(member.uid);
                          const isSelf = member.uid === currentProfile.uid;
                          return (
                            <tr
                              key={member.uid}
                              className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                            >
                              <td className="py-3 px-6">
                                <div className="flex items-center gap-3 min-w-0">
                                  <Avatar
                                    src={member.avatarUrl}
                                    name={member.displayName}
                                    size="sm"
                                    online={isOnline}
                                  />
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                                      {member.displayName}
                                      {isSelf ? ' (You)' : ''}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                      @{member.handle}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                {member.location || 'Looma Community'}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <span
                                  className={`text-xs font-semibold ${
                                    isRestricted
                                      ? 'text-red-600 dark:text-red-400'
                                      : isOnline
                                        ? 'text-emerald-700 dark:text-emerald-400'
                                        : 'text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  {isRestricted
                                    ? 'Restricted'
                                    : isOnline
                                      ? 'Online'
                                      : 'Active Member'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                                {member.followersCount}
                              </td>
                              <td className="py-3 px-6 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onOpenPublicProfile(member.uid)}
                                    className="min-h-[34px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                  >
                                    Inspect
                                  </button>
                                  {!isSelf && (
                                    <button
                                      type="button"
                                      onClick={() => onToggleRestrictMember(member.uid)}
                                      className={`min-h-[34px] px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                                        isRestricted
                                          ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                          : 'border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40'
                                      }`}
                                    >
                                      {isRestricted ? 'Restore' : 'Restrict'}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          {section === 'moderation' && (
            <section className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                    Feed Moderation
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    Hide or restore feed entries immediately across member feeds.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search
                      className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      aria-label="Search posts for moderation"
                      value={postSearch}
                      onChange={(e) => setPostSearch(e.target.value)}
                      placeholder="Search caption or author"
                      className="min-h-[40px] pl-9 pr-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <select
                    aria-label="Filter posts by category"
                    value={postCategory}
                    onChange={(e) =>
                      setPostCategory(e.target.value as 'All' | PostCategory | 'Hidden')
                    }
                    className="min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="All">All Categories</option>
                    <option value="Hidden">Hidden Only</option>
                    {POST_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPosts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No posts match the current moderation filter.
                  </div>
                ) : (
                  filteredPosts.map((post) => {
                    const isHidden = hiddenSet.has(post.id);
                    const isOwnPost = post.authorId === currentProfile.uid;
                    return (
                      <article
                        key={post.id}
                        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {post.authorName}
                            </span>
                            <span>@{post.authorHandle}</span>
                            <span aria-hidden="true">·</span>
                            <span>{post.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {formatRelativeTime(post.createdAtMs)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={`font-semibold ${
                                isHidden
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {isHidden ? 'Hidden from Feed' : 'Live'}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 max-w-[68ch]">
                            {post.caption || post.mediaTitle || 'Media post'}
                          </p>
                          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                            {post.likesCount} likes · {post.commentsCount} comments
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onToggleHidePost(post.id)}
                            className="min-h-[38px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            {isHidden ? (
                              <>
                                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Restore Post</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Hide Post</span>
                              </>
                            )}
                          </button>

                          {isOwnPost && (
                            <button
                              type="button"
                              onClick={() => void onDeletePost(post.id)}
                              aria-label={`Delete post by ${post.authorName}`}
                              className="min-h-[38px] px-3 rounded-xl border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {section === 'security' && (
            <section className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  Access Policy &amp; Studio Inquiries
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Review protected workspace routes, verified administrators, and incoming landing page inquiries.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Protected Route Gates
                  </h2>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                    <li className="py-2.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-700 dark:text-slate-300">/feed, /connections</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        Verified Member Auth
                      </span>
                    </li>
                    <li className="py-2.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-700 dark:text-slate-300">/messages</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        Verified Member + Participant
                      </span>
                    </li>
                    <li className="py-2.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-700 dark:text-slate-300">/settings</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        Owner Session Only
                      </span>
                    </li>
                    <li className="py-2.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-700 dark:text-slate-300">/admin</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        Verified Admin Role
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Verified Admin Allowlist
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Access requires both Firebase email verification and either an explicit
                    <code className="mx-1 font-mono">/admins/{'{uid}'}</code> record or a
                    verified allowlisted operator email:
                  </p>
                  <ul className="space-y-2 text-xs font-mono text-slate-800 dark:text-slate-200">
                    {ADMIN_EMAILS.map((addr) => (
                      <li
                        key={addr}
                        className="flex items-center gap-2 py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                      >
                        <CheckCircle2
                          className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{addr}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Landing Page Workspace Inquiries
                  </h2>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {inquiries.length} total
                  </span>
                </div>

                {inquiries.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No studio access inquiries submitted from the Landing Page yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {inquiries.map((inq) => (
                      <div
                        key={inq.id}
                        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {inq.fullName}
                            </span>
                            <span>{inq.email}</span>
                            <span aria-hidden="true">·</span>
                            <span>{inq.organization}</span>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize font-semibold text-blue-600 dark:text-blue-400">
                              {inq.status}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-300">
                            {inq.note}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onUpdateInquiryStatus(inq.id, 'approved')}
                            className="min-h-[34px] px-3 rounded-lg border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateInquiryStatus(inq.id, 'archived')}
                            className="min-h-[34px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            Archive
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
