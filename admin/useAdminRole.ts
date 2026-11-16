import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../src/services/firebase';
import {
  resolveAdminAuthorization,
  type AdminAuthorizationResult,
} from './adminLogic';

export function useAdminRole(input: {
  isAuthorized: boolean;
  firebaseUser: User | null;
  isLocalAutostart: boolean;
}): AdminAuthorizationResult & { checkingAdminDoc: boolean } {
  const [hasAdminDoc, setHasAdminDoc] = useState(false);
  const [checkingAdminDoc, setCheckingAdminDoc] = useState(false);

  const uid = input.firebaseUser?.uid || '';
  const email = input.firebaseUser?.email || null;
  const emailVerified = Boolean(input.firebaseUser?.emailVerified);

  useEffect(() => {
    if (!input.isAuthorized || !uid || !emailVerified || input.isLocalAutostart) {
      setHasAdminDoc(false);
      setCheckingAdminDoc(false);
      return;
    }

    let cancelled = false;
    setCheckingAdminDoc(true);
    getDoc(doc(db, 'admins', uid))
      .then((snap) => {
        if (!cancelled) {
          setHasAdminDoc(snap.exists());
        }
      })
      .catch(() => {
        // Deployed Firestore rules may not expose /admins/{uid}; fail closed to allowlist check.
        if (!cancelled) {
          setHasAdminDoc(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCheckingAdminDoc(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [emailVerified, input.isAuthorized, input.isLocalAutostart, uid]);

  const authorization = resolveAdminAuthorization({
    isAuthorized: input.isAuthorized,
    email,
    emailVerified,
    hasAdminDoc,
    isLocalAutostart: input.isLocalAutostart,
  });

  return {
    ...authorization,
    checkingAdminDoc,
  };
}
