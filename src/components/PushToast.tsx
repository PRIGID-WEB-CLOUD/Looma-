import { Bell, X } from 'lucide-react';
import type { AppNotification } from '../types/social';

interface PushToastProps {
  notification: AppNotification | null;
  onDismiss: () => void;
  onOpenNotifications: () => void;
}

export function PushToast({
  notification,
  onDismiss,
  onOpenNotifications,
}: PushToastProps) {
  if (!notification) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:w-96 z-50 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-3.5 flex items-start gap-3 transition-all"
    >
      <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
        <Bell className="w-4 h-4" aria-hidden="true" />
      </div>
      <button
        type="button"
        onClick={() => {
          onOpenNotifications();
          onDismiss();
        }}
        className="flex-1 text-left min-w-0 cursor-pointer"
      >
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
          {notification.title}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5">
          {notification.body}
        </p>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
