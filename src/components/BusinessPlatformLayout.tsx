import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  ClipboardList,
  ExternalLink,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  Settings,
  ShieldAlert,
  Store,
  Sun,
  Users,
} from 'lucide-react';
import type {
  BusinessMembershipRole,
  BusinessNotification,
  BusinessProfile,
  BusinessWorkspaceSection,
} from '../types/business';
import type { ThemeMode, UserProfile } from '../types/social';
import type { MemberModerationRecord } from '../../admin/adminLogic';
import { formatRelativeTime } from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { BusinessSwitcherMenu } from './BusinessSwitcherMenu';
import { VerifiedBadge } from './VerifiedBadge';

interface BusinessPlatformLayoutProps {
  personalProfile: UserProfile;
  businessProfile: BusinessProfile;
  role: BusinessMembershipRole;
  section: BusinessWorkspaceSection;
  onSelectSection: (section: BusinessWorkspaceSection) => void;
  unreadInboxCount: number;
  businessNotifications: BusinessNotification[];
  unreadBusinessNotifications: number;
  onMarkBusinessNotificationRead: (id: string) => Promise<void>;
  onMarkAllBusinessNotificationsRead: () => Promise<void>;
  theme: ThemeMode;
  onToggleTheme: () => void;
  maintenanceMode: boolean;
  memberModeration: MemberModerationRecord | null;
  onOpenPublicBusinessPage: () => void;
  onOpenMarketplace: () => void;
  onLaunchSellerPortal: () => void;
  portalBusy?: boolean;
  onCreateBusiness: () => void;
  onLogout: () => void;
  children: ReactNode;
}

const SECTION_META: {
  id: BusinessWorkspaceSection;
  label: string;
  mobileLabel: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: 'dashboard', label: 'Overview', mobileLabel: 'Overview', icon: LayoutDashboard },
  { id: 'catalog', label: 'Catalog', mobileLabel: 'Catalog', icon: Package },
  { id: 'orders', label: 'Orders', mobileLabel: 'Orders', icon: ClipboardList },
  { id: 'inbox', label: 'Customer Inbox', mobileLabel: 'Inbox', icon: Inbox },
  { id: 'posts', label: 'Brand Posts', mobileLabel: 'Posts', icon: FileText },
  { id: 'team', label: 'Team Members', mobileLabel: 'Team', icon: Users },
  { id: 'settings', label: 'Business Settings', mobileLabel: 'Settings', icon: Settings },
];

