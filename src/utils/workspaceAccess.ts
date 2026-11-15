import type { TabId } from '../types/social';
import type { AuthMode } from '../components/AuthView';
import { getLegalRoutePath, parseLegalRoute, type LegalDocId } from './legalLogic';

export type AppSurface = 'auth' | 'onboarding' | 'workspace' | 'legal';

export type ProtectedWorkspaceTab = Exclude<TabId, 'public-profile' | 'auth'>;

export interface RouteAccessResolution {
  surface: AppSurface;
  tab?: ProtectedWorkspaceTab;
  authMode?: AuthMode;
  legalDocId?: LegalDocId;
  blockedPath?: string | null;
  blockedResourceLabel?: string | null;
  protectedNotice?: string | null;
  returnToPath?: string | null;
}

const TAB_PATH_MAP: Record<ProtectedWorkspaceTab, string> = {
  feed: '/feed',
  messages: '/messages',
  notifications: '/notifications',
  profile: '/profile',
  settings: '/settings',
  connections: '/connections',
};

const PROTECTED_TAB_BY_PATH: Record<string, { tab: ProtectedWorkspaceTab; label: string }> = {
  '/feed': { tab: 'feed', label: 'Feed posts' },
  '/messages': { tab: 'messages', label: 'Direct messages' },
  '/notifications': { tab: 'notifications', label: 'Notifications' },
  '/profile': { tab: 'profile', label: 'Member profile' },
  '/settings': { tab: 'settings', label: 'Profile settings' },
  '/connections': { tab: 'connections', label: 'Connections' },
};

export function normalizeAppPathname(pathname: string): string {
  const clean = (pathname || '/').split('?')[0].trim().toLowerCase();
  if (clean.length > 1 && clean.endsWith('/')) {
    return clean.slice(0, -1);
  }
  return clean || '/';
}

export function getTabRoutePath(tab: TabId): string {
  if (tab === 'auth') return '/auth';
  if (tab === 'public-profile') return '/feed';
  return TAB_PATH_MAP[tab] || '/feed';
}

export function parseProtectedWorkspacePath(
  pathname: string
): { tab: ProtectedWorkspaceTab; label: string; canonicalPath: string } | null {
  const normalized = normalizeAppPathname(pathname);
  const match = PROTECTED_TAB_BY_PATH[normalized];
  if (!match) return null;
  return {
    tab: match.tab,
    label: match.label,
    canonicalPath: normalized,
  };
}

export function isAuthPath(pathname: string): boolean {
  const normalized = normalizeAppPathname(pathname);
  return normalized === '/auth' || normalized === '/login' || normalized === '/signup';
}

export function resolveAuthModeFromUrl(pathname: string, search: string): AuthMode {
  const normalized = normalizeAppPathname(pathname);
  if (normalized === '/signup') return 'signup';
  const params = new URLSearchParams(search || '');
  const qAuth = params.get('auth') || params.get('mode');
  if (qAuth === 'signup') return 'signup';
  return 'signin';
}

export function buildProtectedRedirectNotice(resourceLabel: string): string {
  const isSingular = resourceLabel === 'Member profile';
  const verb = isSingular ? 'is' : 'are';
  return `Protected Workspace Access: ${resourceLabel} ${verb} restricted to authenticated members from the auth page.`;
}

export function resolveRouteAccess(input: {
  pathname: string;
  search?: string;
  isAuthorized: boolean;
  onboardingCompleted: boolean;
  authReady: boolean;
}): RouteAccessResolution {
  const pathname = normalizeAppPathname(input.pathname);
  const search = input.search || '';
  const legalDocId = parseLegalRoute(pathname, search);

  if (legalDocId) {
    return {
      surface: 'legal',
      legalDocId,
      authMode: resolveAuthModeFromUrl(pathname, search),
    };
  }

  if (!input.authReady) {
    return { surface: 'auth', authMode: resolveAuthModeFromUrl(pathname, search) };
  }

  const protectedTab = parseProtectedWorkspacePath(pathname);
  const requestingAuth = isAuthPath(pathname);
  const authModeFromUrl = resolveAuthModeFromUrl(pathname, search);

  // Unauthenticated or unverified visitor gating
  if (!input.isAuthorized) {
    if (protectedTab) {
      return {
        surface: 'auth',
        authMode: 'signin',
        blockedPath: protectedTab.canonicalPath,
        blockedResourceLabel: protectedTab.label,
        protectedNotice: buildProtectedRedirectNotice(protectedTab.label),
        returnToPath: protectedTab.canonicalPath,
      };
    }

    return {
      surface: 'auth',
      authMode: authModeFromUrl,
    };
  }

  // Authenticated visitor onboarding gate
  if (!input.onboardingCompleted) {
    return {
      surface: 'onboarding',
      returnToPath: protectedTab ? protectedTab.canonicalPath : '/feed',
    };
  }

  if (protectedTab) {
    return {
      surface: 'workspace',
      tab: protectedTab.tab,
    };
  }

  if (requestingAuth) {
    return {
      surface: 'auth',
      authMode: authModeFromUrl,
    };
  }

  return {
    surface: 'workspace',
    tab: 'feed',
  };
}

export function getCanonicalPathForSurface(
  surface: AppSurface,
  options?: {
    tab?: TabId;
    authMode?: AuthMode;
    legalDocId?: LegalDocId;
  }
): string {
  if (surface === 'legal' && options?.legalDocId) {
    return getLegalRoutePath(options.legalDocId);
  }
  if (surface === 'auth') {
    return options?.authMode === 'signup' ? '/auth?mode=signup' : '/auth';
  }
  if (surface === 'workspace') {
    return getTabRoutePath(options?.tab || 'feed');
  }
  return '/auth';
}
