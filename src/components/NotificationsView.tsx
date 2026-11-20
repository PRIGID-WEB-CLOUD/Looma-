import { useMemo } from 'react';
import { Bell, CheckCheck, Megaphone, Trash2 } from 'lucide-react';
import type { UserProfile } from '../types/social';
import type { BusinessNotification, BusinessProfile } from '../types/business';
import {
  formatRelativeTime,
  type ActivityNotificationItem,
} from '../utils/socialLogic';
import type { PushPermissionState } from '../services/notifications';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

interface NotificationsViewProps {
  profile: UserProfile;
  notifications: ActivityNotificationItem[];
  activeBusinessProfile?: BusinessProfile | null;
  businessNotifications?: BusinessNotification[];
  onMarkBusinessNotificationRead?: (id: string) => Promise<void> | void;
  onMarkAllBusinessNotificationsRead?: () => Promise<void> | void;
  verifiedAuthorIds?: string[];
  pushPermission: PushPermissionState;
  onEnablePush: () => Promise<PushPermissionState>;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDeleteNotification: (id: string) => Promise<void> | void;
  onClearAllNotifications?: () => Promise<void> | void;
}

export function NotificationsView({
  profile,
  notifications,
  activeBusinessProfile = null,
  businessNotifications = [],
  onMarkBusinessNotificationRead,
  onMarkAllBusinessNotificationsRead,
  verifiedAuthorIds = [],
  pushPermission,
  onEnablePush,
  onMarkRead,
  onMarkAllRead,
  onDeleteNotification,
  onClearAllNotifications,
}: NotificationsViewProps) {
  const activeScope = activeBusinessProfile ? 'business' : 'personal';

  const verifiedSet = useMemo(() => {
    const ids = new Set(verifiedAuthorIds);
    if (profile.isVerified) ids.add(profile.uid);
    return ids;
  }, [verifiedAuthorIds, profile.isVerified, profile.uid]);

  return (
    <section
      aria-label="Activity and Push Notifications"
      className="space-y-4"
    >
      {/* Push Notification Controls */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex items-start gap-3">
          {activeBusinessProfile ? (
            <Avatar
              src={activeBusinessProfile.logoUrl}
              name={activeBusinessProfile.displayName}
              size="md"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg font-bold truncate">
              {activeBusinessProfile
                ? `${activeBusinessProfile.displayName} · Activity`
                : 'Activity & Push Alerts'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Browser push status: {pushPermission} · Live engagement alerts enabled
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {pushPermission !== 'granted' && pushPermission !== 'unsupported' && (
            <button
              type="button"
              onClick={onEnablePush}
              className="min-h-[38px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Enable Browser Push
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (activeScope === 'business') {
                void onMarkAllBusinessNotificationsRead?.();
              } else {
                onMarkAllRead();
              }
            }}
            className="min-h-[38px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Mark all read</span>
          </button>
          {activeScope === 'personal' && notifications.length > 0 && onClearAllNotifications && (
            <button
              type="button"
              onClick={() => onClearAllNotifications()}
              className="min-h-[38px] px-3.5 rounded-xl border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear all</span>
            </button>
          )}
        </div>
      </div>

      {/* Notification Stream */}
      {activeScope === 'business' && activeBusinessProfile ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {businessNotifications.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No activity yet for {activeBusinessProfile.displayName}. New followers, orders, and business post interactions appear here.
            </div>
          ) : (
            businessNotifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-4 flex items-start gap-3 transition-colors ${
                  notif.read
                    ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    : 'bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                }`}
              >
                <button
                  type="button"
                  onClick={() => void onMarkBusinessNotificationRead?.(notif.id)}
                  className="flex-1 min-w-0 flex items-start gap-3.5 text-left cursor-pointer"
                >
                  <Avatar src={notif.actorAvatar} name={notif.actorName} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {notif.title}
                      </p>
                      <span className="text-xs text-slate-400 shrink-0 tabular-nums">
                        {formatRelativeTime(notif.createdAtMs)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                      {notif.body}
                    </p>
                  </div>
                  {!notif.read && (
                    <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                      Unread
                    </span>
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {notifications.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No notifications yet. Activity from @{profile.handle} will show up here in real time.
            </div>
          ) : (
            notifications.map((notif) => {
              const severityBadgeClass =
                notif.announcementSeverity === 'maintenance'
                  ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
                  : notif.announcementSeverity === 'warning'
                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                    : 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300';

              return (
                <div
                  key={notif.id}
                  data-testid={`notification-item-${notif.id}`}
                  className={`p-4 flex items-start gap-3 transition-colors ${
                    notif.read
                      ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      : 'bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onMarkRead(notif.id)}
                    className="flex-1 min-w-0 flex items-start gap-3.5 text-left cursor-pointer"
                  >
                    {notif.isAnnouncement ? (
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Megaphone className="w-4 h-4" aria-hidden="true" />
                      </div>
                    ) : (
                      <Avatar
                        src={notif.actorAvatar}
                        name={notif.actorName}
                        size="md"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 max-w-full flex-wrap">
                          {notif.isAnnouncement && (
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 ${severityBadgeClass}`}
                            >
                              Announcement
                            </span>
                          )}
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1 max-w-full min-w-0">
                            <span className="truncate">{notif.title}</span>
                            {!notif.isAnnouncement &&
                              notif.actorId &&
                              verifiedSet.has(notif.actorId) && (
                                <VerifiedBadge size={13} />
                              )}
                          </p>
                        </div>
                        <span className="text-xs text-slate-400 shrink-0 tabular-nums">
                          {formatRelativeTime(notif.createdAtMs)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                        {notif.body}
                      </p>
                    </div>
                    {!notif.read && (
                      <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                        Unread
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteNotification(notif.id)}
                    aria-label={`Delete activity: ${notif.title}`}
                    className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
