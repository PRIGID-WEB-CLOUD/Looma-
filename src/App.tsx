import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useSocialStore } from './hooks/useSocialStore';
import {
  ActiveIdentityProvider,
  useActiveIdentity,
} from './contexts/ActiveIdentityContext';
import type { BusinessProfile } from './types/business';
import {
  fetchActiveBusinessProfilesForOwner,
  markAllBusinessNotificationsRead,
  markBusinessNotificationRead,
} from './services/businessProfiles';
import type {
  ChatThread,
  ConnectionsTab,
  Post,
  StoryGroup,
  TabId,
  UserProfile,
} from './types/social';
import {
  computeOtherUserConnections,
  countUnreadNotifications,
  extractAnnouncementIdFromNotificationId,
  filterActiveAnnouncementsForMember,
  formatLastMessageSnippet,
  formatRelativeTime,
  formatSharedPostMessage,
  getThreadOnlineStatus,
  isUserOnline,
  mergeAnnouncementsIntoNotifications,
  normalizeHashtag,
  resolveAppStage,
  resolveLiveProfile,
  resolvePublicProfile,
} from './utils/socialLogic';
import {
  getLegalRoutePath,
  hasRequiredAccountConsent,
  parseLegalRoute,
  type AccountConsentState,
  type LegalDocId,
} from './utils/legalLogic';
import {
  getTabRoutePath,
  resolveRouteAccess,
} from './utils/workspaceAccess';
import { AddStoryModal } from './components/AddStoryModal';
import { Avatar } from './components/Avatar';
import { AuthView, type AuthMode } from './components/AuthView';
import { BusinessProfileModal } from './components/BusinessProfileModal';
import { BusinessSwitcherMenu } from './components/BusinessSwitcherMenu';
import { CreatePostModal } from './components/CreatePostModal';
import { FeedView } from './components/FeedView';
import { IncomingCallModal } from './components/IncomingCallModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { NotificationsView } from './components/NotificationsView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { OnboardingFlow } from './components/OnboardingFlow';
import { ProfileView } from './components/ProfileView';
import { PushToast } from './components/PushToast';
import { PWAInstallButton } from './components/PWAInstallButton';
import { StoryViewerModal } from './components/StoryViewerModal';
import { TopBar } from './components/TopBar';
import { BrandLogoModal } from './components/BrandLogoModal';
import { VerifiedBadge } from './components/VerifiedBadge';
import { LoomaLogo } from './components/LoomaLogo';
import { OrbitSyncOverlay } from './components/OrbitSyncOverlay';
import { useInitialization } from './app/initialization';
import { InitializationScreen } from './app/startup/InitializationScreen';

const CallRoomModal = lazy(() =>
  import('./components/CallRoomModal').then((m) => ({
    default: m.CallRoomModal,
  }))
);
const ChatView = lazy(() =>
  import('./components/ChatView').then((m) => ({
    default: m.ChatView,
  }))
);
const ConnectionsView = lazy(() =>
  import('./components/ConnectionsView').then((m) => ({
    default: m.ConnectionsView,
  }))
);
const LegalDocumentView = lazy(() =>
  import('./components/LegalDocumentView').then((m) => ({
    default: m.LegalDocumentView,
  }))
);
const ProfileSettingsView = lazy(() =>
  import('./components/ProfileSettingsView').then((m) => ({
    default: m.ProfileSettingsView,
  }))
);
const PublicProfileView = lazy(() =>
  import('./components/PublicProfileView').then((m) => ({
    default: m.PublicProfileView,
  }))
);
const MarketplaceView = lazy(() =>
  import('./components/MarketplaceView').then((m) => ({
    default: m.MarketplaceView,
  }))
);
const ProductDetailPage = lazy(() =>
  import('./components/ProductDetailPage').then((m) => ({
    default: m.ProductDetailPage,
  }))
);
const BusinessProfilePage = lazy(() =>
  import('./components/BusinessProfilePage').then((m) => ({
    default: m.BusinessProfilePage,
  }))
);
const AdminApp = lazy(() => import('../admin/AdminApp'));
const LandingPageApp = lazy(() => import('../landingpage/LandingPageApp'));
import { isAllowlistedAdminEmail } from '../admin/adminLogic';

function RouteLoadingFallback() {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500 dark:text-slate-400">
      Loading view...
    </div>
  );
}

export default function App() {
  const store = useSocialStore();
  return (
    <ActiveIdentityProvider
      profile={store.profile}
      firebaseUser={store.firebaseUser}
      isLocalAutostart={store.isLocalAutostart}
    >
      <AppContent store={store} />
    </ActiveIdentityProvider>
  );
}

