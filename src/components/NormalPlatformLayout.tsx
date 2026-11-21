import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Bell,
  LogOut,
  Moon,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Sun,
  Users,
} from 'lucide-react';
import type {
  AppNotification,
  TabId,
  ThemeMode,
  UserProfile,
} from '../types/social';
import type {
  MemberModerationRecord,
  ModerationAppeal,
} from '../../admin/adminLogic';
import { Avatar } from './Avatar';
import { BusinessSwitcherMenu } from './BusinessSwitcherMenu';
import { MobileBottomNav } from './MobileBottomNav';
import { PushToast } from './PushToast';
import { PWAInstallButton } from './PWAInstallButton';
import { TopBar } from './TopBar';
import { VerifiedBadge } from './VerifiedBadge';

interface NormalPlatformLayoutProps {
  profile: UserProfile;
  isUserAdmin: boolean;
  activeTab: TabId;
  publicProfileReturnTab: TabId;
  unreadNotifications: number;
  friendsCount: number;
  theme: ThemeMode;
  searchQuery: string;
  maintenanceMode: boolean;
  memberModeration: MemberModerationRecord | null;
  userAppeals: ModerationAppeal[];
  activeToast: AppNotification | null;
  onDismissToast: () => void;
  onSelectTab: (tab: TabId) => void;
  onLogoClick: () => void;
  onSearchChange: (query: string) => void;
  onSearchFocus?: () => void;
  onSearchSubmit: (query: string) => void;
  onOpenConnections: (tab: 'friends' | 'followers' | 'following') => void;
  onToggleTheme: () => void;
  onOpenAppealModal: () => void;
  onCreateBusiness: () => void;
  onLogout: () => void;
  rightRail?: ReactNode;
  children: ReactNode;
}

