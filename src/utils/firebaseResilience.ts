import type { ThemeMode, UserPrivateSettings, UserProfile } from '../types/social';
import { normalizeAssetUrl, sanitizeHandle } from './socialLogic';
import { isAllowlistedAdminEmail } from '../../admin/adminLogic';

export interface FirebaseAuthUserLike {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

function getErrorCode(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return String((error as { code: string }).code).toLowerCase();
  }
  return '';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return String((error as { message: string }).message).toLowerCase();
  }
  return String(error || '').toLowerCase();
}

export function isPermissionDeniedError(error: unknown): boolean {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);
  return (
    code === 'permission-denied' ||
    code.endsWith('/permission-denied') ||
    message.includes('missing or insufficient permissions') ||
    message.includes('permission_denied')
  );
}

export function isTransientFirestoreError(error: unknown): boolean {
  if (isPermissionDeniedError(error)) return false;

  const code = getErrorCode(error);
  if (
    code === 'unavailable' ||
    code.endsWith('/unavailable') ||
    code === 'deadline-exceeded' ||
    code.endsWith('/deadline-exceeded')
  ) {
    return true;
  }

  const message = getErrorMessage(error);
  return (
    message.includes('the client is offline') ||
    message.includes('client is offline') ||
    message.includes('could not reach cloud firestore backend') ||
    message.includes('failed to get document because the client is offline') ||
    message.includes('failed to get document from server because the client is offline') ||
    message.includes('network error') ||
    message.includes('failed to fetch')
  );
}

export function isFirebaseConfigurationError(error: unknown): boolean {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);
  return (
    code === 'not-found' ||
    code.endsWith('/not-found') ||
    code === 'invalid-argument' ||
    code === 'app/invalid-api-key' ||
    message.includes('api-key-not-valid') ||
    message.includes('project not found') ||
    (message.includes('database') && message.includes('does not exist'))
  );
}

export function buildFallbackUserProfile(
  authUser: FirebaseAuthUserLike,
  cachedProfile: UserProfile | null,
  autostart: boolean,
  nowMs: number = Date.now()
): UserProfile {
  const authDisplayName =
    (authUser.displayName || '').trim().slice(0, 60) || 'Looma Member';
  const authAvatar = normalizeAssetUrl(authUser.photoURL || '');
  const defaultHandle = sanitizeHandle(
    authUser.email?.split('@')[0] || authUser.displayName || 'looma_user'
  );
  const isAdmin = Boolean(authUser.email && isAllowlistedAdminEmail(authUser.email));

  if (cachedProfile && cachedProfile.uid === authUser.uid) {
    const resolvedDisplayName =
      (!cachedProfile.displayName ||
        cachedProfile.displayName === 'Looma Member') &&
      authUser.displayName
        ? authDisplayName
        : cachedProfile.displayName;
    const resolvedAvatar = normalizeAssetUrl(
      cachedProfile.avatarUrl || authAvatar
    );
    return {
      ...cachedProfile,
      displayName: resolvedDisplayName || 'Looma Member',
      handle: cachedProfile.handle || defaultHandle,
      avatarUrl: resolvedAvatar,
      interests: Array.isArray(cachedProfile.interests)
        ? cachedProfile.interests
        : [],
      followersCount: Number(cachedProfile.followersCount || 0),
      followingCount: Number(cachedProfile.followingCount || 0),
      isVerified: Boolean(cachedProfile.isVerified || isAdmin),
      onboardingCompleted:
        Boolean(cachedProfile.onboardingCompleted) || autostart,
    };
  }

  return {
    uid: authUser.uid,
    displayName: authDisplayName,
    handle: defaultHandle,
    bio: 'Sharing daylight notes, design studies, and field dispatches.',
    avatarUrl: authAvatar,
    location: 'Earth',
    interests: ['Architecture', 'Photography'],
    followersCount: 0,
    followingCount: 0,
    isVerified: isAdmin,
    onboardingCompleted: autostart,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

export function buildFallbackPrivateSettings(
  authUser: FirebaseAuthUserLike,
  cachedSettings: UserPrivateSettings | null,
  pushEnabled: boolean,
  theme: ThemeMode
): UserPrivateSettings {
  if (cachedSettings && cachedSettings.uid === authUser.uid) {
    return {
      ...cachedSettings,
      email: cachedSettings.email || authUser.email || '',
    };
  }

  return {
    uid: authUser.uid,
    email: authUser.email || '',
    pushEnabled,
    themePreference: theme,
    notifyLikes: true,
    notifyComments: true,
    notifyMessages: true,
    profileVisibility: 'public',
    messagePrivacy: 'everyone',
  };
}
