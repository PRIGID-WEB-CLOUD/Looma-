import { useMemo, useRef, useState } from 'react';
import {
  Activity,
  Award,
  ChevronDown,
  ExternalLink,
  FileWarning,
  Flag,
  FolderKanban,
  Hash,
  LayoutDashboard,
  LogIn,
  LogOut,
  Megaphone,
  Menu,
  MessagesSquare,
  Moon,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Sun,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { Avatar } from '../src/components/Avatar';
import { LoomaLogo } from '../src/components/LoomaLogo';
import { VerifiedBadge } from '../src/components/VerifiedBadge';
import type { ChatThread, Post, PostCategory, PostCategoryRecord, StoryGroup, ThemeMode, UserProfile } from '../src/types/social';
import type {
  MarketplaceOrder,
  MarketplaceProduct,
  MarketplaceStore,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  StorePublishStatus,
} from '../src/types/marketplace';
import type { LegalDocId } from '../src/utils/legalLogic';
import {
  computeCategoryBreakdown,
  computeExtendedWorkspaceMetrics,
  filterAdminMembers,
  filterAdminPosts,
  type AdminAccessInquiry,
  type AdminAuditEntry,
  type AdminAuthorizationResult,
  type AdminCallRoomSummary,
  type AdminCommentItem,
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
import { OverviewAnalyticsSection } from './components/OverviewAnalyticsSection';
import { TeamRolesSection } from './components/TeamRolesSection';
import { UsersDirectorySection } from './components/UsersDirectorySection';
import { ContentModerationSection } from './components/ContentModerationSection';
import { ReportsAppealsSection } from './components/ReportsAppealsSection';
import { GovernanceSection } from './components/GovernanceSection';
import { SystemOpsSection } from './components/SystemOpsSection';
import { AdminPublisherSection } from './components/AdminPublisherSection';
import { CommsMediaOpsSection } from './components/CommsMediaOpsSection';
import { VerificationRequestsSection } from './components/VerificationRequestsSection';
import { CategoriesSection } from './components/CategoriesSection';
import { HashtagsSection } from './components/HashtagsSection';
import { CommerceOpsSection } from './components/CommerceOpsSection';

export type AdminSectionId =
  | 'overview'
  | 'verification'
  | 'categories'
  | 'hashtags'
  | 'publisher'
  | 'commerce'
  | 'members'
  | 'users'
  | 'moderation'
  | 'reports'
  | 'comms'
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
  comments?: AdminCommentItem[];
  chats?: ChatThread[];
  calls?: AdminCallRoomSummary[];
  onlineUserIds: string[];
  moderation: AdminModerationState;
  memberModerationRecords: Record<string, MemberModerationRecord>;
  adminRoles: AdminRoleEntry[];
  reports: ContentReport[];
  appeals: ModerationAppeal[];
  announcements: PlatformAnnouncement[];
  guidelines: CommunityGuidelinesConfig;
  termsConfig: LegalPolicyConfig;
  privacyConfig: LegalPolicyConfig;
  featureFlags: AdminFeatureFlags;
  auditLogs: AdminAuditEntry[];
  inquiries: AdminAccessInquiry[];
  healthProbes: SystemHealthProbe[];
  jobs: BackgroundJobItem[];
  checkingHealth: boolean;
  autoMaintenanceEnabled?: boolean;
  r2Objects?: R2MediaObjectItem[];
  r2TotalBytes?: number;
  r2Loading?: boolean;
  r2Error?: string | null;
  onSetTheme: (theme: ThemeMode) => void;
  onSignInGoogle: () => Promise<void>;
  onSignInEmail?: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onToggleHidePost: (postId: string) => void;
  onEditPost?: (
    postId: string,
    updates: {
      caption: string;
      category: PostCategory;
      imageUrl: string;
      linkUrl?: string;
      mediaTitle?: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeletePost: (postId: string) => Promise<void>;
  onDeleteStory: (storyId: string) => Promise<void>;
  onDeleteComment?: (
    postId: string,
    commentId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onSetMemberStatus: (
    targetUid: string,
    status: MemberAccountStatus,
    reason: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onSanitizeProfile?: (
    targetUid: string,
    input: {
      displayName: string;
      handle: string;
      bio: string;
      location: string;
      avatarUrl: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  onSendWarning?: (
    targetUid: string,
    title: string,
    body: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onPurgeUser?: (targetUid: string) => Promise<{ ok: boolean; error?: string }>;
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
  onDeleteAnnouncement?: (id: string) => Promise<void>;
  onSaveLegalPolicy: (
    docId: LegalDocId,
    input: {
      version: string;
      summary: string;
      rulesText: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  onUpdateInquiryStatus: (id: string, status: AdminAccessInquiry['status']) => void;
  onToggleFeatureFlag: (
    key: keyof Omit<AdminFeatureFlags, 'updatedBy' | 'updatedAtMs'>
  ) => Promise<void>;
  onRunHealthProbes: () => Promise<void>;
  onRunBackgroundJob: (jobId: string) => Promise<void>;
  onToggleAutoMaintenance?: () => void;
  onToggleVerify?: (
    targetUid: string,
    isVerified: boolean
  ) => Promise<{ ok: boolean; error?: string }>;
  onUploadMedia?: (
    file: File,
    folder: 'posts' | 'stories'
  ) => Promise<{ ok: boolean; url?: string; kind?: string; error?: string }>;
  onPublishPost: (input: {
    caption: string;
    category: PostCategory;
    imageUrl: string;
    videoUrl?: string;
    linkUrl?: string;
    mediaTitle?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onPublishStory?: (input: {
    caption: string;
    imageUrl: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  savedHashtags?: string[];
  dynamicHashtags?: string[];
  categories?: PostCategoryRecord[];
  onCreateCategory?: (
    name: string,
    description: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteCategory?: (categoryId: string) => Promise<{ ok: boolean; error?: string }>;
  onCreateHashtag?: (
    rawTag: string
  ) => Promise<{ ok: boolean; tag?: string; error?: string }>;
  onDeleteHashtag?: (tag: string) => Promise<{ ok: boolean; error?: string }>;
  onRenameChat?: (
    chatId: string,
    nextTitle: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onRemoveChatMember?: (
    chatId: string,
    targetUid: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteChat?: (chatId: string) => Promise<{ ok: boolean; error?: string }>;
  onForceEndCall?: (callId: string) => Promise<{ ok: boolean; error?: string }>;
  onLoadR2Objects?: (prefix?: string) => Promise<void>;
  onDeleteR2Object?: (key: string) => Promise<{ ok: boolean; error?: string }>;
  verificationRequests: VerificationRequest[];
  onReviewVerificationRequest: (
    requestId: string,
    targetUid: string,
    decision: 'approved' | 'rejected',
    note?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  marketplaceStores?: MarketplaceStore[];
  marketplaceProducts?: MarketplaceProduct[];
  marketplaceOrders?: MarketplaceOrder[];
  onSeedMarketplaceShowroom?: () => Promise<{ ok: boolean; count?: number; error?: string }>;
  onSaveMarketplaceStore?: (input: {
    id?: string;
    slug: string;
    name: string;
    tagline: string;
    ownerUid: string;
    ownerHandle: string;
    logoUrl: string;
    bannerUrl: string;
    category: string;
    currency: string;
    publishStatus: StorePublishStatus;
    externalStoreId?: string;
    verified: boolean;
    featured: boolean;
    isCreate: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  onSaveMarketplaceProduct?: (input: {
    id?: string;
    storeId: string;
    storeName: string;
    storeSlug: string;
    ownerUid: string;
    title: string;
    description: string;
    category: string;
    priceCents: number;
    compareAtPriceCents?: number;
    currency: string;
    imageUrl: string;
    stock: number;
    status: ProductStatus;
    featured: boolean;
    tag?: string;
    isCreate: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  onDeleteMarketplaceProduct?: (productId: string) => Promise<{ ok: boolean; error?: string }>;
  onUpdateMarketplaceOrder?: (
    orderId: string,
    updates: { status: OrderStatus; paymentStatus: PaymentStatus }
  ) => Promise<{ ok: boolean; error?: string }>;
}

const SECTION_NAV: Array<{
  id: AdminSectionId;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Overview & Analytics', icon: LayoutDashboard },
  { id: 'verification', label: 'Verification Requests', icon: Award },
  { id: 'categories', label: 'Categories', icon: FolderKanban },
  { id: 'hashtags', label: 'Hashtags', icon: Hash },
  { id: 'publisher', label: 'Publisher Hub', icon: Sparkles },
  { id: 'commerce', label: 'Marketplace & Commerce', icon: ShoppingBag },
  { id: 'members', label: 'Team & Roles', icon: ShieldAlert },
  { id: 'users', label: 'Community Users', icon: Users },
  { id: 'moderation', label: 'Feed & Stories', icon: FileWarning },
  { id: 'reports', label: 'Reports & Appeals', icon: Flag },
  { id: 'comms', label: 'Chats, Calls & Media', icon: MessagesSquare },
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
  comments = [],
  chats = [],
  calls = [],
  onlineUserIds,
  moderation,
  memberModerationRecords,
  adminRoles,
  reports,
  appeals,
  announcements,
  guidelines,
  termsConfig,
  privacyConfig,
  featureFlags,
  auditLogs,
  inquiries,
  healthProbes,
  jobs,
  checkingHealth,
  autoMaintenanceEnabled = false,
  r2Objects = [],
  r2TotalBytes = 0,
  r2Loading = false,
  r2Error = null,
  onSetTheme,
  onSignInGoogle,
  onSignInEmail,
  onSignOut,
  onToggleHidePost,
  onEditPost,
  onDeletePost,
  onDeleteStory,
  onDeleteComment,
  onSetMemberStatus,
  onSanitizeProfile,
  onSendWarning,
  onPurgeUser,
  onAssignRole,
  onRevokeRole,
  onResolveReport,
  onReviewAppeal,
  onPublishAnnouncement,
  onToggleAnnouncement,
  onDeleteAnnouncement,
  onSaveLegalPolicy,
  onUpdateInquiryStatus,
  onToggleFeatureFlag,
  onRunHealthProbes,
  onRunBackgroundJob,
  onToggleAutoMaintenance,
  onToggleVerify,
  onUploadMedia,
  onPublishPost,
  onPublishStory,
  savedHashtags = [],
  dynamicHashtags = [],
  categories = [],
  onCreateCategory,
  onDeleteCategory,
  onCreateHashtag,
  onDeleteHashtag,
  onRenameChat,
  onRemoveChatMember,
  onDeleteChat,
  onForceEndCall,
  onLoadR2Objects,
  onDeleteR2Object,
  verificationRequests = [],
  onReviewVerificationRequest,
  marketplaceStores = [],
  marketplaceProducts = [],
  marketplaceOrders = [],
  onSeedMarketplaceShowroom,
  onSaveMarketplaceStore,
  onSaveMarketplaceProduct,
  onDeleteMarketplaceProduct,
  onUpdateMarketplaceOrder,
}: AdminViewProps) {
  const [section, setSection] = useState<AdminSectionId>(() => {
    if (typeof window === 'undefined') return 'overview';
    const params = new URLSearchParams(window.location.search || '');
    if (
      params.get('tab') === 'commerce' ||
      params.get('section') === 'commerce'
    ) {
      return 'commerce';
    }
    return 'overview';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [adminProfileModalOpen, setAdminProfileModalOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
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

  const enrichedComments = useMemo(() => {
    const postCaptionMap = new Map<string, string>();
    for (const post of posts) {
      postCaptionMap.set(post.id, post.caption || post.mediaTitle || '');
    }
    return comments.map((c) => ({
      ...c,
      postCaption: c.postCaption || postCaptionMap.get(c.postId) || '',
    }));
  }, [comments, posts]);

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
              const pendingVerifications = verificationRequests.filter(
                (r) => r.status === 'pending'
              ).length;
              const pendingOrders = marketplaceOrders.filter(
                (o) => o.status === 'PENDING'
              ).length;
              const badgeCount =
                item.id === 'verification'
                  ? pendingVerifications
                  : item.id === 'commerce'
                    ? pendingOrders
                    : item.id === 'reports'
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
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open mobile navigation sidebar"
                className="lg:hidden min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer shrink-0 mr-1"
              >
                <Menu className="w-4 h-4" aria-hidden="true" />
              </button>
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

              {/* Users Dropdown Menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Administrator account options"
                  className="min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Avatar src={currentProfile.avatarUrl} name={currentProfile.displayName} size="sm" />
                  <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold max-w-[120px] truncate text-slate-900 dark:text-white">
                    <span className="truncate">{currentProfile.displayName}</span>
                    <VerifiedBadge size={12} />
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {userMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 z-50 looma-stage-enter space-y-1"
                  >
                    <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar src={currentProfile.avatarUrl} name={currentProfile.displayName} size="sm" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1">
                            <span className="truncate">{currentProfile.displayName}</span>
                            <VerifiedBadge size={12} />
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {accountEmail || `@${currentProfile.handle}`}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[10px] font-mono font-bold text-blue-700 dark:text-blue-300 uppercase">
                          {adminAuth.reason === 'ok-admin-doc' ? 'Assigned Admin' : 'Super Admin'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setAdminProfileModalOpen(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Admin Profile</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setSection('system');
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Settings className="w-4 h-4 text-slate-500" />
                      <span>Settings &amp; Flags</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setSection('categories');
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <FolderKanban className="w-4 h-4 text-slate-500" />
                      <span>Manage Categories</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setSection('hashtags');
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Hash className="w-4 h-4 text-slate-500" />
                      <span>Manage Hashtags</span>
                    </button>

                    <a
                      href="/feed"
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4 text-slate-500" />
                      <span>Open Main Feed</span>
                    </a>

                    <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setUserMenuOpen(false);
                          void onSignOut();
                        }}
                        className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Section Navigation Pills */}
          <nav
            aria-label="Admin sections mobile"
            className="lg:hidden px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto"
          >
            {SECTION_NAV.map((item) => {
              const isActive = item.id === section;
              const pendingVerifications = verificationRequests.filter(
                (r) => r.status === 'pending'
              ).length;
              const pendingOrders = marketplaceOrders.filter(
                (o) => o.status === 'PENDING'
              ).length;
              const badgeCount =
                item.id === 'verification'
                  ? pendingVerifications
                  : item.id === 'commerce'
                    ? pendingOrders
                    : item.id === 'reports'
                      ? metrics.openReports + metrics.pendingAppeals
                      : item.id === 'governance'
                        ? metrics.pendingInquiries
                        : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <span>{item.label}</span>
                  {badgeCount > 0 && (
                    <span className="font-mono text-[11px] tabular-nums opacity-85">
                      {badgeCount}
                    </span>
                  )}
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

          {section === 'verification' && (
            <VerificationRequestsSection
              requests={verificationRequests}
              onReviewRequest={onReviewVerificationRequest}
            />
          )}

          {section === 'categories' && (
            <CategoriesSection
              categories={categories}
              posts={posts}
              onCreateCategory={
                onCreateCategory ||
                (async () => ({ ok: false, error: 'Category creation unavailable.' }))
              }
              onDeleteCategory={
                onDeleteCategory ||
                (async () => ({ ok: false, error: 'Category deletion unavailable.' }))
              }
            />
          )}

          {section === 'hashtags' && (
            <HashtagsSection
              savedHashtags={savedHashtags}
              dynamicHashtags={dynamicHashtags}
              posts={posts}
              onCreateHashtag={onCreateHashtag}
              onDeleteHashtag={onDeleteHashtag}
            />
          )}

          {section === 'publisher' && (
            <AdminPublisherSection
              currentProfile={currentProfile}
              communityUsers={allMembers}
              posts={posts}
              savedHashtags={savedHashtags}
              dynamicHashtags={dynamicHashtags}
              onCreateHashtag={onCreateHashtag}
              onDeleteHashtag={onDeleteHashtag}
              onUploadMedia={onUploadMedia}
              onPublishPost={onPublishPost}
              onPublishStory={onPublishStory}
              onPublishAnnouncement={onPublishAnnouncement}
            />
          )}

          {section === 'commerce' && (
            <CommerceOpsSection
              currentProfile={currentProfile}
              communityUsers={allMembers}
              stores={marketplaceStores}
              products={marketplaceProducts}
              orders={marketplaceOrders}
              marketplaceEnabled={featureFlags.marketplaceEnabled}
              onToggleMarketplaceFlag={() => onToggleFeatureFlag('marketplaceEnabled')}
              onUploadMedia={onUploadMedia}
              onSeedShowroom={
                onSeedMarketplaceShowroom ||
                (async () => ({ ok: false, error: 'Seeding unavailable.' }))
              }
              onSaveStore={
                onSaveMarketplaceStore ||
                (async () => ({ ok: false, error: 'Store management unavailable.' }))
              }
              onSaveProduct={
                onSaveMarketplaceProduct ||
                (async () => ({ ok: false, error: 'Product management unavailable.' }))
              }
              onDeleteProduct={
                onDeleteMarketplaceProduct ||
                (async () => ({ ok: false, error: 'Product deletion unavailable.' }))
              }
              onUpdateOrder={
                onUpdateMarketplaceOrder ||
                (async () => ({ ok: false, error: 'Order update unavailable.' }))
              }
            />
          )}

          {section === 'members' && (
            <TeamRolesSection
              currentAdminUid={currentProfile.uid}
              adminRoles={adminRoles}
              communityUsers={allMembers}
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
              onSanitizeProfile={onSanitizeProfile}
              onSendWarning={onSendWarning}
              onPurgeUser={onPurgeUser}
            />
          )}

          {section === 'moderation' && (
            <ContentModerationSection
              posts={filteredPosts}
              storyGroups={storyGroups}
              comments={enrichedComments}
              hiddenSet={hiddenSet}
              postSearch={postSearch}
              postCategory={postCategory}
              onChangePostSearch={setPostSearch}
              onChangePostCategory={setPostCategory}
              onToggleHidePost={onToggleHidePost}
              onEditPost={onEditPost}
              onDeletePost={onDeletePost}
              onDeleteStory={onDeleteStory}
              onDeleteComment={onDeleteComment}
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

          {section === 'comms' && (
            <CommsMediaOpsSection
              chats={chats}
              calls={calls}
              communityUsers={allMembers}
              r2Objects={r2Objects}
              r2TotalBytes={r2TotalBytes}
              r2Loading={r2Loading}
              r2Error={r2Error}
              onRenameChat={
                onRenameChat || (async () => ({ ok: false, error: 'Chat management unavailable.' }))
              }
              onRemoveChatMember={
                onRemoveChatMember ||
                (async () => ({ ok: false, error: 'Participant management unavailable.' }))
              }
              onDeleteChat={
                onDeleteChat || (async () => ({ ok: false, error: 'Chat deletion unavailable.' }))
              }
              onForceEndCall={
                onForceEndCall ||
                (async () => ({ ok: false, error: 'Call termination unavailable.' }))
              }
              onLoadR2Objects={onLoadR2Objects || (async () => {})}
              onDeleteR2Object={
                onDeleteR2Object ||
                (async () => ({ ok: false, error: 'Storage deletion unavailable.' }))
              }
            />
          )}

          {section === 'governance' && (
            <GovernanceSection
              announcements={announcements}
              guidelines={guidelines}
              termsConfig={termsConfig}
              privacyConfig={privacyConfig}
              inquiries={inquiries}
              onPublishAnnouncement={onPublishAnnouncement}
              onToggleAnnouncement={onToggleAnnouncement}
              onDeleteAnnouncement={onDeleteAnnouncement}
              onSaveLegalPolicy={onSaveLegalPolicy}
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
              autoMaintenanceEnabled={autoMaintenanceEnabled}
              onToggleAutoMaintenance={onToggleAutoMaintenance}
              onToggleFlag={onToggleFeatureFlag}
              onRunHealthProbes={onRunHealthProbes}
              onRunBackgroundJob={onRunBackgroundJob}
            />
          )}
        </main>
      </div>

      {/* Mobile Slide-Over Sidebar Drawer */}
      {mobileSidebarOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Sidebar"
          className="fixed inset-0 z-50 lg:hidden"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileSidebarOpen(false)}
          />

          {/* Drawer panel */}
          <aside
            className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between overflow-y-auto shadow-2xl looma-stage-enter z-10"
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-2">
                <LoomaLogo />
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(false)}
                  aria-label="Close navigation sidebar"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="space-y-1">
                {SECTION_NAV.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.id === section;
                  const pendingVerifications = verificationRequests.filter(
                    (r) => r.status === 'pending'
                  ).length;
                  const badgeCount =
                    item.id === 'verification'
                      ? pendingVerifications
                      : item.id === 'reports'
                        ? metrics.openReports + metrics.pendingAppeals
                        : item.id === 'governance'
                          ? metrics.pendingInquiries
                          : 0;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSection(item.id);
                        setMobileSidebarOpen(false);
                      }}
                      className={`w-full min-h-[42px] px-3.5 rounded-xl flex items-center justify-between text-xs font-semibold transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </span>
                      {badgeCount > 0 && (
                        <span
                          className={`font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded-md ${
                            isActive
                              ? 'bg-blue-700 text-white'
                              : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          }`}
                        >
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
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1">
                    <span className="truncate">{currentProfile.displayName}</span>
                    <VerifiedBadge size={12} />
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {accountEmail || `@${currentProfile.handle}`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMobileSidebarOpen(false);
                  setAdminProfileModalOpen(true);
                }}
                className="w-full min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>View Admin Profile</span>
              </button>

              <button
                type="button"
                onClick={() => void onSignOut()}
                className="w-full min-h-[38px] px-3 rounded-xl border border-rose-200 dark:border-rose-900/60 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Admin Profile Modal */}
      {adminProfileModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Admin Profile Details"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden looma-stage-enter">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Administrator Profile</span>
              </h3>
              <button
                type="button"
                onClick={() => setAdminProfileModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <Avatar src={currentProfile.avatarUrl} name={currentProfile.displayName} size="lg" />
                <div className="min-w-0 space-y-1">
                  <h4 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>{currentProfile.displayName}</span>
                    <VerifiedBadge size={16} />
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    @{currentProfile.handle} · {accountEmail || 'Authorized Administrator'}
                  </p>
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[10px] font-mono font-bold text-blue-700 dark:text-blue-300 uppercase">
                      {adminAuth.reason === 'ok-admin-doc' ? 'Assigned Admin' : 'Super Admin'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono font-semibold">
                      Verification Badge Active
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-800 space-y-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Assigned Privileges &amp; Operations
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'users.manage',
                    'content.moderate',
                    'verification.review',
                    'categories.manage',
                    'hashtags.manage',
                    'announcements.publish',
                    'system.ops',
                  ].map((perm) => (
                    <span
                      key={perm}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-300"
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Operator UID</span>
                  <span className="font-mono font-medium truncate block text-slate-900 dark:text-white mt-0.5">
                    {currentProfile.uid}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Database Status</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400 block mt-0.5">
                    Connected &amp; Synchronized
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <a
                  href="/feed"
                  className="min-h-[38px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Switch to Main Feed</span>
                </a>
                <button
                  type="button"
                  onClick={() => setAdminProfileModalOpen(false)}
                  className="min-h-[38px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
