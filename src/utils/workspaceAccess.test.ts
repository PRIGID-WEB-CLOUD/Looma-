import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProtectedRedirectNotice,
  getCanonicalPathForSurface,
  resolveRouteAccess,
} from './workspaceAccess';

test('unauthenticated visitor at root lands on public landingpage and cannot view feed, messages, settings, or admin', () => {
  const root = resolveRouteAccess({
    pathname: '/',
    isAuthorized: false,
    onboardingCompleted: false,
    authReady: true,
  });
  assert.equal(root.surface, 'landing');

  for (const path of ['/feed', '/messages', '/settings', '/profile', '/notifications', '/connections', '/admin']) {
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

test('authenticated and onboarded member accesses workspace tabs, /admin, and /landing preview', () => {
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

  const admin = resolveRouteAccess({
    pathname: '/admin',
    isAuthorized: true,
    onboardingCompleted: true,
    authReady: true,
  });
  assert.equal(admin.surface, 'admin');

  const landingPreview = resolveRouteAccess({
    pathname: '/landing',
    isAuthorized: true,
    onboardingCompleted: true,
    authReady: true,
  });
  assert.equal(landingPreview.surface, 'landing');
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
  assert.equal(getCanonicalPathForSurface('admin'), '/admin');
  assert.equal(getCanonicalPathForSurface('auth', { authMode: 'signup' }), '/auth?mode=signup');
  assert.equal(getCanonicalPathForSurface('workspace', { tab: 'settings' }), '/settings');
  assert.equal(getCanonicalPathForSurface('legal', { legalDocId: 'privacy' }), '/privacy');
  assert.ok(buildProtectedRedirectNotice('Feed posts').includes('Feed posts are restricted'));
  assert.ok(buildProtectedRedirectNotice('Admin console').includes('Admin console is restricted'));
});