export function BusinessPlatformLayout({
  personalProfile,
  businessProfile,
  role,
  section,
  onSelectSection,
  unreadInboxCount,
  businessNotifications,
  unreadBusinessNotifications,
  onMarkBusinessNotificationRead,
  onMarkAllBusinessNotificationsRead,
  theme,
  onToggleTheme,
  maintenanceMode,
  memberModeration,
  onOpenPublicBusinessPage,
  onOpenMarketplace,
  onLaunchSellerPortal,
  portalBusy = false,
  onCreateBusiness,
  onLogout,
  children,
}: BusinessPlatformLayoutProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!notifOpen) return;
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [notifOpen]);

  const currentSectionLabel =
    SECTION_META.find((s) => s.id === section)?.label || 'Overview';

  const canLaunchSeller = role === 'OWNER' || role === 'ADMIN';
  const mobilePrimarySections = SECTION_META.filter((s) =>
    ['dashboard', 'catalog', 'orders', 'inbox', 'settings'].includes(s.id)
  );

  return (
    <div
      data-platform-mode="business"
      className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-16 md:pb-0 transition-colors looma-stage-enter"
    >
      {/* Desktop B2B Workspace Sidebar */}
      <aside
        aria-label="Business platform workspace navigation"
        className="hidden md:flex md:w-64 shrink-0 flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 sticky top-0 h-screen"
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              src={businessProfile.logoUrl}
              name={businessProfile.displayName}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate inline-flex items-center gap-1 max-w-full">
                <span className="truncate">{businessProfile.displayName}</span>
                {businessProfile.verified && <VerifiedBadge size={14} />}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                @{businessProfile.slug} · {role.toLowerCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenPublicBusinessPage}
              className="flex-1 min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Building2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Public Profile</span>
            </button>
            <button
              type="button"
              onClick={onOpenMarketplace}
              className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
              title="Browse Looma Marketplace"
            >
              <Store className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Market</span>
            </button>
          </div>
        </div>

        <nav
          aria-label="Business sections"
          className="flex-1 overflow-y-auto p-3 space-y-1"
        >
          {SECTION_META.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            const badgeCount = item.id === 'inbox' ? unreadInboxCount : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                aria-current={active ? 'page' : undefined}
                data-testid={`business-nav-${item.id}`}
                className={`w-full min-h-[42px] px-3 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                {badgeCount > 0 && (
                  <span
                    className={`min-w-[20px] h-5 px-1.5 rounded-md text-[11px] font-bold flex items-center justify-center tabular-nums ${
                      active
                        ? 'bg-white/20 dark:bg-slate-900/15 text-white dark:text-slate-900'
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full min-h-[40px] px-3 rounded-xl flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
            onClick={onLogout}
            className="w-full min-h-[40px] px-3 rounded-xl flex items-center gap-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 text-sm">
            <span className="font-display font-bold text-slate-900 dark:text-white truncate">
              {businessProfile.displayName}
            </span>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
              /
            </span>
            <span className="font-medium text-slate-500 dark:text-slate-400 truncate">
              {currentSectionLabel}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {canLaunchSeller && (
              <button
                type="button"
                disabled={portalBusy}
                onClick={onLaunchSellerPortal}
                data-testid="business-header-seller-portal-btn"
                className="min-h-[38px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <Store className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {portalBusy ? 'Authorizing...' : 'Seller Portal'}
                </span>
                <ExternalLink className="w-3 h-3 hidden sm:inline" aria-hidden="true" />
              </button>
            )}

            {/* Business Notifications Popover */}
            <div ref={notifRef} className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                aria-expanded={notifOpen}
                aria-label={`Business notifications (${unreadBusinessNotifications} unread)`}
                className="relative min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Bell className="w-4 h-4" aria-hidden="true" />
                {unreadBusinessNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadBusinessNotifications > 9 ? '9+' : unreadBusinessNotifications}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Business Activity
                    </span>
                    {unreadBusinessNotifications > 0 && (
                      <button
                        type="button"
                        onClick={() => void onMarkAllBusinessNotificationsRead()}
                        className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {businessNotifications.length === 0 ? (
                      <p className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        No business alerts yet.
                      </p>
                    ) : (
                      businessNotifications.slice(0, 15).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            if (!item.read) {
                              void onMarkBusinessNotificationRead(item.id);
                            }
                            if (item.type === 'order') onSelectSection('orders');
                            else if (item.type === 'team') onSelectSection('team');
                            else if (item.type === 'comment') onSelectSection('posts');
                            setNotifOpen(false);
                          }}
                          className={`w-full px-4 py-3 text-left flex items-start gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer ${
                            !item.read ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                          }`}
                        >
                          <Avatar
                            src={item.actorAvatar}
                            name={item.actorName}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1 text-xs">
                            <p className="font-semibold text-slate-900 dark:text-white line-clamp-1">
                              {item.title}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                              {item.body}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                              {formatRelativeTime(item.createdAtMs)}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <BusinessSwitcherMenu
              profile={personalProfile}
              align="right"
              onCreateBusiness={onCreateBusiness}
            />
          </div>
        </header>

        {/* Mobile Quick Sub-Nav for Posts & Team (compact single row) */}
        <div className="md:hidden px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 overflow-x-auto">
          {SECTION_META.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {item.mobileLabel}
                {item.id === 'inbox' && unreadInboxCount > 0
                  ? ` (${unreadInboxCount})`
                  : ''}
              </button>
            );
          })}
        </div>

        {(maintenanceMode || memberModeration?.status === 'restricted') && (
          <div className="px-4 md:px-6 pt-4 space-y-2">
            {maintenanceMode && (
              <div
                role="status"
                className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Scheduled maintenance mode is active.</span>
              </div>
            )}
            {memberModeration?.status === 'restricted' && (
              <div
                role="status"
                className="rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 px-4 py-2.5 text-xs text-rose-900 dark:text-rose-200 flex items-center gap-2"
              >
                <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Mother account publishing is temporarily restricted by moderation.</span>
              </div>
            )}
          </div>
        )}

        <main className="flex-1 min-w-0 p-4 md:p-6 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Business mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center"
      >
        {mobilePrimarySections.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          const badge = item.id === 'inbox' ? unreadInboxCount : 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <span className="relative">
                <Icon className="w-4 h-4" aria-hidden="true" />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium leading-none">
                {item.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
