import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommerceUpstreamUrl,
  cleanCommerceEnvUrl,
  isBlockedPublicCommercePath,
  isCommerceSellerApiPath,
  parseCommerceConfig,
  requiresVerifiedBuyerAuth,
  resolveTenantForwardHeaders,
  sanitizeProxyHeaders,
} from './commerceProxyLogic';

test('cleanCommerceEnvUrl validates http/https protocols and strips trailing slashes', () => {
  assert.equal(cleanCommerceEnvUrl('https://commerce.looma.studio///'), 'https://commerce.looma.studio');
  assert.equal(cleanCommerceEnvUrl('http://127.0.0.1:4000/'), 'http://127.0.0.1:4000');
  assert.equal(cleanCommerceEnvUrl('javascript:alert(1)'), '');
  assert.equal(cleanCommerceEnvUrl('not-a-url'), '');
  assert.equal(cleanCommerceEnvUrl(undefined), '');
});

test('parseCommerceConfig parses sanitized commerce proxy environment settings', () => {
  const parsed = parseCommerceConfig({
    COMMERCE_API_URL: 'https://api.commerce.example.com/',
    COMMERCE_DEFAULT_STORE_ID: '  store-001 ',
    COMMERCE_PUBLISHABLE_KEY: ' pk_live_abc123 ',
    COMMERCE_ADMIN_DASHBOARD_URL: 'https://seller.commerce.example.com/',
    COMMERCE_INTERNAL_SSO_SECRET: ' sso_secret_value ',
  });

  assert.deepEqual(parsed, {
    apiUrl: 'https://api.commerce.example.com',
    defaultStoreId: 'store-001',
    publishableKey: 'pk_live_abc123',
    adminDashboardUrl: 'https://seller.commerce.example.com',
    internalSsoSecret: 'sso_secret_value',
  });
});

test('isBlockedPublicCommercePath blocks seller/admin/credentials/internal escalation paths on public proxy', () => {
  assert.equal(isBlockedPublicCommercePath('/admin'), true);
  assert.equal(isBlockedPublicCommercePath('/admin/stats'), true);
  assert.equal(isBlockedPublicCommercePath('/platform-admin/tenants'), true);
  assert.equal(isBlockedPublicCommercePath('/auth/seller/login'), true);
  assert.equal(isBlockedPublicCommercePath('/settings/credentials'), true);
  assert.equal(isBlockedPublicCommercePath('/channels'), true);
  assert.equal(isBlockedPublicCommercePath('/internal/sso/issue-code'), true);

  assert.equal(isBlockedPublicCommercePath('/products'), false);
  assert.equal(isBlockedPublicCommercePath('/checkout'), false);
  assert.equal(isBlockedPublicCommercePath('/orders/ord_123'), false);
});

test('isCommerceSellerApiPath routes Commerce seller portal API paths while preserving Looma native endpoints', () => {
  assert.equal(isCommerceSellerApiPath('/api/auth/looma/exchange'), true);
  assert.equal(isCommerceSellerApiPath('/api/auth/me'), true);
  assert.equal(isCommerceSellerApiPath('/api/admin/stats'), true);
  assert.equal(isCommerceSellerApiPath('/api/products'), true);
  assert.equal(isCommerceSellerApiPath('/api/orders/ord_1'), true);
  assert.equal(isCommerceSellerApiPath('/api/payments/initialize'), true);
  assert.equal(isCommerceSellerApiPath('/api/events/live'), true);

  assert.equal(isCommerceSellerApiPath('/api/storage/upload'), false);
  assert.equal(isCommerceSellerApiPath('/api/admin/storage/list'), false);
  assert.equal(isCommerceSellerApiPath('/api/calls/ice-servers'), false);
  assert.equal(isCommerceSellerApiPath('/api/link-preview'), false);
  assert.equal(isCommerceSellerApiPath('/api/business-profiles/bp_1/provision-store'), false);
  assert.equal(isCommerceSellerApiPath('/api/commerce/sso/authorize'), false);
  assert.equal(isCommerceSellerApiPath('/api/internal/sso/issue-code'), false);
});

