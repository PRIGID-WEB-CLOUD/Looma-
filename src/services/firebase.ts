import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  reload,
  deleteUser,
  updateProfile,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  enableNetwork,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  isFirebaseConfigurationError,
  isTransientFirestoreError,
} from '../utils/firebaseResilience';

const app = initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          experimentalForceLongPolling: true,
          localCache: memoryLocalCache(),
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  const probe = async () => {
    await getDocFromServer(doc(db, 'test', 'connection'));
  };

  try {
    await probe();
    return true;
  } catch (error) {
    if (isFirebaseConfigurationError(error)) {
      console.error('Please check your Firebase configuration.', error);
      return false;
    }
    if (!isTransientFirestoreError(error)) {
      return true;
    }

    // Retry once after ensuring Firestore network is active
    try {
      await enableNetwork(db).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 600));
      await probe();
      return true;
    } catch (retryError) {
      if (isFirebaseConfigurationError(retryError)) {
        console.error('Please check your Firebase configuration.', retryError);
        return false;
      }
      if (!isTransientFirestoreError(retryError)) {
        return true;
      }
      return false;
    }
  }
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithApple(): Promise<User> {
  const result = await signInWithPopup(auth, appleProvider);
  return result.user;
}

export async function signInWithEmail(email: string, pass: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  return result.user;
}

export async function signUpWithEmail(
  email: string,
  pass: string,
  displayName: string
): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  if (result.user && displayName) {
    await updateProfile(result.user, { displayName });
  }
  if (result.user && !result.user.emailVerified) {
    await sendEmailVerification(result.user).catch((err) => {
      console.warn('Unable to dispatch initial verification email:', err);
    });
  }
  return result.user;
}

export async function resendVerificationEmail(): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('No active signed-in account found.');
  }
  await sendEmailVerification(auth.currentUser);
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function reloadCurrentUser(): Promise<User | null> {
  if (!auth.currentUser) return null;
  await reload(auth.currentUser);
  return auth.currentUser;
}

export async function updateAuthUserProfile(
  displayName?: string,
  photoURL?: string
): Promise<void> {
  if (!auth.currentUser) return;
  const payload: { displayName?: string; photoURL?: string } = {};
  if (typeof displayName === 'string' && displayName.trim()) {
    payload.displayName = displayName.trim().slice(0, 60);
  }
  if (
    typeof photoURL === 'string' &&
    /^https?:\/\//i.test(photoURL.trim()) &&
    photoURL.trim().length <= 1500
  ) {
    payload.photoURL = photoURL.trim();
  }
  if (Object.keys(payload).length === 0) return;
  await updateProfile(auth.currentUser, payload);
}

export async function deleteCurrentAuthUser(): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('No signed-in Firebase account to delete.');
  }
  await deleteUser(auth.currentUser);
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}

