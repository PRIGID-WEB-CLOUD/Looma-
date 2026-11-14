import { Moon, Sun, Video } from 'lucide-react';
import type { TabId, ThemeMode } from '../types/social';
import { LoomaLogo } from './LoomaLogo';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  unreadNotifications: number;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onStartCall?: (title: string, isAudioOnly: boolean) => void;
}

export function TopBar({
  activeTab,
  onSelectTab,
  unreadNotifications,
  theme,
  onToggleTheme,
  onStartCall,
}: TopBarProps) {
  const navItems: { id: TabId; label: string }[] = [
    { id: 'feed', label: 'Feed' },
    { id: 'messages', label: 'Messages' },
    {
      id: 'notifications',
      label:
        unreadNotifications > 0
          ? `Activity (${unreadNotifications})`
          : 'Activity',
    },
    { id: 'profile', label: 'Profile' },
  ];

  return (
    <header className="sticky top-0 z-30 h-13 md:h-16 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shrink-0">
      <div className="max-w-7xl mx-auto h-full px-4 md:px-6 flex items-center justify-between gap-8">
        {/* Zone 1: Static theme-reactive Logo brand */}
        <LoomaLogo />

        {/* Zone 2: 4 single-line navigation links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-6"
        >
          {navItems.map((item) => {
            const active =
              activeTab === item.id ||
              (item.id === 'profile' &&
                (activeTab === 'settings' || activeTab === 'connections')) ||
              (item.id === 'feed' && activeTab === 'public-profile');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer tabular-nums focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 ${
                  active
                    ? 'border-blue-600 text-slate-900 dark:border-blue-500 dark:text-white'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Mobile & tablet quick PWA install + Call button + theme toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {onStartCall && (
            <button
              type="button"
              onClick={() => onStartCall('Studio Live Room', false)}
              aria-label="Start live video call"
              className="min-h-[36px] px-2.5 sm:px-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
            >
              <Video className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Live Call</span>
            </button>
          )}
          <div className="lg:hidden">
            <PWAInstallButton compact />
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            className={`${
              activeTab === 'messages' ? 'flex' : 'md:hidden flex'
            } min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer`}
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Moon className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