export function NormalPlatformLayout({
  profile,
  isUserAdmin,
  activeTab,
  publicProfileReturnTab,
  unreadNotifications,
  friendsCount,
  theme,
  searchQuery,
  maintenanceMode,
  memberModeration,
  userAppeals,
  activeToast,
  onDismissToast,
  onSelectTab,
  onLogoClick,
  onSearchChange,
  onSearchFocus,
  onSearchSubmit,
  onOpenConnections,
  onToggleTheme,
  onOpenAppealModal,
  onCreateBusiness,
  onLogout,
  rightRail,
  children,
}: NormalPlatformLayoutProps) {
  const isMessagesFullScreen = activeTab === 'messages';
  const isMessageProfileFullScreen =
    activeTab === 'public-profile' && publicProfileReturnTab === 'messages';
  const isMarketplaceFullScreen =
    activeTab === 'marketplace' || activeTab === 'product-detail';
  const isFullWidthStage =
    activeTab === 'search' || activeTab === 'post-comments';
  const hideWorkspaceRail =
    isMessagesFullScreen ||
    isMessageProfileFullScreen ||
    isMarketplaceFullScreen ||
    isFullWidthStage;

  return (
    <div
      data-platform-mode="normal"
      className={
        isMessagesFullScreen
          ? 'h-[100dvh] overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors looma-stage-enter'
          : 'min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20 md:pb-10 transition-colors looma-stage-enter'
      }
    >
      <TopBar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        unreadNotifications={unreadNotifications}
        onLogoClick={onLogoClick}
        rightSlot={
          <BusinessSwitcherMenu
            profile={profile}
            align="right"
            onCreateBusiness={onCreateBusiness}
          />
        }
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onSearchFocus={onSearchFocus}
        onSearchSubmit={onSearchSubmit}
      />

      <PushToast
        notification={activeToast}
        onDismiss={onDismissToast}
        onOpenNotifications={() => onSelectTab('notifications')}
      />

      {(maintenanceMode || memberModeration?.status === 'restricted') && (
        <div className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-3.5 space-y-2 shrink-0">
          {maintenanceMode && (
            <div
              role="status"
              data-testid="workspace-maintenance-banner"
              className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2.5"
            >
              <AlertTriangle
                className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0"
                aria-hidden="true"
              />
              <span className="font-medium">
                Scheduled maintenance mode is active. Posting and call availability may be limited.
              </span>
            </div>
          )}

          {memberModeration?.status === 'restricted' && (
            <div
              role="status"
              data-testid="account-restricted-banner"
              className="rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-900 dark:text-rose-200 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <ShieldAlert
                  className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="font-semibold">
                    Account Restricted — posting, replies, and calls are paused
                  </p>
                  <p className="text-rose-700 dark:text-rose-300 mt-0.5">
                    {memberModeration.reason ||
                      'A moderator temporarily restricted posting actions on this account.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {userAppeals[0] && (
                  <span className="px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-[11px] font-semibold capitalize">
                    Appeal: {userAppeals[0].status}
                  </span>
                )}
                <button
                  type="button"
                  onClick={onOpenAppealModal}
                  className="min-h-[36px] px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Submit Appeal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <main
        className={
          isMessagesFullScreen
            ? 'flex-1 min-h-0 w-full flex flex-col overflow-hidden'
            : isMarketplaceFullScreen || isMessageProfileFullScreen || isFullWidthStage
              ? 'w-full flex-1 min-w-0'
              : 'max-w-7xl mx-auto px-4 md:px-6 pt-5 md:pt-7 flex items-start gap-6'
        }
      >
        {!hideWorkspaceRail && (
          <aside
            aria-label="Personal account and appearance controls"
            className="hidden lg:flex lg:w-64 shrink-0 flex-col gap-4 sticky top-23"
          >
            <div
              data-testid="rail-profile-card"
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectTab('profile')}
                  className="flex items-center gap-3 text-left cursor-pointer group min-w-0 flex-1"
                >
                  <Avatar
                    src={profile.avatarUrl}
                    name={profile.displayName}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 inline-flex items-center gap-1.5 max-w-full">
                      <span className="truncate">{profile.displayName}</span>
                      {(profile.isVerified || isUserAdmin) && (
                        <VerifiedBadge size={14} />
                      )}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      @{profile.handle}
                    </p>
                  </div>
                </button>

                <BusinessSwitcherMenu
                  profile={profile}
                  align="left"
                  onCreateBusiness={onCreateBusiness}
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs tabular-nums">
                <button
                  type="button"
                  onClick={() => onOpenConnections('followers')}
                  className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {profile.followersCount}
                  </span>{' '}
                  <span className="text-slate-500 dark:text-slate-400">
                    Followers
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenConnections('following')}
                  className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {profile.followingCount}
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
                onClick={onToggleTheme}
                className="w-full min-h-[42px] px-3 rounded-xl flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  {theme === 'dark' ? (
                    <Sun className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Moon className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </span>
                <span className="text-slate-400 capitalize">{theme}</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('notifications')}
                className="w-full min-h-[42px] px-3 rounded-xl flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer tabular-nums"
              >
                <span className="flex items-center gap-2.5">
                  <Bell className="w-4 h-4" aria-hidden="true" />
                  <span>Activity</span>
                </span>
                <span className="text-blue-600 dark:text-blue-400 font-semibold">
                  {unreadNotifications > 0 ? `${unreadNotifications} new` : 'Quiet'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onOpenConnections('friends')}
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
                <span className="text-slate-400">{friendsCount} friends</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('marketplace')}
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
                onClick={() => onSelectTab('settings')}
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
                onClick={onLogout}
                className="w-full min-h-[42px] px-3 rounded-xl flex items-center gap-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Log Out</span>
              </button>
            </div>
          </aside>
        )}

        <div
          className={
            isMessagesFullScreen
              ? 'w-full flex-1 min-h-0 flex flex-col pb-14 md:pb-0'
              : isMarketplaceFullScreen || isFullWidthStage
                ? 'w-full flex-1 min-w-0'
                : isMessageProfileFullScreen
                  ? 'w-full flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-5 md:py-7'
                  : 'flex-1 min-w-0 max-w-2xl mx-auto lg:mx-0'
          }
        >
          {children}
        </div>

        {!hideWorkspaceRail && rightRail}
      </main>

      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        unreadNotifications={unreadNotifications}
        activeAvatarUrl={profile.avatarUrl}
        activeDisplayName={profile.displayName}
      />
    </div>
  );
}