function AppContent({ store }: { store: ReturnType<typeof useSocialStore> }) {
  const { snapshot: initSnapshot } = useInitialization();
  const {
    activeIdentity,
    memberships,
    businesses,
    activeBusinessProfile,
    businessNotifications,
    unreadBusinessNotifications,
    isTransitioning,
    platformMode,
    switchToPersonal,
    switchToBusiness,
  } = useActiveIdentity();
  const searchParams =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null;
  const onboardingParam = searchParams?.get('onboarding') === '1';
  const authQuery = searchParams?.get('auth');
  const initialAuthMode: AuthMode =
    authQuery === 'signup' ? 'signup' : 'signin';

  const [routeLocation, setRouteLocation] = useState<{
    pathname: string;
    search: string;
  }>(() =>
    typeof window !== 'undefined'
      ? {
          pathname: window.location.pathname || '/',
          search: window.location.search || '',
        }
      : { pathname: '/', search: '' }
  );

  const [activeTab, setActiveTab] = useState<TabId>('feed');
  const [connectionsTab, setConnectionsTab] =
    useState<ConnectionsTab>('followers');
  const [authMode, setAuthMode] = useState<AuthMode>(initialAuthMode);
  const [signupConsent, setSignupConsent] = useState<AccountConsentState>({
    termsAccepted: false,
    privacyAccepted: false,
  });
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDocId | null>(() =>
    typeof window !== 'undefined'
      ? parseLegalRoute(window.location.pathname, window.location.search)
      : null
  );

  const isUserAdmin = Boolean(
    store.firebaseUser?.email && isAllowlistedAdminEmail(store.firebaseUser.email)
  );
  const legalReturnPathRef = useRef<string>('/');
  const pendingProtectedPathRef = useRef<string | null>(null);
  const [protectedRedirectNotice, setProtectedRedirectNotice] = useState<
    string | null
  >(null);
  const [previewOnboarding, setPreviewOnboarding] =
    useState<boolean>(onboardingParam);
  const [publicProfileReturnTab, setPublicProfileReturnTab] = useState<
    'feed' | 'connections' | 'profile' | 'messages' | 'marketplace'
  >('feed');
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitialBusinessId, setComposerInitialBusinessId] = useState<string | null>(null);
  const [businessModalOpen, setBusinessModalOpen] = useState(false);
  const [businessModalMode, setBusinessModalMode] = useState<'create' | 'edit'>('create');
  const [editingBusinessProfile, setEditingBusinessProfile] = useState<BusinessProfile | null>(null);
  const [selectedBusinessSlug, setSelectedBusinessSlug] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [addStoryOpen, setAddStoryOpen] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [activeStoryAuthorId, setActiveStoryAuthorId] = useState<string | null>(
    null
  );
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [selectedPublicProfile, setSelectedPublicProfile] =
    useState<UserProfile | null>(null);
  const [loadingPublicProfile, setLoadingPublicProfile] = useState(false);
  const [publicProfileBusinesses, setPublicProfileBusinesses] = useState<
    BusinessProfile[]
  >([]);
  const [loadingPublicBusinesses, setLoadingPublicBusinesses] = useState(false);
  const [connectionsOwner, setConnectionsOwner] = useState<UserProfile | null>(
    null
  );
  const [remoteOtherConnections, setRemoteOtherConnections] = useState<{
    targetUid: string;
    followerIds: string[];
    followingIds: string[];
  } | null>(null);
  const [feedSearchQuery, setFeedSearchQuery] = useState('');

  const readStoredUidList = (prefix: string, uid: string): string[] => {
    if (typeof window === 'undefined' || !uid) return [];
    try {
      const raw = window.localStorage.getItem(`${prefix}_${uid}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      return [];
    }
  };

  const writeStoredUidList = (prefix: string, uid: string, ids: string[]) => {
    if (typeof window === 'undefined' || !uid) return;
    try {
      window.localStorage.setItem(`${prefix}_${uid}`, JSON.stringify(ids));
    } catch {
      // Ignore storage quota errors
    }
  };

  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState<string[]>(() =>
    readStoredUidList('looma_ann_dismissed_v1', store.profile.uid)
  );
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<string[]>(() =>
    readStoredUidList('looma_ann_read_v1', store.profile.uid)
  );
  const [deletedAnnouncementIds, setDeletedAnnouncementIds] = useState<string[]>(() =>
    readStoredUidList('looma_ann_deleted_v1', store.profile.uid)
  );

  useEffect(() => {
    const uid = store.profile.uid;
    setDismissedAnnouncementIds(readStoredUidList('looma_ann_dismissed_v1', uid));
    setReadAnnouncementIds(readStoredUidList('looma_ann_read_v1', uid));
    setDeletedAnnouncementIds(readStoredUidList('looma_ann_deleted_v1', uid));
  }, [store.profile.uid]);

  const [appealModalOpen, setAppealModalOpen] = useState(false);
  const [appealReason, setAppealReason] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);
  const [appealSuccessNotice, setAppealSuccessNotice] = useState<string | null>(null);

  const visibleAnnouncements = useMemo(
    () =>
      filterActiveAnnouncementsForMember(store.announcements, {
        isVerified: Boolean(store.profile.isVerified),
        isAdmin: isUserAdmin,
        dismissedIds: dismissedAnnouncementIds,
        readIds: readAnnouncementIds,
        deletedIds: deletedAnnouncementIds,
      }),
    [
      deletedAnnouncementIds,
      dismissedAnnouncementIds,
      isUserAdmin,
      readAnnouncementIds,
      store.announcements,
      store.profile.isVerified,
    ]
  );

  const activityNotifications = useMemo(
    () =>
      mergeAnnouncementsIntoNotifications(store.notifications, store.announcements, {
        recipientId: store.profile.uid,
        isVerified: Boolean(store.profile.isVerified),
        isAdmin: isUserAdmin,
        readAnnouncementIds,
        deletedAnnouncementIds,
      }),
    [
      deletedAnnouncementIds,
      isUserAdmin,
      readAnnouncementIds,
      store.announcements,
      store.notifications,
      store.profile.isVerified,
      store.profile.uid,
    ]
  );

  const persistDismissedAnnouncements = (ids: string[]) => {
    setDismissedAnnouncementIds((prev) => {
      const merged = Array.from(new Set([...prev, ...ids]));
      writeStoredUidList('looma_ann_dismissed_v1', store.profile.uid, merged);
      return merged;
    });
  };

  const persistReadAnnouncements = (ids: string[]) => {
    setReadAnnouncementIds((prev) => {
      const merged = Array.from(new Set([...prev, ...ids]));
      writeStoredUidList('looma_ann_read_v1', store.profile.uid, merged);
      return merged;
    });
    persistDismissedAnnouncements(ids);
  };

  const persistDeletedAnnouncements = (ids: string[]) => {
    setDeletedAnnouncementIds((prev) => {
      const merged = Array.from(new Set([...prev, ...ids]));
      writeStoredUidList('looma_ann_deleted_v1', store.profile.uid, merged);
      return merged;
    });
    persistReadAnnouncements(ids);
  };

  // Once the member views the Activity page, dismiss active popup banners so they don't pop up again
  useEffect(() => {
    if (activeTab !== 'notifications') return;
    store.dismissToast();
    if (visibleAnnouncements.length > 0) {
      persistDismissedAnnouncements(visibleAnnouncements.map((a) => a.id));
    }
  }, [activeTab, visibleAnnouncements]);

  const verifiedUidSet = useMemo(() => {
    const set = new Set<string>();
    if (store.profile.isVerified || isUserAdmin) {
      set.add(store.profile.uid);
    }
    for (const u of store.communityUsers) {
      if (u.isVerified) {
        set.add(u.uid);
      }
    }
    for (const p of store.posts) {
      if (p.authorVerified) {
        set.add(p.authorId);
      }
    }
    return set;
  }, [isUserAdmin, store.communityUsers, store.posts, store.profile.isVerified, store.profile.uid]);

  const unreadCount = countUnreadNotifications(activityNotifications);
  const appStage = resolveAppStage(
    store.isAuthorized,
    store.profile.onboardingCompleted,
    store.authReady
  );

  const navigateToPath = (rawTargetPath: string, replace = false) => {
    if (typeof window === 'undefined') return;
    const url = new URL(rawTargetPath, window.location.origin);
    if (store.isLocalAutostart && !url.searchParams.has('autostart')) {
      url.searchParams.set('autostart', '1');
    }
    const nextPath = url.pathname || '/';
    const nextSearch = url.search || '';
    const full = `${nextPath}${nextSearch}`;
    if (replace) {
      window.history.replaceState({}, '', full);
    } else {
      window.history.pushState({}, '', full);
    }
    setRouteLocation({ pathname: nextPath, search: nextSearch });
    setActiveLegalDoc(parseLegalRoute(nextPath, nextSearch));
  };

  const selectWorkspaceTab = (tab: TabId) => {
    setActiveTab(tab);
    if (tab !== 'public-profile') {
      navigateToPath(getTabRoutePath(tab));
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const nextPath = window.location.pathname || '/';
      const nextSearch = window.location.search || '';
      setRouteLocation({ pathname: nextPath, search: nextSearch });
      setActiveLegalDoc(parseLegalRoute(nextPath, nextSearch));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const routeAccess = useMemo(
    () =>
      resolveRouteAccess({
        pathname: routeLocation.pathname,
        search: routeLocation.search,
        isAuthorized: store.isAuthorized,
        onboardingCompleted: store.profile.onboardingCompleted,
        authReady: store.authReady,
      }),
    [
      routeLocation.pathname,
      routeLocation.search,
      store.authReady,
      store.isAuthorized,
      store.profile.onboardingCompleted,
    ]
  );

  // Enforce Protected Workspace Redirect: unauthenticated visitors hitting /feed, /messages, /settings, /admin, etc. are moved to /auth cleanly
  useEffect(() => {
    if (routeAccess.surface === 'auth' && routeAccess.protectedNotice) {
      pendingProtectedPathRef.current = routeAccess.returnToPath || '/feed';
      setProtectedRedirectNotice(routeAccess.protectedNotice);
      if (routeLocation.pathname !== '/auth') {
        navigateToPath('/auth', true);
      }
    } else if (routeAccess.surface !== 'auth' && store.isAuthorized) {
      setProtectedRedirectNotice(null);
    }
  }, [
    routeAccess.protectedNotice,
    routeAccess.returnToPath,
    routeAccess.surface,
    routeLocation.pathname,
    store.isAuthorized,
  ]);

  // Keep workspace activeTab aligned when navigating via URL (/feed, /messages, /business/:slug, etc.)
  useEffect(() => {
    if (routeAccess.businessSlug) {
      setSelectedBusinessSlug(routeAccess.businessSlug);
    }
    if (routeAccess.productId !== undefined) {
      setSelectedProductId(routeAccess.productId || null);
    }
    if (routeAccess.surface === 'workspace' && routeAccess.tab) {
      setActiveTab(routeAccess.tab);
    }
  }, [routeAccess.businessSlug, routeAccess.productId, routeAccess.surface, routeAccess.tab]);

  const openBusinessProfileRoute = (slug: string) => {
    const clean = slug.trim().toLowerCase();
    if (!clean) return;
    setSelectedBusinessSlug(clean);
    setActiveTab('business-profile');
    navigateToPath(`/business/${clean}`);
  };

  const openProductDetailRoute = (productId: string) => {
    const clean = productId.trim();
    if (!clean) return;
    setSelectedProductId(clean);
    setActiveTab('product-detail');
    navigateToPath(`/marketplace/product/${clean}`);
  };

  useEffect(() => {
    const targetUid =
      activeTab === 'public-profile' ? selectedPublicProfile?.uid : undefined;
    if (!targetUid || store.isLocalAutostart) {
      setPublicProfileBusinesses([]);
      setLoadingPublicBusinesses(false);
      return;
    }
    let active = true;
    setLoadingPublicBusinesses(true);
    void fetchActiveBusinessProfilesForOwner(targetUid)
      .then((list) => {
        if (active) setPublicProfileBusinesses(list);
      })
      .catch(() => {
        if (active) setPublicProfileBusinesses([]);
      })
      .finally(() => {
        if (active) setLoadingPublicBusinesses(false);
      });
    return () => {
      active = false;
    };
  }, [activeTab, selectedPublicProfile?.uid, store.isLocalAutostart]);

  const publishableBusinesses = useMemo(
    () =>
      businesses.filter((biz) => {
        const m = memberships.find((item) => item.businessProfileId === biz.id);
        return m && (m.role === 'OWNER' || m.role === 'ADMIN' || m.role === 'EDITOR');
      }),
    [businesses, memberships]
  );

  const canManageBusinessIds = useMemo(
    () => publishableBusinesses.map((b) => b.id),
    [publishableBusinesses]
  );

  const openLegalDocument = (docId: LegalDocId) => {
    if (typeof window !== 'undefined') {
      const currentLegal = parseLegalRoute(
        window.location.pathname,
        window.location.search
      );
      if (!currentLegal) {
        legalReturnPathRef.current =
          `${window.location.pathname}${window.location.search}` || '/';
      }
    }
    navigateToPath(getLegalRoutePath(docId));
  };

  const closeLegalDocument = () => {
    if (typeof window !== 'undefined') {
      const currentLegal = parseLegalRoute(
        window.location.pathname,
        window.location.search
      );
      if (currentLegal) {
        const target = legalReturnPathRef.current || '/';
        navigateToPath(target);
        return;
      }
    }
    setActiveLegalDoc(null);
  };

  const navigateAfterAuthentication = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search || '');
      const rawRedirect = (params.get('redirect') || '').trim();
      if (rawRedirect) {
        if (
          rawRedirect === 'https://looma-admin.prigidcollection.workers.dev/' ||
          rawRedirect === 'https://looma-admin.prigidcollection.workers.dev' ||
          rawRedirect === 'https://admin.prigidcollection.workers.dev/' ||
          rawRedirect === 'https://admin.prigidcollection.workers.dev'
        ) {
          window.location.href = rawRedirect;
          return;
        }
        if (
          rawRedirect === '/admin' ||
          rawRedirect === '/admin/' ||
          rawRedirect === '/landingpage' ||
          rawRedirect === '/landingpage/'
        ) {
          pendingProtectedPathRef.current = null;
          setProtectedRedirectNotice(null);
          navigateToPath(rawRedirect.endsWith('/') ? rawRedirect : `${rawRedirect}/`, true);
          return;
        }
      }
    }
    const target = pendingProtectedPathRef.current || '/feed';
    pendingProtectedPathRef.current = null;
    setProtectedRedirectNotice(null);
    navigateToPath(target, true);
  };

  const handleLogout = async () => {
    await store.logout();
    pendingProtectedPathRef.current = null;
    setProtectedRedirectNotice(null);
    setPreviewOnboarding(false);
    setAuthMode('signin');
    setActiveTab('feed');
    setFeedSearchQuery('');
    setActiveChatId(null);
    setSelectedPublicProfile(null);
    setConnectionsOwner(null);
    setRemoteOtherConnections(null);
    setComposerOpen(false);
    setAddStoryOpen(false);
    setActiveStoryAuthorId(null);
    navigateToPath('/auth', true);
  };

  const handleOpenMention = (handle: string) => {
    const clean = handle.toLowerCase().replace(/^@+/, '');
    if (clean === store.profile.handle.toLowerCase()) {
      selectWorkspaceTab('profile');
      return;
    }
    const foundUser = store.communityUsers.find(
      (u) => u.handle.toLowerCase() === clean
    );
    if (foundUser) {
      handleOpenPublicProfile(
        foundUser.uid,
        undefined,
        activeTab === 'public-profile' ? publicProfileReturnTab : (activeTab as any)
      );
      return;
    }
    const postMatch = store.posts.find(
      (p) => p.authorHandle.toLowerCase() === clean
    );
    if (postMatch) {
      handleOpenPublicProfile(
        postMatch.authorId,
        postMatch,
        activeTab === 'public-profile' ? publicProfileReturnTab : (activeTab as any)
      );
    }
  };

  const handleHashtagClick = (tag: string) => {
    const clean = normalizeHashtag(tag);
    setFeedSearchQuery(clean ? `#${clean}` : '');
    selectWorkspaceTab('feed');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleOpenDm = async (creator: UserProfile) => {
    if (creator.uid === store.profile.uid) return;
    const thread = await store.startDirectThread(creator);
    setActiveChatId(thread.id);
    selectWorkspaceTab('messages');
  };

  const handleOpenPublicProfile = async (
    targetUid: string,
    fallbackPost?: Post,
    returnTab: 'feed' | 'connections' | 'profile' | 'messages' | 'marketplace' = 'feed'
  ) => {
    if (targetUid === store.profile.uid) {
      selectWorkspaceTab('profile');
      return;
    }
    setPublicProfileReturnTab(returnTab);
    const immediate = resolvePublicProfile(
      targetUid,
      store.profile,
      store.allKnownChatUsers,
      fallbackPost ? [fallbackPost, ...store.posts] : store.posts
    );
    if (immediate) {
      setSelectedPublicProfile(immediate);
    }
    setActiveTab('public-profile');
    setLoadingPublicProfile(true);
    try {
      const [resolved, otherConns] = await Promise.all([
        store.fetchPublicUserProfile(targetUid, fallbackPost),
        store.fetchOtherUserConnections(targetUid),
      ]);
      if (resolved) {
        setSelectedPublicProfile(resolved);
      }
      setRemoteOtherConnections({
        targetUid,
        followerIds: otherConns.followerIds,
        followingIds: otherConns.followingIds,
      });
    } finally {
      setLoadingPublicProfile(false);
    }
  };

  const openConnections = (
    tab: ConnectionsTab = 'followers',
    owner: UserProfile | null = null
  ) => {
    setConnectionsOwner(owner);
    setConnectionsTab(tab);
    selectWorkspaceTab('connections');
  };

  const getConnectionsForUser = (target: UserProfile) => {
    const remoteMatch =
      remoteOtherConnections?.targetUid === target.uid
        ? remoteOtherConnections
        : null;
    return computeOtherUserConnections(
      target.uid,
      store.profile,
      store.communityUsers,
      store.followedUserIds,
      store.followerUserIds,
      {},
      remoteMatch?.followerIds || [],
      remoteMatch?.followingIds || []
    );
  };

  const handleReplyToStory = async (group: StoryGroup, text: string) => {
    if (group.authorId === store.profile.uid) return;
    const matchedCreator =
      store.communityUsers.find((u) => u.uid === group.authorId) || {
        uid: group.authorId,
        displayName: group.authorName,
        handle: group.authorHandle,
        bio: 'Creator on Looma.',
        avatarUrl: group.authorAvatar,
        location: 'Looma Community',
        interests: [],
        followersCount: 0,
        followingCount: 0,
        onboardingCompleted: true,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      };
    const thread = await store.startDirectThread(matchedCreator);
    await store.sendChatMessage(thread, `Story reply: ${text}`);
  };

  const handleSharePostToChat = async (thread: ChatThread, post: Post) => {
    await store.sendChatMessage(thread, formatSharedPostMessage(post));
  };

  if (activeLegalDoc) {
    return (
      <>
        <Suspense fallback={<RouteLoadingFallback />}>
          <LegalDocumentView
            activeDocId={activeLegalDoc}
            theme={store.theme}
            guidelinesConfig={store.guidelines}
            termsConfig={store.termsConfig}
            privacyConfig={store.privacyConfig}
            fromAuthSignup={!store.isAuthorized && authMode === 'signup'}
            consentAlreadyAccepted={hasRequiredAccountConsent(signupConsent)}
            onSelectDoc={openLegalDocument}
            onSetTheme={store.setThemeExplicit}
            onBack={closeLegalDocument}
            onAcceptAndReturn={() => {
              setSignupConsent({ termsAccepted: true, privacyAccepted: true });
              closeLegalDocument();
            }}
          />
        </Suspense>
        <OfflineIndicator />
      </>
    );
  }

  if (routeAccess.surface === 'landing') {
    return (
      <div className="looma-stage-enter">
        <Suspense fallback={<RouteLoadingFallback />}>
          <LandingPageApp
            embedded
            onOpenLegal={openLegalDocument}
          />
        </Suspense>
      </div>
    );
  }

  if (routeAccess.surface === 'admin') {
    return (
      <div className="looma-stage-enter">
        <Suspense fallback={<RouteLoadingFallback />}>
          <AdminApp embedded />
        </Suspense>
      </div>
    );
  }

  if (appStage === 'loading') {
    return (
      <>
        <InitializationScreen
          snapshot={initSnapshot}
          messageOverride="Restoring your session..."
        />
        <OfflineIndicator />
      </>
    );
  }

  if (!store.isAuthorized && (routeAccess.surface === 'marketplace' || routeAccess.surface === 'business-profile')) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 looma-stage-enter">
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto h-full px-4 md:px-6 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => navigateToPath('/marketplace')}
              className="flex items-center cursor-pointer"
            >
              <LoomaLogo />
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigateToPath('/marketplace')}
                className="min-h-[38px] px-3 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Marketplace
              </button>
              <button
                type="button"
                onClick={() => navigateToPath('/auth')}
                className="min-h-[38px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                Sign In
              </button>
            </div>
          </div>
        </header>
        <main
          className={
            routeAccess.surface === 'marketplace' && !routeAccess.productId
              ? 'w-full min-h-[calc(100dvh-3.5rem)] md:min-h-[calc(100dvh-4rem)]'
              : 'max-w-7xl mx-auto px-4 md:px-6 py-6'
          }
        >
          <Suspense fallback={<RouteLoadingFallback />}>
            {routeAccess.surface === 'business-profile' && routeAccess.businessSlug ? (
              <BusinessProfilePage
                slug={routeAccess.businessSlug}
                currentProfile={store.profile}
                isAuthorized={false}
                memberships={[]}
                posts={store.posts}
                commentsByPost={store.commentsByPost}
                likedPostIds={[]}
                bookmarkedPostIds={[]}
                shareThreads={[]}
                categories={store.categories}
                onBack={() => navigateToPath('/marketplace')}
                onRequireAuth={() => navigateToPath('/auth')}
                onEditBusiness={() => navigateToPath('/auth')}
                onCreateBusinessPost={() => navigateToPath('/auth')}
                onMessageOwner={() => navigateToPath('/auth')}
                onOpenProduct={openProductDetailRoute}
                onToggleLike={() => navigateToPath('/auth')}
                onToggleBookmark={() => navigateToPath('/auth')}
                onAddComment={async () => {
                  navigateToPath('/auth');
                }}
                onUpdatePost={async () => {}}
                onDeletePost={async () => {}}
                onDeleteComment={async () => {}}
                onShareToStory={() => {}}
                onShareToChat={async () => {}}
                onMentionClick={() => navigateToPath('/auth')}
                onSelectHashtag={() => navigateToPath('/auth')}
              />
            ) : routeAccess.productId ? (
              <ProductDetailPage
                productId={routeAccess.productId}
                currentProfile={store.profile}
                accountEmail={null}
                isAuthorized={false}
                isFirebaseBacked={true}
                onBack={() => navigateToPath('/marketplace')}
                onRequireAuth={() => navigateToPath('/auth')}
                onOpenBusinessProfile={openBusinessProfileRoute}
                onMessageSeller={() => navigateToPath('/auth')}
              />
            ) : (
              <MarketplaceView
                profile={store.profile}
                knownUsers={[store.profile, ...store.allKnownChatUsers]}
                followedUserIds={[]}
                threads={[]}
                accountEmail={null}
                isAuthorized={false}
                isFirebaseBacked={true}
                initialStoreSlug={
                  searchParams?.get('store') || searchParams?.get('storeId') || null
                }
                marketplaceEnabled={store.featureFlags.marketplaceEnabled ?? true}
                onMessageSeller={() => navigateToPath('/auth')}
                onToggleFollowSeller={() => navigateToPath('/auth')}
                onOpenInbox={() => navigateToPath('/auth')}
                onOpenChatThread={() => navigateToPath('/auth')}
                onOpenSellerProfile={() => navigateToPath('/auth')}
                onOpenBusinessProfile={openBusinessProfileRoute}
                onOpenProductDetail={openProductDetailRoute}
                onRequireAuth={() => navigateToPath('/auth')}
              />
            )}
          </Suspense>
        </main>
        <OfflineIndicator />
      </div>
    );
  }

  if (appStage === 'auth' || !store.isAuthorized || routeAccess.surface === 'auth') {
    return (
      <div className="looma-stage-enter">
        <AuthView
          initialMode={authMode}
          mode={authMode}
          onModeChange={(nextMode) => {
            setAuthMode(nextMode);
            if (routeLocation.pathname === '/auth') {
              navigateToPath(
                nextMode === 'signup' ? '/auth?mode=signup' : '/auth',
                true
              );
            }
          }}
          consent={signupConsent}
          onConsentChange={setSignupConsent}
          onOpenLegal={openLegalDocument}
          protectedRedirectNotice={
            protectedRedirectNotice || routeAccess.protectedNotice || null
          }
          profile={store.profile}
          firebaseUser={store.firebaseUser}
          authLoading={store.authLoading}
          authError={store.authError}
          theme={store.theme}
          onSetTheme={store.setThemeExplicit}
          onLoginGoogle={async (options) => {
            await store.loginWithGoogle(options);
            navigateAfterAuthentication();
          }}
          onLoginApple={async (options) => {
            await store.loginWithApple(options);
            navigateAfterAuthentication();
          }}
          onLoginEmail={async (email, pass) => {
            await store.loginWithEmail(email, pass);
            navigateAfterAuthentication();
          }}
          onSignupEmail={async (email, pass, name, consent) => {
            await store.signupWithEmail(email, pass, name, consent);
            navigateAfterAuthentication();
          }}
          onResendVerification={store.resendEmailVerificationLink}
          onCheckVerified={store.refreshVerificationStatus}
          onSendPasswordReset={store.sendPasswordResetLink}
          onLogout={handleLogout}
          onContinueAuthenticated={() => {
            navigateAfterAuthentication();
          }}
          registrationsOpen={store.featureFlags.registrationsOpen}
          maintenanceMode={store.featureFlags.maintenanceMode}
        />
        <OfflineIndicator />
      </div>
    );
  }

  if (previewOnboarding || appStage === 'onboarding') {
    return (
      <div className="looma-stage-enter">
        <OnboardingFlow
          profile={store.profile}
          firebaseUser={store.firebaseUser}
          theme={store.theme}
          pushPermission={store.pushPermission}
          suggestedCreators={store.communityUsers}
          followedUserIds={store.followedUserIds}
          followersCount={store.profile.followersCount}
          onToggleFollow={store.toggleFollowUser}
          onSetTheme={store.setThemeExplicit}
          onEnablePush={store.enablePushNotifications}
          onSkip={async () => {
            await store.completeOnboarding({});
            setPreviewOnboarding(false);
            navigateAfterAuthentication();
          }}
          onComplete={async (data) => {
            await store.completeOnboarding(data);
            setPreviewOnboarding(false);
            navigateAfterAuthentication();
          }}
        />
        <OfflineIndicator />
      </div>
    );
  }

  const handleAppealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingAppeal) return;
    setAppealError(null);
    setAppealSuccessNotice(null);
    setSubmittingAppeal(true);
    try {
      await store.submitModerationAppeal({
        reason: appealReason,
        targetId: store.profile.uid,
      });
      setAppealReason('');
      setAppealSuccessNotice('Your appeal has been submitted for moderator review.');
    } catch (err) {
      setAppealError(err instanceof Error ? err.message : 'Unable to submit appeal.');
    } finally {
      setSubmittingAppeal(false);
    }
  };

  if (store.memberModeration?.status === 'suspended' && !isUserAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
        <header className="h-16 px-4 md:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
          <LoomaLogo />
          <button
            type="button"
            onClick={handleLogout}
            className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Log Out</span>
          </button>
        </header>
        <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 md:py-12 space-y-6">
          <section
            data-testid="account-suspended-gate"
            className="rounded-2xl border border-rose-200 dark:border-rose-900/70 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <span className="inline-block px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 text-[11px] font-semibold">
                  Account Suspended
                </span>
                <h1 className="font-display text-xl sm:text-2xl font-bold mt-2">
                  Your account access is temporarily suspended
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                  {store.memberModeration.reason ||
                    'Your account has been suspended by a Looma moderator following a community safety review.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => openLegalDocument('guidelines')}
                className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Read Community Guidelines
              </button>
            </div>

            <form onSubmit={handleAppealSubmit} className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <h2 className="text-sm font-bold">Submit a Moderation Appeal</h2>
              <textarea
                rows={3}
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                maxLength={600}
                placeholder="Explain why your account should be reinstated or clarify what happened..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
              />
              {appealError && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {appealError}
                </p>
              )}
              {appealSuccessNotice && (
                <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">
                  {appealSuccessNotice}
                </p>
              )}
              <button
                type="submit"
                disabled={submittingAppeal}
                className="min-h-[42px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {submittingAppeal ? 'Submitting Appeal...' : 'Submit Appeal'}
              </button>
            </form>

            {store.userAppeals.length > 0 && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Recent Appeals
                </h3>
                <div className="space-y-2">
                  {store.userAppeals.map((appeal) => (
                    <div
                      key={appeal.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold capitalize px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {appeal.status}
                        </span>
                        <span className="text-slate-400 tabular-nums">
                          {formatRelativeTime(appeal.createdAtMs)}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300">{appeal.reason}</p>
                      {appeal.reviewerNote && (
                        <p className="text-slate-500 dark:text-slate-400">
                          Reviewer note: {appeal.reviewerNote}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </main>
        <OfflineIndicator />
      </div>
    );
  }

  const isMessagesFullScreen = activeTab === 'messages';
  const isMessageProfileFullScreen =
    activeTab === 'public-profile' && publicProfileReturnTab === 'messages';
  const isMarketplaceFullScreen =
    activeTab === 'marketplace' || activeTab === 'product-detail';
  const hideWorkspaceRail =
    isMessagesFullScreen || isMessageProfileFullScreen || isMarketplaceFullScreen;

  return (
    <div
      className={
        isMessagesFullScreen
          ? 'h-[100dvh] overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors looma-stage-enter'
          : 'min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20 md:pb-10 transition-colors looma-stage-enter'
      }
    >
      <TopBar
        activeTab={activeTab}
        onSelectTab={selectWorkspaceTab}
        unreadNotifications={
          activeBusinessProfile ? unreadBusinessNotifications : unreadCount
        }
        onLogoClick={() => setBrandModalOpen(true)}
        rightSlot={
          <BusinessSwitcherMenu
            profile={store.profile}
            iconOnly
            align="right"
            onCreateBusiness={() => {
              setBusinessModalMode('create');
              setEditingBusinessProfile(null);
              setBusinessModalOpen(true);
            }}
            onSwitchToUnifiedPersonal={async () => {
              await store.updateProfile({ accountType: 'personal' });
            }}
          />
        }
        searchQuery={feedSearchQuery}
        onSearchChange={(query) => {
          setFeedSearchQuery(query);
          if (activeTab !== 'feed' && query.trim()) {
            selectWorkspaceTab('feed');
          }
        }}
        onSearchSubmit={(query) => {
          if (activeTab !== 'feed' && query.trim()) {
            selectWorkspaceTab('feed');
          }
        }}
      />

      <PushToast
        notification={store.activeToast}
        onDismiss={store.dismissToast}
        onOpenNotifications={() => selectWorkspaceTab('notifications')}
      />

      {(store.featureFlags.maintenanceMode ||
        visibleAnnouncements.length > 0 ||
        store.memberModeration?.status === 'restricted') && (
        <div className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-3.5 space-y-2 shrink-0">
          {store.featureFlags.maintenanceMode && (
            <div
              role="status"
              data-testid="workspace-maintenance-banner"
              className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2.5"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
              <span className="font-medium">
                Scheduled maintenance mode is active. Posting and call availability may be limited.
              </span>
            </div>
          )}

          {store.memberModeration?.status === 'restricted' && (
            <div
              role="status"
              data-testid="account-restricted-banner"
              className="rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-900 dark:text-rose-200 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-semibold">
                    Account Restricted — posting, replies, and calls are paused
                  </p>
                  <p className="text-rose-700 dark:text-rose-300 mt-0.5">
                    {store.memberModeration.reason || 'A moderator temporarily restricted posting actions on this account.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {store.userAppeals[0] && (
                  <span className="px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-[11px] font-semibold capitalize">
                    Appeal: {store.userAppeals[0].status}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAppealError(null);
                    setAppealSuccessNotice(null);
                    setAppealModalOpen(true);
                  }}
                  className="min-h-[36px] px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Submit Appeal
                </button>
              </div>
            </div>
          )}

          {visibleAnnouncements.map((ann) => {
            const toneClass =
              ann.severity === 'maintenance'
                ? 'border-rose-200 dark:border-rose-900/70 bg-rose-50/90 dark:bg-rose-950/30 text-rose-900 dark:text-rose-100'
                : ann.severity === 'warning'
                  ? 'border-amber-200 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100'
                  : 'border-blue-200 dark:border-blue-900/70 bg-blue-50/90 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100';
            return (
              <div
                key={ann.id}
                role="status"
                data-testid={`platform-announcement-${ann.id}`}
                className={`rounded-xl border px-4 py-3 text-xs flex items-start justify-between gap-3 ${toneClass}`}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-white/70 dark:bg-slate-900/60 text-[10px] font-bold uppercase tracking-wider">
                      {ann.severity}
                    </span>
                    <p className="font-bold text-sm">{ann.title}</p>
                  </div>
                  <p className="leading-relaxed opacity-90">{ann.body}</p>
                </div>
                <button
                  type="button"
                  onClick={() => persistReadAnnouncements([ann.id])}
                  aria-label={`Dismiss announcement ${ann.title}`}
                  className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <main
        className={
          isMessagesFullScreen
            ? 'flex-1 min-h-0 w-full flex flex-col overflow-hidden'
            : isMarketplaceFullScreen || isMessageProfileFullScreen
              ? 'w-full flex-1 min-w-0'
              : 'max-w-7xl mx-auto px-4 md:px-6 pt-5 md:pt-7 flex items-start gap-6'
        }
      >
        {/* Left Navigation & Account Rail (Desktop) */}
        {!hideWorkspaceRail && (
          <aside
            aria-label="Account and appearance controls"
            className="hidden lg:flex lg:w-64 shrink-0 flex-col gap-4 sticky top-23"
          >
          <div
            data-testid="rail-profile-card"
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => selectWorkspaceTab('profile')}
                className="flex items-center gap-3 text-left cursor-pointer group min-w-0 flex-1"
              >
                <Avatar
                  src={
                    activeBusinessProfile
                      ? activeBusinessProfile.logoUrl
                      : store.profile.avatarUrl
                  }
                  name={
                    activeBusinessProfile
                      ? activeBusinessProfile.displayName
                      : store.profile.displayName
                  }
                  size="md"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 inline-flex items-center gap-1.5 max-w-full">
                    <span className="truncate">
                      {activeBusinessProfile
                        ? activeBusinessProfile.displayName
                        : store.profile.displayName}
                    </span>
                    {(activeBusinessProfile
                      ? activeBusinessProfile.verified
                      : store.profile.isVerified || isUserAdmin) && (
                      <VerifiedBadge size={14} />
                    )}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {activeBusinessProfile
                      ? `/business/${activeBusinessProfile.slug}`
                      : `@${store.profile.handle}`}
                  </p>
                </div>
              </button>

              <BusinessSwitcherMenu
                profile={store.profile}
                iconOnly
                align="left"
                onCreateBusiness={() => {
                  setBusinessModalMode('create');
                  setEditingBusinessProfile(null);
                  setBusinessModalOpen(true);
                }}
                onSwitchToUnifiedPersonal={async () => {
                  await store.updateProfile({ accountType: 'personal' });
                }}
              />
            </div>

            {activeBusinessProfile ? (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs tabular-nums">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {activeBusinessProfile.followersCount}
                  </span>{' '}
                  <span className="text-slate-500 dark:text-slate-400">
                    Followers
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {
                      store.posts.filter(
                        (p) => p.authorId === activeBusinessProfile.id
                      ).length
                    }
                  </span>{' '}
                  <span className="text-slate-500 dark:text-slate-400">
                    Posts
                  </span>
                </div>
              </div>
            ) : (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs tabular-nums">
                <button
                  type="button"
                  onClick={() => openConnections('followers')}
                  className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {store.profile.followersCount}
                  </span>{' '}
                  <span className="text-slate-500 dark:text-slate-400">
                    Followers
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openConnections('following')}
                  className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {store.profile.followingCount}
                  </span>{' '}
                  <span className="text-slate-500 dark:text-slate-400">
                    Following
                  </span>
                </button>
              </div>
            )}
          </div>

          {activeTab !== 'profile' && activeTab !== 'notifications' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Business Profiles
              </span>
              <button
                type="button"
                onClick={() => {
                  setBusinessModalMode('create');
                  setEditingBusinessProfile(null);
                  setBusinessModalOpen(true);
                }}
                className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="w-3 h-3" aria-hidden="true" />
                <span>New</span>
              </button>
            </div>
            {businesses.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  setBusinessModalMode('create');
                  setEditingBusinessProfile(null);
                  setBusinessModalOpen(true);
                }}
                className="w-full min-h-[38px] px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Create Business Profile</span>
              </button>
            ) : (
              <div className="space-y-1">
                {businesses.map((biz) => (
                  <button
                    key={biz.id}
                    type="button"
                    onClick={() => openBusinessProfileRoute(biz.slug)}
                    className={`w-full px-2.5 py-2 rounded-xl flex items-center gap-2.5 text-left text-xs transition-colors cursor-pointer ${
                      activeTab === 'business-profile' && selectedBusinessSlug === biz.slug
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Avatar src={biz.logoUrl} name={biz.displayName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{biz.displayName}</p>
                      <p className="text-[11px] text-slate-400 truncate">/business/{biz.slug}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 space-y-1.5">
            <button
              type="button"
              onClick={store.toggleTheme}
              className="w-full min-h-[42px] px-3 rounded-xl flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                {store.theme === 'dark' ? (
                  <Sun className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Moon className="w-4 h-4" aria-hidden="true" />
                )}
                <span>{store.theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </span>
              <span className="text-slate-400 capitalize">{store.theme}</span>
            </button>

            <button
              type="button"
              onClick={() => selectWorkspaceTab('notifications')}
              className="w-full min-h-[42px] px-3 rounded-xl flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer tabular-nums"
            >
              <span className="flex items-center gap-2.5">
                <Bell className="w-4 h-4" aria-hidden="true" />
                <span>Push Alerts</span>
              </span>
              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                {unreadCount > 0 ? `${unreadCount} new` : 'Active'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => openConnections('friends')}
              className={`w-full min-h-[42px] px-3 rounded-xl flex items-center justify-between text-xs font-medium transition-colors cursor-pointer tabular-nums ${
                activeTab === 'connections'
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Users className="w-4 h-4" aria-hidden="true" />
                <span>Connections</span>
              </span>
              <span className="text-slate-400">
                {store.connections.friends.length} friends
              </span>
            </button>

            <button
              type="button"
              onClick={() => selectWorkspaceTab('marketplace')}
              className="w-full min-h-[42px] px-3 rounded-xl flex items-center justify-between text-xs font-medium transition-colors cursor-pointer text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="flex items-center gap-2.5">
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                <span>Marketplace</span>
              </span>
              <span className="text-slate-400">Shop</span>
            </button>

            <button
              type="button"
              onClick={() => selectWorkspaceTab('settings')}
              className={`w-full min-h-[42px] px-3 rounded-xl flex items-center justify-between text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Settings className="w-4 h-4" aria-hidden="true" />
                <span>Profile Settings</span>
              </span>
            </button>

            <PWAInstallButton />

            <button
              type="button"
              onClick={handleLogout}
              className="w-full min-h-[42px] px-3 rounded-xl flex items-center gap-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Log Out</span>
            </button>
          </div>
        </aside>
        )}

        {/* Center Main Content */}
        <div
          className={
            isMessagesFullScreen
              ? 'w-full flex-1 min-h-0 flex flex-col pb-14 md:pb-0'
              : isMarketplaceFullScreen
                ? 'w-full flex-1 min-w-0'
                : isMessageProfileFullScreen
                  ? 'w-full flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-5 md:py-7'
                  : 'flex-1 min-w-0 max-w-2xl mx-auto lg:mx-0'
          }
        >
          {activeTab === 'feed' && (
            <FeedView
              profile={store.profile}
              activeBusinessProfile={activeBusinessProfile}
              posts={store.posts}
              canManageBusinessIds={canManageBusinessIds}
              storyGroups={store.storyGroups}
              commentsByPost={store.commentsByPost}
              likedPostIds={store.likedPostIds}
              bookmarkedPostIds={store.bookmarkedPostIds}
              followedUserIds={store.followedUserIds}
              shareThreads={store.threads}
              categories={store.categories}
              searchQuery={feedSearchQuery}
              onSearchQueryChange={setFeedSearchQuery}
              onOpenComposer={() => {
                setComposerInitialBusinessId(
                  activeIdentity.type === 'business' ? activeIdentity.businessProfileId : null
                );
                setComposerOpen(true);
              }}
              onOpenStory={(group) => setActiveStoryAuthorId(group.authorId)}
              onOpenAddStory={() => setAddStoryOpen(true)}
              onToggleLike={store.toggleLike}
              onToggleBookmark={store.toggleBookmark}
              onAddComment={store.addComment}
              onUpdatePost={store.updatePost}
              onDeletePost={store.deletePost}
              onDeleteComment={store.deleteComment}
              onShareToStory={store.sharePostToStory}
              onShareToChat={handleSharePostToChat}
              onAuthorClick={(post) => {
                if (post.authorType === 'business' && post.authorHandle) {
                  openBusinessProfileRoute(post.authorHandle);
                  return;
                }
                handleOpenPublicProfile(post.authorId, post);
              }}
              onMentionClick={handleOpenMention}
              onSelectHashtag={handleHashtagClick}
              storiesEnabled={store.featureFlags.storiesEnabled}
              onReportPost={async (post, category, reason) => {
                await store.submitContentReport({
                  targetType: 'post',
                  targetId: post.id,
                  targetAuthorUid: post.authorId,
                  targetSummary: post.caption || post.mediaTitle || `Post by @${post.authorHandle}`,
                  category,
                  reason,
                });
              }}
            />
          )}

          {activeTab === 'business-profile' && selectedBusinessSlug && (
            <Suspense fallback={<RouteLoadingFallback />}>
              <BusinessProfilePage
                slug={selectedBusinessSlug}
                currentProfile={store.profile}
                isAuthorized={store.isAuthorized}
                memberships={memberships}
                posts={store.posts}
                commentsByPost={store.commentsByPost}
                likedPostIds={store.likedPostIds}
                bookmarkedPostIds={store.bookmarkedPostIds}
                shareThreads={store.threads}
                categories={store.categories}
                onBack={() => selectWorkspaceTab('feed')}
                onRequireAuth={() => navigateToPath('/auth')}
                onEditBusiness={(bp) => {
                  setBusinessModalMode('edit');
                  setEditingBusinessProfile(bp);
                  setBusinessModalOpen(true);
                }}
                onCreateBusinessPost={(bp) => {
                  setComposerInitialBusinessId(bp.id);
                  setComposerOpen(true);
                }}
                onMessageOwner={async (ownerUid, businessName) => {
                  if (!ownerUid || ownerUid === store.profile.uid) return;
                  const target =
                    store.allKnownChatUsers.find((u) => u.uid === ownerUid) ||
                    (await store.fetchPublicUserProfile(ownerUid));
                  if (target) {
                    const thread = await store.startDirectThread(target);
                    setActiveChatId(thread.id);
                    selectWorkspaceTab('messages');
                  } else {
                    setProtectedRedirectNotice(`Chat unavailable for ${businessName}.`);
                  }
                }}
                onOpenProduct={openProductDetailRoute}
                onToggleLike={store.toggleLike}
                onToggleBookmark={store.toggleBookmark}
                onAddComment={store.addComment}
                onUpdatePost={store.updatePost}
                onDeletePost={store.deletePost}
                onDeleteComment={store.deleteComment}
                onShareToStory={store.sharePostToStory}
                onShareToChat={handleSharePostToChat}
                onMentionClick={handleOpenMention}
                onSelectHashtag={handleHashtagClick}
              />
            </Suspense>
          )}

          {activeTab === 'marketplace' && (
            <Suspense fallback={<RouteLoadingFallback />}>
              <MarketplaceView
                profile={store.profile}
                knownUsers={[store.profile, ...store.allKnownChatUsers]}
                followedUserIds={store.followedUserIds}
                threads={store.threads}
                accountEmail={store.firebaseUser?.email || null}
                isAuthorized={store.isAuthorized}
                isFirebaseBacked={
                  Boolean(store.firebaseUser) && !store.isLocalAutostart
                }
                initialStoreSlug={
                  searchParams?.get('store') || searchParams?.get('storeId') || null
                }
                marketplaceEnabled={store.featureFlags.marketplaceEnabled ?? true}
                onMessageSeller={async (sellerUid, initialMessage, listingContext) => {
                  if (!sellerUid || sellerUid === store.profile.uid) return;
                  const cached = store.allKnownChatUsers.find(
                    (u) => u.uid === sellerUid
                  );
                  const targetUser =
                    cached || (await store.fetchPublicUserProfile(sellerUid));
                  if (!targetUser) {
                    handleOpenPublicProfile(sellerUid, undefined, 'marketplace');
                    return;
                  }
                  const thread = await store.startDirectThread(targetUser);
                  if (initialMessage && initialMessage.trim()) {
                    const formatted = listingContext
                      ? `${initialMessage.trim()}\n[${listingContext.title} · ${listingContext.priceFormatted}]`
                      : initialMessage.trim();
                    await store.sendChatMessage(thread, formatted);
                    setActiveChatId(thread.id);
                    return;
                  }
                  setActiveChatId(thread.id);
                  selectWorkspaceTab('messages');
                }}
                onToggleFollowSeller={(sellerUid) => store.toggleFollowUser(sellerUid)}
                onOpenInbox={() => selectWorkspaceTab('messages')}
                onOpenChatThread={(threadId) => {
                  if (threadId) {
                    setActiveChatId(threadId);
                  }
                  selectWorkspaceTab('messages');
                }}
                onOpenSellerProfile={(sellerUid) =>
                  handleOpenPublicProfile(sellerUid, undefined, 'marketplace')
                }
                onOpenBusinessProfile={openBusinessProfileRoute}
                onOpenProductDetail={openProductDetailRoute}
                onRequireAuth={() => navigateToPath('/auth')}
              />
            </Suspense>
          )}

          {activeTab === 'product-detail' && selectedProductId && (
            <Suspense fallback={<RouteLoadingFallback />}>
              <ProductDetailPage
                productId={selectedProductId}
                currentProfile={store.profile}
                accountEmail={store.firebaseUser?.email || null}
                isAuthorized={store.isAuthorized}
                isFirebaseBacked={
                  Boolean(store.firebaseUser) && !store.isLocalAutostart
                }
                onBack={() => selectWorkspaceTab('marketplace')}
                onRequireAuth={() => navigateToPath('/auth')}
                onOpenBusinessProfile={openBusinessProfileRoute}
                onMessageSeller={async (sellerUid, initialMessage, listingContext) => {
                  if (!sellerUid || sellerUid === store.profile.uid) return;
                  const cached = store.allKnownChatUsers.find(
                    (u) => u.uid === sellerUid
                  );
                  const targetUser =
                    cached || (await store.fetchPublicUserProfile(sellerUid));
                  if (!targetUser) {
                    handleOpenPublicProfile(sellerUid, undefined, 'marketplace');
                    return;
                  }
                  const thread = await store.startDirectThread(targetUser);
                  if (initialMessage && initialMessage.trim()) {
                    const formatted = listingContext
                      ? `${initialMessage.trim()}\n[${listingContext.title} · ${listingContext.priceFormatted}]`
                      : initialMessage.trim();
                    await store.sendChatMessage(thread, formatted);
                  }
                  setActiveChatId(thread.id);
                  selectWorkspaceTab('messages');
                }}
              />
            </Suspense>
          )}

          {activeTab === 'public-profile' && selectedPublicProfile && (() => {
            const liveCreator =
              resolveLiveProfile(
                selectedPublicProfile,
                store.profile,
                store.allKnownChatUsers
              ) || selectedPublicProfile;
            const creatorConnections = getConnectionsForUser(liveCreator);
            return (
              <Suspense fallback={<RouteLoadingFallback />}>
                <PublicProfileView
                  creator={liveCreator}
                  currentUserId={store.profile.uid}
                  loading={loadingPublicProfile}
                  fullScreen={isMessageProfileFullScreen}
                  ownerBusinesses={publicProfileBusinesses}
                  loadingBusinesses={loadingPublicBusinesses}
                  onOpenBusinessProfile={openBusinessProfileRoute}
                  isFollowing={store.followedUserIds.includes(
                    liveCreator.uid
                  )}
                  followersCount={creatorConnections.followers.length}
                  followingCount={creatorConnections.following.length}
                  friendsCount={creatorConnections.friends.length}
                  posts={store.posts}
                  categories={store.categories}
                  likedPostIds={store.likedPostIds}
                  bookmarkedPostIds={store.bookmarkedPostIds}
                  commentsByPost={store.commentsByPost}
                  shareThreads={store.threads}
                  backLabel={
                    publicProfileReturnTab === 'connections'
                      ? 'Back to Connections'
                      : publicProfileReturnTab === 'profile'
                        ? 'Back to Profile'
                        : publicProfileReturnTab === 'messages'
                          ? 'Back to Messages'
                          : publicProfileReturnTab === 'marketplace'
                            ? 'Back to Marketplace'
                            : 'Back to Feed'
                  }
                  onToggleFollow={store.toggleFollowUser}
                  onMessage={handleOpenDm}
                  onStartCallWithUser={store.startCallWithUser}
                  onOpenConnections={(tab) =>
                    openConnections(tab, liveCreator)
                  }
                  onBack={() => selectWorkspaceTab(publicProfileReturnTab)}
                  onToggleLike={store.toggleLike}
                  onToggleBookmark={store.toggleBookmark}
                  onAddComment={store.addComment}
                  onUpdatePost={store.updatePost}
                  onDeletePost={store.deletePost}
                  onDeleteComment={store.deleteComment}
                  onShareToStory={store.sharePostToStory}
                  onShareToChat={handleSharePostToChat}
                  onMentionClick={handleOpenMention}
                  onSelectHashtag={handleHashtagClick}
                  callsEnabled={store.featureFlags.callsEnabled}
                  storiesEnabled={store.featureFlags.storiesEnabled}
                  onReportPost={async (post, category, reason) => {
                    await store.submitContentReport({
                      targetType: 'post',
                      targetId: post.id,
                      targetAuthorUid: post.authorId,
                      targetSummary: post.caption || post.mediaTitle || `Post by @${post.authorHandle}`,
                      category,
                      reason,
                    });
                  }}
                  onReportUser={async (creator, category, reason) => {
                    await store.submitContentReport({
                      targetType: 'user',
                      targetId: creator.uid,
                      targetAuthorUid: creator.uid,
                      targetSummary: `${creator.displayName} (@${creator.handle})`,
                      category,
                      reason,
                    });
                  }}
                />
              </Suspense>
            );
          })()}

          {activeTab === 'messages' && (
            <Suspense fallback={<RouteLoadingFallback />}>
              <ChatView
                profile={store.profile}
                activeBusinessProfile={activeBusinessProfile}
                threads={store.threads}
                messagesByChat={store.messagesByChat}
                mutedChatIds={store.mutedChatIds}
                pushEnabled={store.pushEnabled}
                onlineUserIds={store.onlineUserIds}
                communityUsers={store.communityUsers}
                chatUsers={store.allKnownChatUsers}
                initialThreadId={activeChatId}
                isFirebaseBacked={
                  Boolean(store.firebaseUser) && !store.isLocalAutostart
                }
                typingByChat={store.typingByChat}
                readReceiptsByChat={store.readReceiptsByChat}
                onSubscribeThread={store.subscribeChatMessages}
                onSendMessage={store.sendChatMessage}
                onSetTyping={store.setTypingStatus}
                onMarkThreadRead={store.markThreadRead}
                onStartDirectThread={store.startDirectThread}
                onCreateGroupThread={store.createGroupThread}
                onAddParticipants={async (chatId, ids) => {
                  await store.addGroupParticipants(chatId, ids);
                }}
                onRemoveParticipant={async (chatId, uid) => {
                  await store.removeGroupParticipant(chatId, uid);
                }}
                onRenameGroup={async (chatId, nextTitle) => {
                  await store.renameGroupThread(chatId, nextTitle);
                }}
                onPromoteAdmin={async (chatId, uid) => {
                  await store.promoteGroupAdmin(chatId, uid);
                }}
                onToggleMuteChat={store.toggleMuteChat}
                onEnablePush={store.enablePushNotifications}
                onOpenPublicProfile={(uid) =>
                  handleOpenPublicProfile(uid, undefined, 'messages')
                }
                onStartCall={store.startCall}
                onStartInstantCall={store.startInstantCall}
                onReportChat={async (thread, category, reason) => {
                  await store.submitContentReport({
                    targetType: 'chat',
                    targetId: thread.id,
                    targetAuthorUid:
                      thread.partnerUid ||
                      thread.memberIds.find((id) => id !== store.profile.uid) ||
                      '',
                    targetSummary: `${thread.isGroup ? 'Group' : 'Direct'} chat: ${thread.title}`,
                    category,
                    reason,
                  });
                }}
                callsEnabled={store.featureFlags.callsEnabled}
                voiceNotesEnabled={store.featureFlags.voiceNotesEnabled}
              />
            </Suspense>
          )}

          {activeTab === 'notifications' && (
            <NotificationsView
              profile={store.profile}
              notifications={activityNotifications}
              activeBusinessProfile={activeBusinessProfile}
              businessNotifications={businessNotifications}
              onMarkBusinessNotificationRead={async (notifId) => {
                if (activeBusinessProfile) {
                  await markBusinessNotificationRead(activeBusinessProfile.id, notifId);
                }
              }}
              onMarkAllBusinessNotificationsRead={async () => {
                if (activeBusinessProfile) {
                  const unreadIds = businessNotifications
                    .filter((n) => !n.read)
                    .map((n) => n.id);
                  await markAllBusinessNotificationsRead(activeBusinessProfile.id, unreadIds);
                }
              }}
              verifiedAuthorIds={Array.from(verifiedUidSet)}
              pushPermission={store.pushPermission}
              onEnablePush={store.enablePushNotifications}
              onMarkRead={(id) => {
                const annId = extractAnnouncementIdFromNotificationId(id);
                if (annId) {
                  persistReadAnnouncements([annId]);
                } else {
                  store.markNotificationRead(id);
                }
              }}
              onMarkAllRead={() => {
                const activeAnnIds = activityNotifications
                  .map((item) => item.announcementId)
                  .filter((id): id is string => Boolean(id));
                if (activeAnnIds.length > 0) {
                  persistReadAnnouncements(activeAnnIds);
                }
                store.markAllNotificationsRead();
              }}
              onDeleteNotification={(id) => {
                const annId = extractAnnouncementIdFromNotificationId(id);
                if (annId) {
                  persistDeletedAnnouncements([annId]);
                } else {
                  return store.deleteNotification(id);
                }
              }}
              onClearAllNotifications={async () => {
                const activeAnnIds = activityNotifications
                  .map((item) => item.announcementId)
                  .filter((id): id is string => Boolean(id));
                if (activeAnnIds.length > 0) {
                  persistDeletedAnnouncements(activeAnnIds);
                }
                await store.clearAllNotifications();
              }}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileView
              profile={store.profile}
              activeBusinessProfile={activeBusinessProfile}
              canManageActiveBusiness={Boolean(
                activeBusinessProfile &&
                  canManageBusinessIds.includes(activeBusinessProfile.id)
              )}
              profileSwitcherSlot={
                <BusinessSwitcherMenu
                  profile={store.profile}
                  iconOnly
                  align="right"
                  onCreateBusiness={() => {
                    setBusinessModalMode('create');
                    setEditingBusinessProfile(null);
                    setBusinessModalOpen(true);
                  }}
                  onSwitchToUnifiedPersonal={async () => {
                    await store.updateProfile({ accountType: 'personal' });
                  }}
                />
              }
              posts={store.posts}
              categories={store.categories}
              followersCount={store.connections.followers.length}
              followingCount={store.connections.following.length}
              friendsCount={store.connections.friends.length}
              likedPostIds={store.likedPostIds}
              bookmarkedPostIds={store.bookmarkedPostIds}
              commentsByPost={store.commentsByPost}
              shareThreads={store.threads}
              onToggleLike={store.toggleLike}
              onToggleBookmark={store.toggleBookmark}
              onAddComment={store.addComment}
              onUpdatePost={store.updatePost}
              onDeletePost={store.deletePost}
              onDeleteComment={store.deleteComment}
              onShareToStory={store.sharePostToStory}
              onShareToChat={handleSharePostToChat}
              onCreateBusinessPost={(bp) => {
                setComposerInitialBusinessId(bp.id);
                setComposerOpen(true);
              }}
              onOpenSettings={() => selectWorkspaceTab('settings')}
              onOpenConnections={(tab) => openConnections(tab, null)}
              onAuthorClick={(post) => {
                if (post.authorType === 'business' && post.authorHandle) {
                  openBusinessProfileRoute(post.authorHandle);
                  return;
                }
                handleOpenPublicProfile(post.authorId, post, 'profile');
              }}
              onMentionClick={handleOpenMention}
              onSelectHashtag={handleHashtagClick}
              storiesEnabled={store.featureFlags.storiesEnabled}
              onReportPost={async (post, category, reason) => {
                await store.submitContentReport({
                  targetType: 'post',
                  targetId: post.id,
                  targetAuthorUid: post.authorId,
                  targetSummary: post.caption || post.mediaTitle || `Post by @${post.authorHandle}`,
                  category,
                  reason,
                });
              }}
            />
          )}

          {activeTab === 'connections' && (() => {
            const liveConnectionsOwner = resolveLiveProfile(
              connectionsOwner,
              store.profile,
              store.allKnownChatUsers
            );
            const viewingOther =
              liveConnectionsOwner &&
              liveConnectionsOwner.uid !== store.profile.uid;
            const activeConnections = viewingOther
              ? getConnectionsForUser(liveConnectionsOwner)
              : store.connections;
            return (
              <Suspense fallback={<RouteLoadingFallback />}>
                <ConnectionsView
                  initialTab={connectionsTab}
                  targetUser={viewingOther ? liveConnectionsOwner : null}
                  currentUserId={store.profile.uid}
                  followers={activeConnections.followers}
                  following={activeConnections.following}
                  friends={activeConnections.friends}
                  followerIds={store.followerUserIds}
                  followedUserIds={store.followedUserIds}
                  onBack={() => {
                    if (viewingOther) {
                      setSelectedPublicProfile(liveConnectionsOwner);
                      setActiveTab('public-profile');
                    } else {
                      selectWorkspaceTab('profile');
                    }
                  }}
                  onToggleFollow={store.toggleFollowUser}
                  onMessage={handleOpenDm}
                  onOpenPublicProfile={(person) => {
                    if (person.uid === store.profile.uid) {
                      selectWorkspaceTab('profile');
                      return;
                    }
                    handleOpenPublicProfile(person.uid, undefined, 'connections');
                  }}
                />
              </Suspense>
            );
          })()}

          {activeTab === 'settings' && (
            <Suspense fallback={<RouteLoadingFallback />}>
              <ProfileSettingsView
                profile={store.profile}
                privateSettings={store.privateSettings}
                accountEmail={store.firebaseUser?.email || null}
                theme={store.theme}
                pushPermission={store.pushPermission}
                activeIdentity={activeIdentity}
                businesses={businesses}
                memberships={memberships}
                onSwitchToPersonal={switchToPersonal}
                onSwitchToBusiness={switchToBusiness}
                onOpenBusinessProfile={openBusinessProfileRoute}
                onEditBusiness={(bp) => {
                  setBusinessModalMode('edit');
                  setEditingBusinessProfile(bp);
                  setBusinessModalOpen(true);
                }}
                onSetTheme={store.setThemeExplicit}
                onEnablePush={store.enablePushNotifications}
                onLogout={handleLogout}
                onOpenLegal={openLegalDocument}
                onDeleteAccount={async () => {
                  await store.deleteAccount();
                  setPreviewOnboarding(false);
                  setAuthMode('signin');
                  setActiveTab('feed');
                  setFeedSearchQuery('');
                  setActiveChatId(null);
                  setSelectedPublicProfile(null);
                  setConnectionsOwner(null);
                  setRemoteOtherConnections(null);
                  navigateToPath('/auth', true);
                }}
                onUpdateProfile={store.updateProfile}
                onUpdatePrivateSettings={store.updatePrivateSettings}
                onBack={() => selectWorkspaceTab('profile')}
                userVerificationRequest={store.currentUserVerificationRequest}
                onSubmitVerificationRequest={store.submitVerificationRequest}
                onCreateBusiness={() => {
                  setBusinessModalMode('create');
                  setEditingBusinessProfile(null);
                  setBusinessModalOpen(true);
                }}
              />
            </Suspense>
          )}
        </div>

        {/* Right Discovery & Active Chats Sidebar (Desktop) */}
        {activeTab !== 'messages' && activeTab !== 'marketplace' && (
          <aside
            aria-label="Community creators and active conversations"
            className="hidden xl:flex xl:w-80 shrink-0 flex-col gap-4 sticky top-23"
          >
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-bold">
                  Active Chats
                </h2>
                <button
                  type="button"
                  onClick={() => selectWorkspaceTab('messages')}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Open all
                </button>
              </div>
              {store.threads.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  No active conversations yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {store.threads.slice(0, 3).map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => {
                        setActiveChatId(thread.id);
                        selectWorkspaceTab('messages');
                      }}
                      className="w-full py-2.5 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl px-1.5 transition-colors cursor-pointer"
                    >
                      <Avatar
                        src={thread.partnerAvatar}
                        name={thread.title}
                        size="sm"
                        online={
                          getThreadOnlineStatus(
                            thread,
                            store.profile.uid,
                            store.onlineUserIds
                          ).isOnline
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold truncate">
                            {thread.title}
                          </p>
                          <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                            {formatRelativeTime(thread.updatedAtMs)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {formatLastMessageSnippet(thread.lastMessageText)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <h2 className="font-display text-sm font-bold">
                Community Members
              </h2>
              {store.communityUsers.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-1">
                  No other members have joined yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {store.communityUsers.slice(0, 4).map((creator) => (
                    <div
                      key={creator.uid}
                      className="flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenPublicProfile(creator.uid)}
                        aria-label={`View ${creator.displayName}'s profile`}
                        className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
                      >
                        <Avatar
                          src={creator.avatarUrl}
                          name={creator.displayName}
                          size="sm"
                          online={isUserOnline(
                            creator.uid,
                            store.onlineUserIds
                          )}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors inline-flex items-center gap-1 max-w-full">
                            <span className="truncate">{creator.displayName}</span>
                            {creator.isVerified && <VerifiedBadge size={12} />}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            @{creator.handle}
                            {creator.location ? ` · ${creator.location}` : ''}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDm(creator)}
                        aria-label={`Message ${creator.displayName}`}
                        className="min-h-[36px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Chat</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </main>

      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={selectWorkspaceTab}
        unreadNotifications={
          activeBusinessProfile ? unreadBusinessNotifications : unreadCount
        }
        activeAvatarUrl={
          activeBusinessProfile
            ? activeBusinessProfile.logoUrl
            : store.profile.avatarUrl
        }
        activeDisplayName={
          activeBusinessProfile
            ? activeBusinessProfile.displayName
            : store.profile.displayName
        }
      />

      <CreatePostModal
        open={composerOpen}
        profile={store.profile}
        publishableBusinesses={publishableBusinesses}
        initialBusinessProfileId={
          composerInitialBusinessId ??
          (activeIdentity.type === 'business'
            ? activeIdentity.businessProfileId
            : null)
        }
        communityUsers={store.communityUsers}
        savedHashtags={store.savedHashtags}
        categories={store.categories}
        voiceNotesEnabled={store.featureFlags.voiceNotesEnabled}
        onSaveHashtag={store.saveHashtag}
        onClose={() => {
          setComposerOpen(false);
          setComposerInitialBusinessId(null);
        }}
        onCreatePost={async (caption, category, imageUrl, extra) => {
          await store.createPost(caption, category, imageUrl, extra);
          if (extra?.businessAuthor?.slug && activeTab === 'business-profile') {
            openBusinessProfileRoute(extra.businessAuthor.slug);
          } else if (activeTab === 'profile') {
            selectWorkspaceTab('profile');
          } else {
            selectWorkspaceTab('feed');
          }
        }}
      />

      <BusinessProfileModal
        open={businessModalOpen}
        mode={businessModalMode}
        initialProfile={editingBusinessProfile}
        personalProfile={store.profile}
        onClose={() => {
          setBusinessModalOpen(false);
          setEditingBusinessProfile(null);
        }}
        onSaved={(savedProfile) => {
          switchToBusiness(savedProfile.id);
          openBusinessProfileRoute(savedProfile.slug);
        }}
      />

      <StoryViewerModal
        groups={store.storyGroups}
        activeAuthorId={activeStoryAuthorId}
        currentUid={store.profile.uid}
        onClose={() => setActiveStoryAuthorId(null)}
        onSelectAuthor={(authorId) => setActiveStoryAuthorId(authorId)}
        onMarkViewed={store.markStoryViewed}
        onOpenAuthorProfile={(authorId) => handleOpenPublicProfile(authorId)}
        onReplyToStory={handleReplyToStory}
        onDeleteStory={store.deleteStory}
      />

      <AddStoryModal
        open={addStoryOpen}
        onClose={() => setAddStoryOpen(false)}
        onCreateStory={async (caption, imageUrl) => {
          await store.addStory(caption, imageUrl);
          selectWorkspaceTab('feed');
        }}
      />

      <BrandLogoModal
        open={brandModalOpen}
        onClose={() => setBrandModalOpen(false)}
        onGoToFeed={() => selectWorkspaceTab('feed')}
      />

      {appealModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Submit moderation appeal"
          data-testid="moderation-appeal-modal"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold">Submit Moderation Appeal</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Request a review of your account restriction
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAppealModalOpen(false)}
                aria-label="Close appeal modal"
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleAppealSubmit} className="p-5 space-y-4">
              <textarea
                rows={4}
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                maxLength={600}
                placeholder="Explain why this restriction should be lifted..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
              />
              {appealError && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {appealError}
                </p>
              )}
              {appealSuccessNotice && (
                <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">
                  {appealSuccessNotice}
                </p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAppealModalOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={submittingAppeal}
                  className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {submittingAppeal ? 'Submitting...' : 'Submit Appeal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {store.callSession && (
        <Suspense fallback={null}>
          <CallRoomModal
            session={store.callSession}
            profile={store.profile}
            verifiedUserIds={Array.from(verifiedUidSet)}
            isLocalAutostart={store.isLocalAutostart}
            onEndCall={store.endCall}
            onToggleMute={store.toggleCallMute}
            onToggleVideo={store.toggleCallVideo}
            onToggleScreenShare={store.toggleCallScreenShare}
            onPublishPeerSession={store.publishCallPeerSession}
            onSubscribeCallPeers={store.subscribeCallPeers}
          />
        </Suspense>
      )}

      <IncomingCallModal
        invite={store.incomingCallInvite}
        callerVerified={
          store.incomingCallInvite
            ? verifiedUidSet.has(store.incomingCallInvite.callerId)
            : false
        }
        onAccept={store.acceptIncomingCall}
        onDecline={store.declineIncomingCall}
      />

      <OfflineIndicator />
      {isTransitioning && <OrbitSyncOverlay />}
    </div>
  );
}
