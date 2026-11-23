export interface CommerceEnvConfig {
  apiUrl: string;
  defaultStoreId: string;
  publishableKey: string;
  adminDashboardUrl: string;
  internalSsoSecret: string;
}

const BLOCKED_PUBLIC_COMMERCE_PREFIXES = [
  '/admin',
  '/platform-admin',
  '/auth/seller',
  '/settings/credentials',
  '/channels',
  '/internal',
];

const LOOMA_NATIVE_API_PREFIXES = [
  '/api/storage',
  '/api/admin/storage',
  '/api/calls',
  '/api/link-preview',
  '/api/business-profiles',
  '/api/commerce',
  '/api/marketplace',
  '/api/internal',
];

const COMMERCE_SELLER_API_PREFIXES = [
  '/api/health',
  '/api/auth',
  '/api/admin',
  '/api/products',
  '/api/orders',
  '/api/categories',
  '/api/coupons',
  '/api/reviews',
  '/api/wishlist',
  '/api/cart',
  '/api/blog',
  '/api/posts',
  '/api/media',
  '/api/store',
  '/api/showroom-locations',
  '/api/settings',
  '/api/team',
  '/api/users',
  '/api/customers',
  '/api/apikeys',
  '/api/providers',
  '/api/pages',
  '/api/shipping',
  '/api/newsletter',
  '/api/ecommerce',
  '/api/channels',
  '/api/facebook',
  '/api/twitter',
  '/api/whatsapp',
  '/api/push-tokens',
  '/api/events',
  '/api/eprolo',
  '/api/low-stock',
  '/api/marketing',
  '/api/analytics',
  '/api/payments',
  '/api/webhooks',
  '/api/geolocation',
  '/api/chat',
  '/api/upload',
  '/api/uploads',
];

export function cleanCommerceEnvUrl(value: string | undefined): string {
  const trimmed = (value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function parseCommerceConfig(env?: {
  COMMERCE_API_URL?: string;
  COMMERCE_DEFAULT_STORE_ID?: string;
  COMMERCE_PUBLISHABLE_KEY?: string;
  COMMERCE_ADMIN_DASHBOARD_URL?: string;
  COMMERCE_INTERNAL_SSO_SECRET?: string;
}): CommerceEnvConfig {
  const safeEnv = env || {};
  const apiUrl = cleanCommerceEnvUrl(safeEnv.COMMERCE_API_URL);
  const adminDashboardUrl = cleanCommerceEnvUrl(safeEnv.COMMERCE_ADMIN_DASHBOARD_URL);
  return {
    apiUrl,
    defaultStoreId: (safeEnv.COMMERCE_DEFAULT_STORE_ID || '').trim(),
    publishableKey: (safeEnv.COMMERCE_PUBLISHABLE_KEY || '').trim(),
    adminDashboardUrl: adminDashboardUrl || (apiUrl ? `${apiUrl}/seller` : ''),
    internalSsoSecret: (safeEnv.COMMERCE_INTERNAL_SSO_SECRET || '').trim(),
  };
}

export function resolveCommerceSsoRedirectUrl(
  cfg: Pick<CommerceEnvConfig, 'apiUrl' | 'adminDashboardUrl'>,
  code: string
): string | null {
  const trimmedCode = (code || '').trim();
  if (!trimmedCode) return null;

  const baseCandidate = cfg.adminDashboardUrl || (cfg.apiUrl ? `${cfg.apiUrl}/seller` : '');
  const sanitizedBase = cleanCommerceEnvUrl(baseCandidate);
  if (!sanitizedBase) return null;

  try {
    const parsed = new URL(sanitizedBase);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    parsed.pathname = normalizedPath.endsWith('/sso')
      ? normalizedPath
      : `${normalizedPath}/sso`;
    parsed.searchParams.set('code', trimmedCode);
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isBlockedPublicCommercePath(subpath: string): boolean {
  const normalized = `/${(subpath || '').replace(/^\/+/, '').toLowerCase()}`;
  return BLOCKED_PUBLIC_COMMERCE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}

export function isCommerceSellerApiPath(pathname: string): boolean {
  const normalized = (pathname || '').split('?')[0].toLowerCase();
  if (
    LOOMA_NATIVE_API_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
    )
  ) {
    return false;
  }
  return COMMERCE_SELLER_API_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}

export function requiresVerifiedBuyerAuth(method: string, subpath: string): boolean {
  const upperMethod = (method || 'GET').toUpperCase();
  const normalized = `/${(subpath || '').replace(/^\/+/, '').toLowerCase()}`;
  if (
    normalized.startsWith('/checkout') ||
    normalized.startsWith('/orders') ||
    normalized.startsWith('/account')
  ) {
    return true;
  }
  return upperMethod !== 'GET' && upperMethod !== 'HEAD' && upperMethod !== 'OPTIONS';
}

export function buildCommerceUpstreamUrl(
  baseUrl: string,
  mountPrefix: '/api/marketplace' | '/api/commerce' | '/api/commerce/admin' | '/api',
  requestUrl: string,
  options?: { stripStoreQuery?: boolean }
): string {
  const parsedReq = new URL(requestUrl);
  let suffix = parsedReq.pathname;

  if (mountPrefix === '/api/commerce/admin') {
    suffix = suffix.replace(/^\/api\/commerce\/admin/, '/api/admin');
  } else if (mountPrefix === '/api/commerce') {
    suffix = suffix.replace(/^\/api\/commerce/, '/api');
  } else if (mountPrefix === '/api/marketplace') {
    suffix = suffix.replace(/^\/api\/marketplace/, '/api/marketplace');
  }

  if (!suffix.startsWith('/')) {
    suffix = `/${suffix}`;
  }

  if (options?.stripStoreQuery && parsedReq.searchParams.has('storeId')) {
    parsedReq.searchParams.delete('storeId');
  }

  const query = parsedReq.searchParams.toString();
  return `${baseUrl}${suffix}${query ? `?${query}` : ''}`;
}

export function sanitizeProxyHeaders(
  reqHeaders: Headers,
  options?: { stripStoreOverride?: boolean }
): Headers {
  const clean = new Headers();
  reqHeaders.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower.startsWith('x-looma-')) {
      return;
    }
    if (options?.stripStoreOverride && lower === 'x-store-id') {
      return;
    }
    clean.set(key, value);
  });
  return clean;
}

export function resolveTenantForwardHeaders(input: {
  reqHeaders: Headers;
  requestUrl: string;
  defaultStoreId?: string;
  defaultPublishableKey?: string;
  omitStoreHeaders?: boolean;
}): Record<string, string> {
  const out: Record<string, string> = {};
  const url = new URL(input.requestUrl);

  if (!input.omitStoreHeaders) {
    const reqStoreId = (
      input.reqHeaders.get('x-store-id') ||
      url.searchParams.get('storeId') ||
      input.defaultStoreId ||
      ''
    ).trim();
    if (reqStoreId) {
      out['X-Store-Id'] = reqStoreId;
    }
  }

  const reqPubKey = (
    input.reqHeaders.get('x-publishable-key') ||
    input.reqHeaders.get('x-api-key') ||
    url.searchParams.get('publishableKey') ||
    input.defaultPublishableKey ||
    ''
  ).trim();
  if (reqPubKey) {
    out['X-Publishable-Key'] = reqPubKey;
  }

  const forwardedHost = (
    input.reqHeaders.get('x-forwarded-host') ||
    input.reqHeaders.get('host') ||
    url.host
  ).trim();
  if (forwardedHost) {
    out['X-Forwarded-Host'] = forwardedHost;
  }

  return out;
}
