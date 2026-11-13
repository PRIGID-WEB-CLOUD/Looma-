import { Bell, CheckCheck } from 'lucide-react';
import type { AppNotification, UserProfile } from '../types/social';
import { formatRelativeTime } from '../utils/socialLogic';
import type { PushPermissionState } from '../services/notifications';
import { Avatar } from './Avatar';

interface NotificationsViewProps {
  profile: UserProfile;
  notifications: AppNotification[];
  pushPermission: PushPermissionState;
  onEnablePush: () => Promise<PushPermissionState>;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationsView({
  profile,
  notifications,
  pushPermission,
  onEnablePush,
  onMarkRead,
  onMarkAllRead,
}: NotificationsViewProps) {
  return (
    <section
      aria-label="Activity and Push Notifications"
      className="space-y-4"
    >
      {/* Push Notification Controls */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold">
              Activity & Push Alerts
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Browser push status: {pushPermission} · Live engagement alerts enabled
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pushPermission !== 'granted' && pushPermission !== 'unsupported' && (
            <button
              type="button"
              onClick={onEnablePush}
              className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Enable Browser Push
            </button>
          )}
          <button
            type="button"
            onClick={onMarkAllRead}
            className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Mark all read</span>
          </button>
        </div>
      </div>

      {/* Notification Stream */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
        {notifications.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No notifications yet. Activity from @{profile.handle} will show up here in real time.
          </div>
        ) : (
          notifications.map((notif) => (
            <button
              key={notif.id}
              type="button"
              onClick={() => onMarkRead(notif.id)}
              className={`w-full p-4 flex items-start gap-3.5 text-left transition-colors cursor-pointer ${
                notif.read
                  ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  : 'bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30'
              }`}
            >
              <Avatar
                src={notif.actorAvatar}
                name={notif.actorName}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {notif.title}
                  </p>
                  <span className="text-xs text-slate-400 shrink-0 tabular-nums">
                    {formatRelativeTime(notif.createdAtMs)}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {notif.body}
                </p>
              </div>
              {!notif.read && (
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                  Unread
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </section>
  );
}
