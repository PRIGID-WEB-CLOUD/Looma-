export interface CommerceEnvConfig {
  apiUrl: string;
  defaultStoreId: string;
  publishableKey: string;
  adminDashboardUrl: string;
}

const BLOCKED_PUBLIC_COMMERCE_PREFIXES = [
  '/admin',
  '/platform-admin',
  '/auth/seller',
  '/settings/credentials',
  '/channels',
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

export function parseCommerceConfig(env: {
  COMMERCE_API_URL?: string;
  COMMERCE_DEFAULT_STORE_ID?: string;
  COMMERCE_PUBLISHABLE_KEY?: string;
  COMMERCE_ADMIN_DASHBOARD_URL?: string;
}): CommerceEnvConfig {
  return {
    apiUrl: cleanCommerceEnvUrl(env.COMMERCE_API_URL),
    defaultStoreId: (env.COMMERCE_DEFAULT_STORE_ID || '').trim(),
    publishableKey: (env.COMMERCE_PUBLISHABLE_KEY || '').trim(),
    adminDashboardUrl: cleanCommerceEnvUrl(env.COMMERCE_ADMIN_DASHBOARD_URL),
  };
}

export function isBlockedPublicCommercePath(subpath: string): boolean {
  const normalized = `/${(subpath || '').replace(/^\/+/, '').toLowerCase()}`;
  return BLOCKED_PUBLIC_COMMERCE_PREFIXES.some(
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
  mountPrefix: '/api/marketplace' | '/api/commerce' | '/api/commerce/admin',
  requestUrl: string
): string {
  const parsedReq = new URL(requestUrl);
  let suffix = parsedReq.pathname;

  if (mountPrefix === '/api/commerce/admin') {
    suffix = suffix.replace(/^\/api\/commerce\/admin/, '/api/admin');
  } else if (mountPrefix === '/api/commerce') {
    suffix = suffix.replace(/^\/api\/commerce/, '/api');
  } else {
    suffix = suffix.replace(/^\/api\/marketplace/, '/api/marketplace');
  }

  if (!suffix.startsWith('/')) {
    suffix = `/${suffix}`;
  }

  return `${baseUrl}${suffix}${parsedReq.search}`;
}

export function resolveTenantForwardHeaders(input: {
  reqHeaders: Headers;
  requestUrl: string;
  defaultStoreId?: string;
  defaultPublishableKey?: string;
}): Record<string, string> {
  const out: Record<string, string> = {};
  const url = new URL(input.requestUrl);

  const reqStoreId = (
    input.reqHeaders.get('x-store-id') ||
    url.searchParams.get('storeId') ||
    input.defaultStoreId ||
    ''
  ).trim();
  if (reqStoreId) {
    out['X-Store-Id'] = reqStoreId;
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
