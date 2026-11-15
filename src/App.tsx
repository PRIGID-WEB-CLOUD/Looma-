import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, LogOut, MessageSquare, Moon, Settings, Sun, Users } from 'lucide-react';
import { useSocialStore } from './hooks/useSocialStore';
import type {
  ConnectionsTab,
  Post,
  StoryGroup,
  TabId,
  UserProfile,
} from './types/social';
import {
  computeOtherUserConnections,
  countUnreadNotifications,
  formatRelativeTime,
  getThreadOnlineStatus,
  isUserOnline,
  resolveAppStage,
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
import { CallRoomModal } from './components/CallRoomModal';
import { ChatView } from './components/ChatView';
import { ConnectionsView } from './components/ConnectionsView';
import { CreatePostModal } from './components/CreatePostModal';
import { FeedView } from './components/FeedView';
import { IncomingCallModal } from './components/IncomingCallModal';
import { LegalDocumentView } from './components/LegalDocumentView';
import { MobileBottomNav } from './components/MobileBottomNav';
import { NotificationsView } from './components/NotificationsView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { OnboardingFlow } from './components/OnboardingFlow';
import { ProfileSettingsView } from './components/ProfileSettingsView';
import { ProfileView } from './components/ProfileView';
import { PublicProfileView } from './components/PublicProfileView';
import { PushToast } from './components/PushToast';
import { PWAInstallButton } from './components/PWAInstallButton';
import { StoryViewerModal } from './components/StoryViewerModal';
import { TopBar } from './components/TopBar';
import { BrandLogoModal } from './components/BrandLogoModal';
import { useInitialization } from './app/initialization';
import { InitializationScreen } from './app/startup/InitializationScreen';

export default function App() {
  const { snapshot: initSnapshot } = useInitialization();
  const store = useSocialStore();
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
  const legalReturnPathRef = useRef<string>('/');
  const pendingProtectedPathRef = useRef<string | null>(null);
  const [protectedRedirectNotice, setProtectedRedirectNotice] = useState<
    string | null
  >(null);
  const [previewOnboarding, setPreviewOnboarding] =
    useState<boolean>(onboardingParam);
  const [publicProfileReturnTab, setPublicProfileReturnTab] = useState<
    'feed' | 'connections' | 'profile' | 'messages'
  >('feed');
  const [composerOpen, setComposerOpen] = useState(false);
  const [addStoryOpen, setAddStoryOpen] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [activeStoryAuthorId, setActiveStoryAuthorId] = useState<string | null>(
    null
  );
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [selectedPublicProfile, setSelectedPublicProfile] =
    useState<UserProfile | null>(null);
  const [loadingPublicProfile, setLoadingPublicProfile] = useState(false);
  const [connectionsOwner, setConnectionsOwner] = useState<UserProfile | null>(
    null
  );
  const [remoteOtherConnections, setRemoteOtherConnections] = useState<{
    targetUid: string;
    followerIds: string[];
    followingIds: string[];
  } | null>(null);
  const [feedSearchQuery, setFeedSearchQuery] = useState('');

  const unreadCount = countUnreadNotifications(store.notifications);
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

  // Keep workspace activeTab aligned when navigating via URL (/feed, /messages, /settings, etc.)
  useEffect(() => {
    if (routeAccess.surface === 'workspace' && routeAccess.tab) {
      setActiveTab(routeAccess.tab);
    }
  }, [routeAccess.surface, routeAccess.tab]);

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
      setActiveTab('profile');
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
    setFeedSearchQuery(tag ? `#${tag}` : '');
    setActiveTab('feed');
  };

  const handleOpenDm = async (creator: UserProfile) => {
    if (creator.uid === store.profile.uid) return;
    const thread = await store.startDirectThread(creator);
    setActiveChatId(thread.id);
    setActiveTab('messages');
  };

  const handleOpenPublicProfile = async (
    targetUid: string,
    fallbackPost?: Post,
    returnTab: 'feed' | 'connections' | 'profile' | 'messages' = 'feed'
  ) => {
    if (targetUid === store.profile.uid) {
      setActiveTab('profile');
      return;
    }
    setPublicProfileReturnTab(returnTab);
    const immediate = resolvePublicProfile(
      targetUid,
      store.profile,
      store.communityUsers,
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
    setActiveTab('connections');
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

  if (activeLegalDoc) {
    return (
      <>
        <LegalDocumentView
          activeDocId={activeLegalDoc}
          theme={store.theme}
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
        <OfflineIndicator />
      </>
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
          onLogout={handleLogout}
          onContinueAuthenticated={() => {
            navigateAfterAuthentication();
          }}
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

  const isMessagesFullScreen = activeTab === 'messages';

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
        unreadNotifications={unreadCount}
        theme={store.theme}
        onToggleTheme={store.toggleTheme}
        onStartCall={store.startInstantCall}
      />

      <PushToast
        notification={store.activeToast}
        onDismiss={store.dismissToast}
        onOpenNotifications={() => setActiveTab('notifications')}
      />

      <main
        className={
          isMessagesFullScreen
            ? 'flex-1 min-h-0 w-full flex flex-col overflow-hidden'
            : 'max-w-7xl mx-auto px-4 md:px-6 pt-5 md:pt-7 flex items-start gap-6'
        }
      >
        {/* Left Navigation & Account Rail (Desktop) */}
        {!isMessagesFullScreen && (
          <aside
            aria-label="Account and appearance controls"
            className="hidden lg:flex lg:w-64 shrink-0 flex-col gap-4 sticky top-23"
          >
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className="w-full flex items-center gap-3 text-left cursor-pointer group"
            >
              <Avatar
                src={store.profile.avatarUrl}
                name={store.profile.displayName}
                size="md"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {store.profile.displayName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  @{store.profile.handle}
                </p>
              </div>
            </button>

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
          </div>

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
              onClick={() => setActiveTab('notifications')}
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
              : 'flex-1 min-w-0 max-w-2xl mx-auto lg:mx-0'
          }
        >
          {activeTab === 'feed' && (
            <FeedView
              profile={store.profile}
              posts={store.posts}
              storyGroups={store.storyGroups}
              commentsByPost={store.commentsByPost}
              likedPostIds={store.likedPostIds}
              bookmarkedPostIds={store.bookmarkedPostIds}
              searchQuery={feedSearchQuery}
              onSearchQueryChange={setFeedSearchQuery}
              onOpenComposer={() => setComposerOpen(true)}
              onOpenStory={(group) => setActiveStoryAuthorId(group.authorId)}
              onOpenAddStory={() => setAddStoryOpen(true)}
              onToggleLike={store.toggleLike}
              onToggleBookmark={store.toggleBookmark}
              onAddComment={store.addComment}
              onDeletePost={store.deletePost}
              onDeleteComment={store.deleteComment}
              onShareToStory={store.sharePostToStory}
              onAuthorClick={(post) =>
                handleOpenPublicProfile(post.authorId, post)
              }
              onMentionClick={handleOpenMention}
              onSelectHashtag={handleHashtagClick}
            />
          )}

          {activeTab === 'public-profile' && selectedPublicProfile && (() => {
            const creatorConnections = getConnectionsForUser(selectedPublicProfile);
            return (
              <PublicProfileView
                creator={selectedPublicProfile}
                currentUserId={store.profile.uid}
                loading={loadingPublicProfile}
                isFollowing={store.followedUserIds.includes(
                  selectedPublicProfile.uid
                )}
                followersCount={creatorConnections.followers.length}
                followingCount={creatorConnections.following.length}
                friendsCount={creatorConnections.friends.length}
                posts={store.posts}
                likedPostIds={store.likedPostIds}
                bookmarkedPostIds={store.bookmarkedPostIds}
                commentsByPost={store.commentsByPost}
                backLabel={
                  publicProfileReturnTab === 'connections'
                    ? 'Back to Connections'
                    : publicProfileReturnTab === 'profile'
                      ? 'Back to Profile'
                      : publicProfileReturnTab === 'messages'
                        ? 'Back to Messages'
                        : 'Back to Feed'
                }
                onToggleFollow={store.toggleFollowUser}
                onMessage={handleOpenDm}
                onStartCallWithUser={store.startCallWithUser}
                onOpenConnections={(tab) =>
                  openConnections(tab, selectedPublicProfile)
                }
                onBack={() => setActiveTab(publicProfileReturnTab)}
                onToggleLike={store.toggleLike}
                onToggleBookmark={store.toggleBookmark}
                onAddComment={store.addComment}
                onDeletePost={store.deletePost}
                onDeleteComment={store.deleteComment}
                onMentionClick={handleOpenMention}
                onSelectHashtag={handleHashtagClick}
              />
            );
          })()}

          {activeTab === 'messages' && (
            <ChatView
              profile={store.profile}
              threads={store.threads}
              messagesByChat={store.messagesByChat}
              mutedChatIds={store.mutedChatIds}
              pushEnabled={store.pushEnabled}
              onlineUserIds={store.onlineUserIds}
              communityUsers={store.communityUsers}
              chatUsers={store.allKnownChatUsers}
              initialThreadId={activeChatId}
              onSubscribeThread={store.subscribeChatMessages}
              onSendMessage={store.sendChatMessage}
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
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationsView
              profile={store.profile}
              notifications={store.notifications}
              pushPermission={store.pushPermission}
              onEnablePush={store.enablePushNotifications}
              onMarkRead={store.markNotificationRead}
              onMarkAllRead={store.markAllNotificationsRead}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileView
              profile={store.profile}
              posts={store.posts}
              followersCount={store.connections.followers.length}
              followingCount={store.connections.following.length}
              friendsCount={store.connections.friends.length}
              likedPostIds={store.likedPostIds}
              bookmarkedPostIds={store.bookmarkedPostIds}
              commentsByPost={store.commentsByPost}
              onToggleLike={store.toggleLike}
              onToggleBookmark={store.toggleBookmark}
              onAddComment={store.addComment}
              onDeletePost={store.deletePost}
              onDeleteComment={store.deleteComment}
              onShareToStory={store.sharePostToStory}
              onOpenSettings={() => setActiveTab('settings')}
              onOpenConnections={(tab) => openConnections(tab, null)}
              onAuthorClick={(post) =>
                handleOpenPublicProfile(post.authorId, post, 'profile')
              }
              onMentionClick={handleOpenMention}
              onSelectHashtag={handleHashtagClick}
            />
          )}

          {activeTab === 'connections' && (() => {
            const viewingOther =
              connectionsOwner && connectionsOwner.uid !== store.profile.uid;
            const activeConnections = viewingOther
              ? getConnectionsForUser(connectionsOwner)
              : store.connections;
            return (
              <ConnectionsView
                initialTab={connectionsTab}
                targetUser={viewingOther ? connectionsOwner : null}
                currentUserId={store.profile.uid}
                followers={activeConnections.followers}
                following={activeConnections.following}
                friends={activeConnections.friends}
                followerIds={store.followerUserIds}
                followedUserIds={store.followedUserIds}
                onBack={() => {
                  if (viewingOther) {
                    setSelectedPublicProfile(connectionsOwner);
                    setActiveTab('public-profile');
                  } else {
                    setActiveTab('profile');
                  }
                }}
                onToggleFollow={store.toggleFollowUser}
                onMessage={handleOpenDm}
                onOpenPublicProfile={(person) => {
                  if (person.uid === store.profile.uid) {
                    setActiveTab('profile');
                    return;
                  }
                  handleOpenPublicProfile(person.uid, undefined, 'connections');
                }}
              />
            );
          })()}

          {activeTab === 'settings' && (
            <ProfileSettingsView
              profile={store.profile}
              privateSettings={store.privateSettings}
              accountEmail={store.firebaseUser?.email || null}
              theme={store.theme}
              pushPermission={store.pushPermission}
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
            />
          )}
        </div>

        {/* Right Discovery & Active Chats Sidebar (Desktop) */}
        {activeTab !== 'messages' && (
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
                  onClick={() => setActiveTab('messages')}
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
                        setActiveTab('messages');
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
                          {thread.lastMessageText}
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
                          <p className="text-xs font-semibold truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {creator.displayName}
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
        unreadNotifications={unreadCount}
      />

      <CreatePostModal
        open={composerOpen}
        profile={store.profile}
        communityUsers={store.communityUsers}
        onClose={() => setComposerOpen(false)}
        onCreatePost={async (caption, category, imageUrl, extra) => {
          await store.createPost(caption, category, imageUrl, extra);
          setActiveTab('feed');
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
          setActiveTab('feed');
        }}
      />

      <BrandLogoModal
        open={brandModalOpen}
        onClose={() => setBrandModalOpen(false)}
        onGoToFeed={() => setActiveTab('feed')}
      />

      <CallRoomModal
        session={store.callSession}
        profile={store.profile}
        isLocalAutostart={store.isLocalAutostart}
        onEndCall={store.endCall}
        onToggleMute={store.toggleCallMute}
        onToggleVideo={store.toggleCallVideo}
        onToggleScreenShare={store.toggleCallScreenShare}
        onPublishPeerSession={store.publishCallPeerSession}
        onSubscribeCallPeers={store.subscribeCallPeers}
      />

      <IncomingCallModal
        invite={store.incomingCallInvite}
        onAccept={store.acceptIncomingCall}
        onDecline={store.declineIncomingCall}
      />

      <OfflineIndicator />
    </div>
  );
}
