import { Bell, Home, MessageSquare, ShoppingBag, User } from 'lucide-react';
import type { TabId } from '../types/social';

interface MobileBottomNavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  unreadNotifications: number;
}

export function MobileBottomNav({
  activeTab,
  onSelectTab,
  unreadNotifications,
}: MobileBottomNavProps) {
  const items: {
    id: TabId;
    label: string;
    icon: typeof Home;
    badge?: number;
  }[] = [
    { id: 'feed', label: 'Feed', icon: Home },
    { id: 'marketplace', label: 'Market', icon: ShoppingBag },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    {
      id: 'notifications',
      label: 'Activity',
      icon: Bell,
      badge: unreadNotifications,
    },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          activeTab === item.id ||
          (item.id === 'feed' && activeTab === 'public-profile') ||
          (item.id === 'profile' &&
            (activeTab === 'connections' || activeTab === 'settings'));
        const hasBadge = typeof item.badge === 'number' && item.badge > 0;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectTab(item.id)}
            aria-current={active ? 'page' : undefined}
            aria-label={
              hasBadge ? `${item.label} (${item.badge} unread)` : item.label
            }
            className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              active
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-0 left-4 right-4 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400"
              />
            )}
            <span className="relative">
              <Icon className="w-4 h-4" aria-hidden="true" />
              {hasBadge ? (
                <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                  {item.badge! > 9 ? '9+' : item.badge}
                </span>
              ) : null}
            </span>
            <span className="text-[10px] font-medium leading-none">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
