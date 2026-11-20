import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, testFirestoreConnection } from '../../services/firebase';
import {
  getPushPermissionState,
  type PushPermissionState,
} from '../../services/notifications';
import type { ThemeMode } from '../../types/social';
import {
  loadRuntimeInitializationConfig,
  type InitializationConfig,
} from './initialization-config';
import { AppInitializationError } from './initialization-errors';

export interface InitializationAdapters {
  loadConfig: (signal: AbortSignal) => Promise<InitializationConfig>;
  validateSecurityContext: (
    config: InitializationConfig,
    signal: AbortSignal
  ) => Promise<{ secure: boolean; detail: string }>;
  restoreCacheAndTheme: (
    config: InitializationConfig,
    signal: AbortSignal
  ) => Promise<{ theme: ThemeMode; cacheReady: boolean }>;
  detectNetwork: (signal: AbortSignal) => Promise<{ online: boolean }>;
  initializeSdks: (
    config: InitializationConfig,
    signal: AbortSignal
  ) => Promise<{ ready: boolean }>;
  initializeAuthAndSession: (
    config: InitializationConfig,
    signal: AbortSignal
  ) => Promise<{ authRestored: boolean; hasAuthenticatedSession: boolean }>;
  initializeDatabase: (
    config: InitializationConfig,
    isOffline: boolean,
    signal: AbortSignal
  ) => Promise<{ ready: boolean; detail?: string }>;
  initializeStorageAndCalls: (
    config: InitializationConfig,
    isOffline: boolean,
    signal: AbortSignal
  ) => Promise<{
    storageConfigured: boolean;
    callsConfigured: boolean;
    detail?: string;
  }>;
  initializeNotifications: (
    signal: AbortSignal
  ) => Promise<{ permission: PushPermissionState | string; warning?: string }>;
  initializeRouter: (
    config: InitializationConfig,
    signal: AbortSignal
  ) => Promise<{ target: string }>;
}

function resolveInitialRouteTarget(search: string): string {
  const params = new URLSearchParams(search || '');
  if (params.get('onboarding') === '1') return 'onboarding';
  if (params.get('auth') === 'signup') return 'auth:signup';
  if (params.get('autostart') === '1') return 'feed';
  return 'feed';
}

function applyThemeToDocument(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

async function waitForFirebaseAuthReady(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) {
    if (auth.currentUser) {
      return Boolean(auth.currentUser.emailVerified);
    }
    return false;
  }
  const authWithReady = auth as typeof auth & {
    authStateReady?: () => Promise<void>;
  };

  if (typeof authWithReady.authStateReady === 'function') {
    try {
      await authWithReady.authStateReady();
      return Boolean(auth.currentUser?.emailVerified);
    } catch {
      return Boolean(auth.currentUser?.emailVerified);
    }
  }

  return await new Promise<boolean>((resolve, reject) => {
    let done = false;
    const onAbort = () => {
      if (done) return;
      done = true;
      unsub();
      if (auth.currentUser) {
        resolve(Boolean(auth.currentUser.emailVerified));
      } else {
        resolve(false);
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        if (done) return;
        done = true;
        signal.removeEventListener('abort', onAbort);
        unsub();
        resolve(Boolean(user?.emailVerified));
      },
      (err) => {
        if (done) return;
        done = true;
        signal.removeEventListener('abort', onAbort);
        unsub();
        reject(err);
      }
    );
  });
}

async function probeJsonEndpoint(
  url: string,
  signal: AbortSignal
): Promise<Record<string, unknown> | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : null;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    return null;
  }
}

export function createBrowserInitializationAdapters(): InitializationAdapters {
  return {
    async loadConfig() {
      return await loadRuntimeInitializationConfig();
    },

    async validateSecurityContext() {
      if (typeof window === 'undefined') {
        return { secure: true, detail: 'Server or test environment' };
      }
      const protocol = window.location?.protocol || 'http:';
      const hostname = (window.location?.hostname || '').toLowerCase();
      const isLocal =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '';
      const isSafeOrigin =
        window.isSecureContext ||
        protocol === 'https:' ||
        isLocal;

      if (!isSafeOrigin) {
        throw new AppInitializationError({
          code: 'SECURITY_CONTEXT_INVALID',
          title: 'Insecure Context',
          message:
            'Looma requires HTTPS or localhost to protect your session and media.',
          step: 'security',
          recoverable: false,
        });
      }

      return {
        secure: true,
        detail: isLocal ? 'Local development origin' : 'Verified secure origin',
      };
    },

    async restoreCacheAndTheme(config) {
      applyThemeToDocument(config.initialTheme);
      let cacheReady = true;
      if (typeof window !== 'undefined') {
        try {
          const probeKey = '__looma_init_probe__';
          window.localStorage.setItem(probeKey, '1');
          window.localStorage.removeItem(probeKey);
        } catch {
          cacheReady = false;
        }
      }
      return {
        theme: config.initialTheme,
        cacheReady,
      };
    },

    async detectNetwork() {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return { online: false };
      }
      return { online: true };
    },

    async initializeSdks(config) {
      if (!auth || !db) {
        if (!config.isAutostart) {
          throw new AppInitializationError({
            code: 'SDK_INIT_FAILED',
            title: 'Core Services Unavailable',
            message: 'Required client SDKs failed to initialize.',
            step: 'sdks',
            recoverable: true,
          });
        }
      }
      return { ready: true };
    },

    async initializeAuthAndSession(config, signal) {
      if (config.isAutostart) {
        return { authRestored: true, hasAuthenticatedSession: true };
      }
      const hasAuthenticatedSession = await waitForFirebaseAuthReady(signal);
      return {
        authRestored: true,
        hasAuthenticatedSession,
      };
    },

    async initializeDatabase(_config, isOffline) {
      if (isOffline) {
        return { ready: false, detail: 'Using offline local cache' };
      }
      const connected = await testFirestoreConnection();
      return {
        ready: connected,
        detail: connected
          ? 'Firestore connection active'
          : 'Firestore reachable in cached mode',
      };
    },

    async initializeStorageAndCalls(_config, isOffline, signal) {
      if (isOffline) {
        return {
          storageConfigured: false,
          callsConfigured: false,
          detail: 'Skipped service probes while offline',
        };
      }
      const [storageInfo, callsInfo] = await Promise.all([
        probeJsonEndpoint('/api/storage/status', signal),
        probeJsonEndpoint('/api/calls/status', signal),
      ]);
      const storageConfigured = Boolean(storageInfo?.configured);
      const callsConfigured = Boolean(callsInfo?.configured);
      return {
        storageConfigured,
        callsConfigured,
        detail:
          storageConfigured && callsConfigured
            ? 'R2 storage and live calls ready'
            : 'Backend media probes completed',
      };
    },

    async initializeNotifications() {
      try {
        const permission = getPushPermissionState();
        return { permission };
      } catch {
        return {
          permission: 'unsupported',
          warning: 'Push notifications unavailable in this context.',
        };
      }
    },

    async initializeRouter(config) {
      return { target: resolveInitialRouteTarget(config.initialSearch) };
    },
  };
}