test('requiresVerifiedBuyerAuth enforces Firebase auth on buyer checkout, orders, account, and mutations', () => {
  assert.equal(requiresVerifiedBuyerAuth('GET', '/products'), false);
  assert.equal(requiresVerifiedBuyerAuth('GET', '/stores'), false);
  assert.equal(requiresVerifiedBuyerAuth('HEAD', '/products'), false);

  assert.equal(requiresVerifiedBuyerAuth('GET', '/orders'), true);
  assert.equal(requiresVerifiedBuyerAuth('GET', '/account/profile'), true);
  assert.equal(requiresVerifiedBuyerAuth('POST', '/checkout'), true);
  assert.equal(requiresVerifiedBuyerAuth('POST', '/cart'), true);
  assert.equal(requiresVerifiedBuyerAuth('DELETE', '/cart/item_1'), true);
});

test('buildCommerceUpstreamUrl rewrites Looma proxy mount prefixes and optionally strips storeId query', () => {
  assert.equal(
    buildCommerceUpstreamUrl(
      'https://commerce.example.com',
      '/api/marketplace',
      'https://looma.app/api/marketplace/products?category=Timepieces'
    ),
    'https://commerce.example.com/api/marketplace/products?category=Timepieces'
  );

  assert.equal(
    buildCommerceUpstreamUrl(
      'https://commerce.example.com',
      '/api/commerce',
      'https://looma.app/api/commerce/products?storeId=store-001'
    ),
    'https://commerce.example.com/api/products?storeId=store-001'
  );

  assert.equal(
    buildCommerceUpstreamUrl(
      'https://commerce.example.com',
      '/api/commerce/admin',
      'https://looma.app/api/commerce/admin/stats?storeId=evil-store&range=7d',
      { stripStoreQuery: true }
    ),
    'https://commerce.example.com/api/admin/stats?range=7d'
  );

  assert.equal(
    buildCommerceUpstreamUrl(
      'https://commerce.example.com',
      '/api',
      'https://looma.app/api/products?storeId=evil-store&page=1',
      { stripStoreQuery: true }
    ),
    'https://commerce.example.com/api/products?page=1'
  );
});

test('sanitizeProxyHeaders strips x-looma-* headers and optionally x-store-id', () => {
  const incoming = new Headers({
    cookie: 'luxe_session=abc',
    'x-looma-internal-secret': 'spoofed',
    'x-looma-admin-uid': 'evil-uid',
    'x-store-id': 'spoof-store',
    accept: 'application/json',
  });

  const clean = sanitizeProxyHeaders(incoming, { stripStoreOverride: true });
  assert.equal(clean.get('cookie'), 'luxe_session=abc');
  assert.equal(clean.get('accept'), 'application/json');
  assert.equal(clean.get('x-looma-internal-secret'), null);
  assert.equal(clean.get('x-looma-admin-uid'), null);
  assert.equal(clean.get('x-store-id'), null);
});

test('resolveTenantForwardHeaders forwards explicit headers/query params and supports omitStoreHeaders', () => {
  const headersA = new Headers({
    host: 'looma.studio',
  });
  assert.deepEqual(
    resolveTenantForwardHeaders({
      reqHeaders: headersA,
      requestUrl: 'https://looma.studio/api/commerce/products',
      defaultStoreId: 'store-001',
      defaultPublishableKey: 'pk_test_1',
    }),
    {
      'X-Store-Id': 'store-001',
      'X-Publishable-Key': 'pk_test_1',
      'X-Forwarded-Host': 'looma.studio',
    }
  );

  const headersB = new Headers({
    'x-store-id': 'luxe-boutique',
    'x-api-key': 'pk_override',
    'x-forwarded-host': 'shop.luxe.studio',
  });
  assert.deepEqual(
    resolveTenantForwardHeaders({
      reqHeaders: headersB,
      requestUrl: 'https://looma.studio/api/commerce/admin/stats',
      defaultStoreId: 'store-001',
      defaultPublishableKey: 'pk_test_1',
      omitStoreHeaders: true,
    }),
    {
      'X-Publishable-Key': 'pk_override',
      'X-Forwarded-Host': 'shop.luxe.studio',
    }
  );
});
