import type { TabId } from '../types/social';
import type { AuthMode } from '../components/AuthView';
import { getLegalRoutePath, parseLegalRoute, type LegalDocId } from './legalLogic';

export type AppSurface =
  | 'auth'
  | 'onboarding'
  | 'workspace'
  | 'legal'
  | 'admin'
  | 'landing'
  | 'marketplace'
  | 'business-profile';

export type ProtectedWorkspaceTab = Exclude<TabId, 'public-profile' | 'auth'>;

export interface RouteAccessResolution {
  surface: AppSurface;
  tab?: ProtectedWorkspaceTab;
  authMode?: AuthMode;
  legalDocId?: LegalDocId;
  businessSlug?: string | null;
  productId?: string | null;
  blockedPath?: string | null;
  blockedResourceLabel?: string | null;
  protectedNotice?: string | null;
  returnToPath?: string | null;
}

const TAB_PATH_MAP: Record<ProtectedWorkspaceTab, string> = {
  feed: '/feed',
  marketplace: '/marketplace',
  connections: '/connections',
  messages: '/messages',
  notifications: '/notifications',
  profile: '/profile',
  settings: '/settings',
  'business-profile': '/business',
  'product-detail': '/marketplace',
};

const PROTECTED_TAB_BY_PATH: Record<string, { tab: ProtectedWorkspaceTab; label: string }> = {
  '/feed': { tab: 'feed', label: 'Feed posts' },
  '/connections': { tab: 'connections', label: 'Friends & connections' },
  '/messages': { tab: 'messages', label: 'Messages' },
  '/notifications': { tab: 'notifications', label: 'Notifications' },
  '/profile': { tab: 'profile', label: 'Member profile' },
  '/settings': { tab: 'settings', label: 'Profile settings' },
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

export function parseBusinessSlugFromPath(pathname: string): string | null {
  const normalized = normalizeAppPathname(pathname);
  if (!normalized.startsWith('/business/')) return null;
  const slug = normalized.slice('/business/'.length).split('/')[0]?.trim() || '';
  return slug || null;
}

export function parseMarketplaceRoute(pathname: string): {
  isMarketplace: boolean;
  productId: string | null;
} {
  const rawClean = (pathname || '/').split('?')[0].trim().replace(/\/+$/, '') || '/';
  const normalized = rawClean.toLowerCase();
  if (normalized === '/marketplace') {
    return { isMarketplace: true, productId: null };
  }
  if (normalized.startsWith('/marketplace/product/')) {
    const productId = rawClean.slice('/marketplace/product/'.length).split('/')[0]?.trim() || '';
    return { isMarketplace: true, productId: productId || null };
  }
  return { isMarketplace: false, productId: null };
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

  // Dedicated Admin and Landing page routes resolve directly to their surfaces without redirect bouncing
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return { surface: 'admin' };
  }

  if (
    pathname === '/landingpage' ||
    pathname.startsWith('/landingpage/') ||
    pathname === '/landing' ||
    pathname.startsWith('/landing/')
  ) {
    return { surface: 'landing' };
  }

  const legalDocId = parseLegalRoute(pathname, search);

  if (legalDocId) {
    return {
      surface: 'legal',
      legalDocId,
      authMode: resolveAuthModeFromUrl(pathname, search),
    };
  }

  const businessSlug = parseBusinessSlugFromPath(pathname);
  const marketplaceRoute = parseMarketplaceRoute(input.pathname);

  if (!input.authReady) {
    return { surface: 'auth', authMode: resolveAuthModeFromUrl(pathname, search) };
  }

  const protectedTab = parseProtectedWorkspacePath(pathname);
  const requestingAuth = isAuthPath(pathname);
  const authModeFromUrl = resolveAuthModeFromUrl(pathname, search);

  // Public Marketplace & Public Business Profile routes remain browsable without requiring login
  if (!input.isAuthorized) {
    if (businessSlug) {
      return {
        surface: 'business-profile',
        businessSlug,
      };
    }

    if (marketplaceRoute.isMarketplace) {
      return {
        surface: 'marketplace',
        productId: marketplaceRoute.productId,
      };
    }

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
      returnToPath: protectedTab
        ? protectedTab.canonicalPath
        : businessSlug
          ? `/business/${businessSlug}`
          : marketplaceRoute.isMarketplace
            ? marketplaceRoute.productId
              ? `/marketplace/product/${marketplaceRoute.productId}`
              : '/marketplace'
            : '/feed',
    };
  }

  if (businessSlug) {
    return {
      surface: 'workspace',
      tab: 'business-profile',
      businessSlug,
    };
  }

  if (marketplaceRoute.isMarketplace) {
    return {
      surface: 'workspace',
      tab: marketplaceRoute.productId ? 'product-detail' : 'marketplace',
      productId: marketplaceRoute.productId,
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
    businessSlug?: string;
    productId?: string;
  }
): string {
  if (surface === 'admin') return '/admin';
  if (surface === 'landing') return '/landingpage';
  if (surface === 'marketplace') {
    return options?.productId ? `/marketplace/product/${options.productId}` : '/marketplace';
  }
  if (surface === 'business-profile') {
    return options?.businessSlug ? `/business/${options.businessSlug}` : '/marketplace';
  }
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
