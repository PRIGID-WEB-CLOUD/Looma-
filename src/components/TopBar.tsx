import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import type { TabId } from '../types/social';
import { LoomaLogo } from './LoomaLogo';

interface TopBarProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  unreadNotifications: number;
  onLogoClick?: () => void;
  rightSlot?: ReactNode;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  onSearchFocus?: () => void;
  onSearchSubmit?: (query: string) => void;
}

export function TopBar({
  activeTab,
  onSelectTab,
  unreadNotifications,
  onLogoClick,
  rightSlot,
  searchQuery = '',
  onSearchChange,
  searchPlaceholder,
  onSearchFocus,
  onSearchSubmit,
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
    if (itemId === 'feed' && (activeTab === 'public-profile' || activeTab === 'business-profile')) return true;
    if (itemId === 'marketplace' && activeTab === 'product-detail') return true;
    if (itemId === 'profile' && (activeTab === 'connections' || activeTab === 'settings')) {
      return true;
    }
    return false;
  };

  const defaultPlaceholder =
    activeTab === 'marketplace'
      ? 'Search marketplace...'
      : 'Search posts or creators...';

  return (
    <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shrink-0">
      <div className="max-w-7xl mx-auto h-full px-4 md:px-6 flex items-center justify-between gap-3 sm:gap-4">
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
          className="min-h-[44px] px-1.5 -ml-1.5 rounded-xl flex items-center hover:bg-slate-100/80 dark:hover:bg-slate-900 transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <LoomaLogo />
        </button>

        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-5 lg:gap-6 shrink-0"
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

        {/* Search Section */}
        <div className="flex-1 max-w-[220px] sm:max-w-xs md:max-w-xs lg:max-w-sm flex items-center justify-end min-w-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearchSubmit?.(searchQuery);
            }}
            className="relative w-full"
            role="search"
          >
            <label htmlFor="header-search" className="sr-only">
              Search posts and creators
            </label>
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="header-search"
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              onFocus={onSearchFocus}
              placeholder={searchPlaceholder || defaultPlaceholder}
              className="w-full h-9 sm:h-10 pl-9 pr-8 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-950 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange?.('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </form>
          {rightSlot && <div className="ml-2 shrink-0">{rightSlot}</div>}
        </div>
      </div>
    </header>
  );
}
