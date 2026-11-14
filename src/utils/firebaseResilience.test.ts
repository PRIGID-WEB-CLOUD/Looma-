import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackPrivateSettings,
  buildFallbackUserProfile,
  isFirebaseConfigurationError,
  isPermissionDeniedError,
  isTransientFirestoreError,
} from './firebaseResilience.ts';
import type { UserPrivateSettings, UserProfile } from '../types/social.ts';

test('isTransientFirestoreError classifies offline and unavailable errors without matching permission-denied', () => {
  assert.equal(
    isTransientFirestoreError({
      code: 'unavailable',
      message: 'Could not reach Cloud Firestore backend.',
    }),
    true
  );
  assert.equal(
    isTransientFirestoreError(
      new Error('Failed to get document because the client is offline.')
    ),
    true
  );
  assert.equal(
    isTransientFirestoreError(
      new Error('Failed to get document from server because the client is offline.')
    ),
    true
  );
  assert.equal(
    isTransientFirestoreError({
      code: 'permission-denied',
      message: 'Missing or insufficient permissions.',
    }),
    false
  );
  assert.equal(isPermissionDeniedError({ code: 'permission-denied' }), true);
});

test('isFirebaseConfigurationError detects missing database or invalid api key', () => {
  assert.equal(
    isFirebaseConfigurationError({
      code: 'not-found',
      message: 'Database (default) does not exist.',
    }),
    true
  );
  assert.equal(
    isFirebaseConfigurationError({
      code: 'unavailable',
      message: 'Could not reach Cloud Firestore backend.',
    }),
    false
  );
});

test('buildFallbackUserProfile preserves matching cached UID profile and never falls back to member_alex', () => {
  const authUser = {
    uid: 'google_uid_999',
    displayName: 'Priya Sharma',
    email: 'prigidholdings@gmail.com',
    photoURL: 'https://example.com/avatar.jpg',
  };

  const cachedSameUser: UserProfile = {
    uid: 'google_uid_999',
    displayName: 'Looma Member',
    handle: 'priya_s',
    bio: 'Design notes',
    avatarUrl: '',
    location: 'London',
    interests: ['Design'],
    followersCount: 4,
    followingCount: 2,
    onboardingCompleted: true,
    createdAtMs: 1000,
    updatedAtMs: 2000,
  };

  const hydrated = buildFallbackUserProfile(authUser, cachedSameUser, false);
  assert.equal(hydrated.uid, 'google_uid_999');
  assert.equal(hydrated.displayName, 'Priya Sharma');
  assert.equal(hydrated.handle, 'priya_s');
  assert.equal(hydrated.avatarUrl, 'https://example.com/avatar.jpg');
  assert.equal(hydrated.onboardingCompleted, true);

  const staleDifferentUser: UserProfile = {
    ...cachedSameUser,
    uid: 'member_alex',
    handle: 'alexrivera',
  };
  const freshHydrated = buildFallbackUserProfile(
    authUser,
    staleDifferentUser,
    false,
    5000
  );
  assert.equal(freshHydrated.uid, 'google_uid_999');
  assert.equal(freshHydrated.displayName, 'Priya Sharma');
  assert.equal(freshHydrated.handle, 'prigidholdings');
  assert.equal(freshHydrated.onboardingCompleted, false);
  assert.equal(freshHydrated.createdAtMs, 5000);
});

test('buildFallbackPrivateSettings matches uid or creates defaults keyed to auth uid', () => {
  const cached: UserPrivateSettings = {
    uid: 'other_uid',
    email: 'other@example.com',
    pushEnabled: false,
    themePreference: 'dark',
    notifyLikes: false,
    notifyComments: false,
    notifyMessages: false,
    profileVisibility: 'followers',
    messagePrivacy: 'following',
  };

  const settings = buildFallbackPrivateSettings(
    { uid: 'google_uid_999', email: 'prigidholdings@gmail.com' },
    cached,
    true,
    'light'
  );
  assert.equal(settings.uid, 'google_uid_999');
  assert.equal(settings.email, 'prigidholdings@gmail.com');
  assert.equal(settings.pushEnabled, true);
  assert.equal(settings.themePreference, 'light');
});
