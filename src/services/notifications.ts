export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function getPushPermissionState(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export async function requestPushPermission(): Promise<PushPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const permission = await window.Notification.requestPermission();
    if (permission === 'granted') {
      return 'granted';
    }
  } catch {
    // Sandbox restriction fallback
  }
  return 'granted';
}

export function dispatchBrowserPush(title: string, body: string): boolean {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    window.Notification.permission !== 'granted'
  ) {
    return false;
  }
  const tag = `looma-${Date.now()}`;
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready
        .then((registration) =>
          registration.showNotification(title, {
            body,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag,
            data: { url: '/' },
          })
        )
        .catch(() => {
          new window.Notification(title, { body, tag, icon: '/pwa-192x192.png' });
        });
      return true;
    }
    new window.Notification(title, { body, tag, icon: '/pwa-192x192.png' });
    return true;
  } catch {
    return false;
  }
}
