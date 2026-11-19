import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBusinessSlug,
  validateBusinessProfileInput,
} from './businessProfileValidation';
import {
  parseBusinessSlugFromPath,
  parseMarketplaceRoute,
  resolveRouteAccess,
} from './workspaceAccess';

test('normalizeBusinessSlug produces clean lowercase hyphenated business handles', () => {
  assert.equal(normalizeBusinessSlug('  Luxe Atelier!!  '), 'luxe-atelier');
  assert.equal(normalizeBusinessSlug('Studio_Kuro--2026'), 'studio-kuro-2026');
  assert.equal(normalizeBusinessSlug('---'), '');
});

test('validateBusinessProfileInput rejects invalid inputs and cleans valid submissions', () => {
  const invalidName = validateBusinessProfileInput({
    displayName: 'A',
    slug: 'ab',
    category: 'Fashion & Apparel',
  });
  assert.equal(invalidName.valid, false);

  const invalidWebsite = validateBusinessProfileInput({
    displayName: 'Luxe Studio',
    slug: 'luxe-studio',
    category: 'Fashion & Apparel',
    websiteUrl: 'javascript:alert(1)',
  });
  assert.equal(invalidWebsite.valid, false);

  const valid = validateBusinessProfileInput({
    displayName: 'Luxe Atelier',
    slug: 'Luxe Atelier!',
    category: 'Fashion & Apparel',
    bio: 'Curated objects and design.',
    websiteUrl: 'https://luxe.example.com',
    currency: 'usd',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.clean.slug, 'luxe-atelier');
  assert.equal(valid.clean.currency, 'USD');
});

test('public Business Profile and Marketplace product routes stay accessible to guests', () => {
  assert.equal(parseBusinessSlugFromPath('/business/Luxe-Atelier/'), 'luxe-atelier');
  assert.deepEqual(parseMarketplaceRoute('/marketplace/product/prod_Chrono01'), {
    isMarketplace: true,
    productId: 'prod_Chrono01',
  });

  const guestBusiness = resolveRouteAccess({
    pathname: '/business/luxe-atelier',
    isAuthorized: false,
    onboardingCompleted: false,
    authReady: true,
  });
  assert.deepEqual(guestBusiness, {
    surface: 'business-profile',
    businessSlug: 'luxe-atelier',
  });

  const guestProduct = resolveRouteAccess({
    pathname: '/marketplace/product/prod_Chrono01',
    isAuthorized: false,
    onboardingCompleted: false,
    authReady: true,
  });
  assert.deepEqual(guestProduct, {
    surface: 'marketplace',
    productId: 'prod_Chrono01',
  });

  const signedInProduct = resolveRouteAccess({
    pathname: '/marketplace/product/prod_Chrono01',
    isAuthorized: true,
    onboardingCompleted: true,
    authReady: true,
  });
  assert.equal(signedInProduct.surface, 'workspace');
  assert.equal(signedInProduct.tab, 'product-detail');
  assert.equal(signedInProduct.productId, 'prod_Chrono01');
});
