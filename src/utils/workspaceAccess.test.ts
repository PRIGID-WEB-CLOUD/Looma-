import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProtectedRedirectNotice,
  getCanonicalPathForSurface,
  resolveRouteAccess,
} from './workspaceAccess';

test('unauthenticated visitor at root goes directly to auth and cannot view feed, messages, notifications, profile, settings, or connections', () => {
  const root = resolveRouteAccess({
    pathname: '/',
    isAuthorized: false,
    onboardingCompleted: false,
    authReady: true,
  });
  assert.equal(root.surface, 'auth');
  assert.equal(root.authMode, 'signin');

  for (const path of ['/feed', '/connections', '/messages', '/notifications', '/profile', '/settings']) {
    const res = resolveRouteAccess({
      pathname: path,
      isAuthorized: false,
      onboardingCompleted: false,
      authReady: true,
    });
    assert.equal(res.surface, 'auth', `expected ${path} to redirect unauthenticated user to auth`);
    assert.equal(res.returnToPath, path);
    assert.ok(res.protectedNotice?.includes('Protected Workspace Access'));
  }
});

test('unauthenticated visitor with /auth, /signup, or ?auth=signup reaches auth page with requested mode', () => {
  const signupQuery = resolveRouteAccess({
    pathname: '/',
    search: '?auth=signup',
    isAuthorized: false,
    onboardingCompleted: false,
    authReady: true,
  });
  assert.equal(signupQuery.surface, 'auth');
  assert.equal(signupQuery.authMode, 'signup');

  const authPath = resolveRouteAccess({
    pathname: '/auth',
    search: '?mode=signup',
    isAuthorized: false,
    onboardingCompleted: false,
    authReady: true,
  });
  assert.equal(authPath.surface, 'auth');
  assert.equal(authPath.authMode, 'signup');

  const signInPath = resolveRouteAccess({
    pathname: '/auth',
    isAuthorized: false,
    onboardingCompleted: false,
    authReady: true,
  });
  assert.equal(signInPath.surface, 'auth');
  assert.equal(signInPath.authMode, 'signin');
});

test('legal pages remain accessible regardless of auth state', () => {
  for (const isAuthorized of [false, true]) {
    const res = resolveRouteAccess({
      pathname: '/terms',
      isAuthorized,
      onboardingCompleted: isAuthorized,
      authReady: true,
    });
    assert.equal(res.surface, 'legal');
    assert.equal(res.legalDocId, 'terms');
  }
});

test('authenticated and onboarded member accesses workspace tabs without admin or landingpage coupling', () => {
  const feed = resolveRouteAccess({
    pathname: '/',
    isAuthorized: true,
    onboardingCompleted: true,
    authReady: true,
  });
  assert.equal(feed.surface, 'workspace');
  assert.equal(feed.tab, 'feed');

  const messages = resolveRouteAccess({
    pathname: '/messages',
    isAuthorized: true,
    onboardingCompleted: true,
    authReady: true,
  });
  assert.equal(messages.surface, 'workspace');
  assert.equal(messages.tab, 'messages');
});

test('admin and landing routes resolve directly to their dedicated surfaces without bouncing', () => {
  for (const path of ['/admin', '/admin/', '/admin/index.html']) {
    const unauth = resolveRouteAccess({
      pathname: path,
      isAuthorized: false,
      onboardingCompleted: false,
      authReady: true,
    });
    assert.equal(unauth.surface, 'admin', `expected ${path} to resolve to admin surface for unauth`);

    const auth = resolveRouteAccess({
      pathname: path,
      isAuthorized: true,
      onboardingCompleted: true,
      authReady: true,
    });
    assert.equal(auth.surface, 'admin', `expected ${path} to resolve to admin surface for auth`);
  }

  for (const path of ['/landingpage', '/landingpage/', '/landing', '/landing/']) {
    const unauth = resolveRouteAccess({
      pathname: path,
      isAuthorized: false,
      onboardingCompleted: false,
      authReady: true,
    });
    assert.equal(unauth.surface, 'landing', `expected ${path} to resolve to landing surface for unauth`);

    const auth = resolveRouteAccess({
      pathname: path,
      isAuthorized: true,
      onboardingCompleted: true,
      authReady: true,
    });
    assert.equal(auth.surface, 'landing', `expected ${path} to resolve to landing surface for auth`);
  }
});

test('authenticated user who has not completed onboarding is gated to onboarding for protected routes', () => {
  const res = resolveRouteAccess({
    pathname: '/messages',
    isAuthorized: true,
    onboardingCompleted: false,
    authReady: true,
  });
  assert.equal(res.surface, 'onboarding');
  assert.equal(res.returnToPath, '/messages');
});

test('canonical paths and redirect notices format accurately', () => {
  assert.equal(getCanonicalPathForSurface('auth', { authMode: 'signup' }), '/auth?mode=signup');
  assert.equal(getCanonicalPathForSurface('workspace', { tab: 'settings' }), '/settings');
  assert.equal(getCanonicalPathForSurface('legal', { legalDocId: 'privacy' }), '/privacy');
  assert.equal(getCanonicalPathForSurface('marketplace'), '/marketplace');
  assert.equal(
    getCanonicalPathForSurface('marketplace', { productId: 'prod_123' }),
    '/marketplace/product/prod_123'
  );
  assert.equal(
    getCanonicalPathForSurface('business-profile', { businessSlug: 'luxe-atelier' }),
    '/business/luxe-atelier'
  );
  assert.ok(buildProtectedRedirectNotice('Feed posts').includes('Feed posts are restricted'));
  assert.ok(buildProtectedRedirectNotice('Member profile').includes('Member profile is restricted'));
});

test('public marketplace, product detail, and business profile routes stay accessible without login', () => {
  const mp = resolveRouteAccess({
    pathname: '/marketplace',
    isAuthorized: false,
    onboardingCompleted: false,
    authReady: true,
  });
  assert.equal(mp.surface, 'marketplace');
  assert.equal(mp.productId, null);

  const pdp = resolveRouteAccess({
    pathname: '/marketplace/product/prod_abc',
    isAuthorized: false,
    onboardingCompleted: false,
    authReady: true,
  });
  assert.equal(pdp.surface, 'marketplace');
  assert.equal(pdp.productId, 'prod_abc');

  const bp = resolveRouteAccess({
    pathname: '/business/luxe-atelier',
    isAuthorized: false,
    onboardingCompleted: false,
    authReady: true,
  });
  assert.equal(bp.surface, 'business-profile');
  assert.equal(bp.businessSlug, 'luxe-atelier');

  const authMp = resolveRouteAccess({
    pathname: '/marketplace/product/prod_abc',
    isAuthorized: true,
    onboardingCompleted: true,
    authReady: true,
  });
  assert.equal(authMp.surface, 'workspace');
  assert.equal(authMp.tab, 'product-detail');
  assert.equal(authMp.productId, 'prod_abc');

  const authBp = resolveRouteAccess({
    pathname: '/business/luxe-atelier',
    isAuthorized: true,
    onboardingCompleted: true,
    authReady: true,
  });
  assert.equal(authBp.surface, 'workspace');
  assert.equal(authBp.tab, 'business-profile');
  assert.equal(authBp.businessSlug, 'luxe-atelier');
});

