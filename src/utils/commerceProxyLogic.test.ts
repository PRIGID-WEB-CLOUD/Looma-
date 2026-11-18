import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommerceUpstreamUrl,
  cleanCommerceEnvUrl,
  isBlockedPublicCommercePath,
  parseCommerceConfig,
  requiresVerifiedBuyerAuth,
  resolveTenantForwardHeaders,
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
  });

  assert.deepEqual(parsed, {
    apiUrl: 'https://api.commerce.example.com',
    defaultStoreId: 'store-001',
    publishableKey: 'pk_live_abc123',
    adminDashboardUrl: 'https://seller.commerce.example.com',
  });
});

test('isBlockedPublicCommercePath blocks seller/admin/credentials escalation paths on public proxy', () => {
  assert.equal(isBlockedPublicCommercePath('/admin'), true);
  assert.equal(isBlockedPublicCommercePath('/admin/stats'), true);
  assert.equal(isBlockedPublicCommercePath('/platform-admin/tenants'), true);
  assert.equal(isBlockedPublicCommercePath('/auth/seller/login'), true);
  assert.equal(isBlockedPublicCommercePath('/settings/credentials'), true);
  assert.equal(isBlockedPublicCommercePath('/channels'), true);

  assert.equal(isBlockedPublicCommercePath('/products'), false);
  assert.equal(isBlockedPublicCommercePath('/checkout'), false);
  assert.equal(isBlockedPublicCommercePath('/orders/ord_123'), false);
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

test('buildCommerceUpstreamUrl rewrites Looma proxy mount prefixes cleanly with query params', () => {
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
      'https://looma.app/api/commerce/admin/stats'
    ),
    'https://commerce.example.com/api/admin/stats'
  );
});

test('resolveTenantForwardHeaders forwards explicit headers/query params with env fallbacks', () => {
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
      requestUrl: 'https://looma.studio/api/commerce/checkout',
      defaultStoreId: 'store-001',
      defaultPublishableKey: 'pk_test_1',
    }),
    {
      'X-Store-Id': 'luxe-boutique',
      'X-Publishable-Key': 'pk_override',
      'X-Forwarded-Host': 'shop.luxe.studio',
    }
  );
});
