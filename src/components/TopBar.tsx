import type { TabId } from '../types/social';
import { LoomaLogo } from './LoomaLogo';

interface TopBarProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  unreadNotifications: number;
  onLogoClick?: () => void;
}

export function TopBar({
  activeTab,
  onSelectTab,
  unreadNotifications,
  onLogoClick,
}: TopBarProps) {
  const navItems: { id: TabId; label: string }[] = [
    { id: 'feed', label: 'Feed' },
    { id: 'marketplace', label: 'Market' },
    { id: 'messages', label: 'Messages' },
    {
      id: 'notifications',
      label: unreadNotifications > 0 ? `Activity (${unreadNotifications})` : 'Activity',
    },
    { id: 'profile', label: 'Profile' },
  ];

  const isNavActive = (itemId: TabId): boolean => {
    if (activeTab === itemId) return true;
    if (itemId === 'feed' && activeTab === 'public-profile') return true;
    if (itemId === 'profile' && (activeTab === 'connections' || activeTab === 'settings')) {
      return true;
    }
    return false;
  };

  return (
    <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shrink-0">
      <div className="max-w-7xl mx-auto h-full px-4 md:px-6 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => {
            if (onLogoClick) {
              onLogoClick();
            } else {
              onSelectTab('feed');
            }
          }}
          aria-label="Looma brand identity and info"
          className="min-h-[44px] px-1.5 -ml-1.5 rounded-xl flex items-center hover:bg-slate-100/80 dark:hover:bg-slate-900 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <LoomaLogo />
        </button>

        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-6"
        >
          {navItems.map((item) => {
            const active = isNavActive(item.id);
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onSelectTab(item.id)}
                className={`relative min-h-[44px] px-1 flex items-center text-sm transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'font-semibold text-slate-900 dark:text-white'
                    : 'font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <span>{item.label}</span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-1 left-0 right-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="hidden md:block w-24 shrink-0" aria-hidden="true" />
      </div>
    </header>
  );
}
