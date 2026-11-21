import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import type {
  BusinessInvite,
  BusinessMembership,
  BusinessMembershipRole,
  BusinessNotification,
  BusinessNotificationType,
  BusinessProfile,
} from '../types/business';
import type { BusinessMessagingSettings, QuickReplyItem } from '../types/businessChat';
import type { VerificationRequest } from '../types/social';

import {
  BUSINESS_CATEGORIES,
  BUSINESS_CURRENCIES,
  generateBusinessHandleFromName,
  normalizeBusinessSlug,
  suggestAlternativeBusinessHandles,
  validateBusinessProfileInput,
} from '../utils/businessProfileValidation';

export {
  BUSINESS_CATEGORIES,
  BUSINESS_CURRENCIES,
  generateBusinessHandleFromName,
  normalizeBusinessSlug,
  suggestAlternativeBusinessHandles,
  validateBusinessProfileInput,
};

function timestampToMs(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  if (
    val &&
    typeof val === 'object' &&
    'toMillis' in val &&
    typeof (val as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (val as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

function mapBusinessProfile(id: string, d: Record<string, unknown>): BusinessProfile {
  return {
    id: String(d.id || id),
    slug: String(d.slug || ''),
    displayName: String(d.displayName || 'Business'),
    category: String(d.category || 'General Merchandise'),
    bio: String(d.bio || ''),
    logoUrl: String(d.logoUrl || ''),
    bannerUrl: String(d.bannerUrl || ''),
    ...(typeof d.websiteUrl === 'string' && d.websiteUrl ? { websiteUrl: d.websiteUrl } : {}),
    ...(typeof d.location === 'string' && d.location ? { location: d.location } : {}),
    currency: String(d.currency || 'USD'),
    ownerUid: String(d.ownerUid || ''),
    ...(typeof d.commerceStoreId === 'string' && d.commerceStoreId
      ? { commerceStoreId: d.commerceStoreId }
      : {}),
    ...(typeof d.commerceStoreSlug === 'string' && d.commerceStoreSlug
      ? { commerceStoreSlug: d.commerceStoreSlug }
      : {}),
    status: d.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
    verified: Boolean(d.verified),
    followersCount: Number(d.followersCount || 0),
    createdAtMs: timestampToMs(d.createdAt),
    updatedAtMs: timestampToMs(d.updatedAt),
  };
}

function mapBusinessMembership(id: string, d: Record<string, unknown>): BusinessMembership {
  const roleRaw = String(d.role || 'VIEWER').toUpperCase();
  const role: BusinessMembershipRole =
    roleRaw === 'OWNER' || roleRaw === 'ADMIN' || roleRaw === 'EDITOR' || roleRaw === 'VIEWER'
      ? roleRaw
      : 'VIEWER';
  const statusRaw = String(d.status || 'ACTIVE').toUpperCase();
  const status =
    statusRaw === 'ACTIVE' || statusRaw === 'INVITED' || statusRaw === 'REVOKED'
      ? statusRaw
      : 'ACTIVE';
  return {
    id: String(d.id || id),
    businessProfileId: String(d.businessProfileId || ''),
    uid: String(d.uid || ''),
    role,
    status,
    invitedByUid: String(d.invitedByUid || ''),
    ...(typeof d.inviteId === 'string' && d.inviteId ? { inviteId: d.inviteId } : {}),
    ...(typeof d.displayName === 'string' ? { displayName: d.displayName } : {}),
    ...(typeof d.handle === 'string' ? { handle: d.handle } : {}),
    ...(typeof d.avatarUrl === 'string' ? { avatarUrl: d.avatarUrl } : {}),
    createdAtMs: timestampToMs(d.createdAt),
    updatedAtMs: timestampToMs(d.updatedAt),
  };
}

function mapBusinessInvite(id: string, d: Record<string, unknown>): BusinessInvite {
  const roleRaw = String(d.role || 'VIEWER').toUpperCase();
  const role: Exclude<BusinessMembershipRole, 'OWNER'> =
    roleRaw === 'ADMIN' || roleRaw === 'EDITOR' || roleRaw === 'VIEWER' ? roleRaw : 'VIEWER';
  const statusRaw = String(d.status || 'PENDING').toUpperCase();
  const status =
    statusRaw === 'PENDING' ||
    statusRaw === 'ACCEPTED' ||
    statusRaw === 'REVOKED' ||
    statusRaw === 'EXPIRED'
      ? statusRaw
      : 'PENDING';
  return {
    id: String(d.id || id),
    businessProfileId: String(d.businessProfileId || ''),
    businessName: String(d.businessName || ''),
    email: String(d.email || ''),
    role,
    tokenHash: String(d.tokenHash || ''),
    status,
    invitedByUid: String(d.invitedByUid || ''),
    createdAtMs: timestampToMs(d.createdAt),
    expiresAtMs: Number(d.expiresAtMs || 0),
  };
}

export async function checkBusinessSlugAvailable(
  slug: string,
  ignoreBusinessProfileId?: string
): Promise<boolean> {
  const clean = normalizeBusinessSlug(slug);
  if (clean.length < 2) return false;
  try {
    const snap = await getDoc(doc(db, 'businessHandles', clean));
    if (!snap.exists()) return true;
    if (ignoreBusinessProfileId && snap.data()?.businessProfileId === ignoreBusinessProfileId) {
      return true;
    }
    return false;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `businessHandles/${clean}`);
  }
}

export async function createBusinessProfile(input: {
  ownerUid: string;
  ownerDisplayName?: string;
  ownerHandle?: string;
  ownerAvatarUrl?: string;
  displayName: string;
  slug: string;
  category: string;
  bio?: string;
  logoUrl?: string;
  bannerUrl?: string;
  websiteUrl?: string;
  location?: string;
  currency?: string;
}): Promise<BusinessProfile> {
  const validation = validateBusinessProfileInput({
    displayName: input.displayName,
    slug: input.slug,
    category: input.category,
    bio: input.bio,
    websiteUrl: input.websiteUrl,
    location: input.location,
    currency: input.currency,
  });
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid Business Profile details.');
  }

  const clean = validation.clean;
  const bpId = makeId('bp');
  const membershipId = `${bpId}_${input.ownerUid}`;
  const bpRef = doc(db, 'businessProfiles', bpId);
  const handleRef = doc(db, 'businessHandles', clean.slug);
  const membershipRef = doc(db, 'businessMemberships', membershipId);
  const logoUrl = (input.logoUrl || '').trim().slice(0, 250000);
  const bannerUrl = (input.bannerUrl || '').trim().slice(0, 250000);

  try {
    await runTransaction(db, async (tx) => {
      const existingHandle = await tx.get(handleRef);
      if (existingHandle.exists()) {
        throw new Error(`The business handle "@${clean.slug}" is already taken.`);
      }

      tx.set(bpRef, {
        id: bpId,
        slug: clean.slug,
        displayName: clean.displayName,
        category: clean.category,
        bio: clean.bio,
        logoUrl,
        bannerUrl,
        ...(clean.websiteUrl ? { websiteUrl: clean.websiteUrl } : {}),
        ...(clean.location ? { location: clean.location } : {}),
        currency: clean.currency,
        ownerUid: input.ownerUid,
        status: 'ACTIVE',
        verified: false,
        followersCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(handleRef, {
        slug: clean.slug,
        businessProfileId: bpId,
        ownerUid: input.ownerUid,
        isAlias: false,
        createdAt: serverTimestamp(),
      });

      tx.set(membershipRef, {
        id: membershipId,
        businessProfileId: bpId,
        uid: input.ownerUid,
        role: 'OWNER',
        status: 'ACTIVE',
        invitedByUid: input.ownerUid,
        ...(input.ownerDisplayName ? { displayName: input.ownerDisplayName.slice(0, 60) } : {}),
        ...(input.ownerHandle ? { handle: input.ownerHandle.slice(0, 32) } : {}),
        ...(input.ownerAvatarUrl ? { avatarUrl: input.ownerAvatarUrl.slice(0, 250000) } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    const now = Date.now();
    return {
      id: bpId,
      slug: clean.slug,
      displayName: clean.displayName,
      category: clean.category,
      bio: clean.bio,
      logoUrl,
      bannerUrl,
      ...(clean.websiteUrl ? { websiteUrl: clean.websiteUrl } : {}),
      ...(clean.location ? { location: clean.location } : {}),
      currency: clean.currency,
      ownerUid: input.ownerUid,
      status: 'ACTIVE',
      verified: false,
      followersCount: 0,
      createdAtMs: now,
      updatedAtMs: now,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('already taken')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.CREATE, `businessProfiles/${bpId}`);
  }
}

export async function updateBusinessProfile(
  bpId: string,
  previousSlug: string,
  updates: {
    displayName: string;
    slug: string;
    category: string;
    bio?: string;
    logoUrl?: string;
    bannerUrl?: string;
    websiteUrl?: string;
    location?: string;
    currency?: string;
    ownerUid: string;
  }
): Promise<void> {
  const validation = validateBusinessProfileInput(updates);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid Business Profile updates.');
  }
  const clean = validation.clean;
  const bpRef = doc(db, 'businessProfiles', bpId);
  const logoUrl = (updates.logoUrl || '').trim().slice(0, 250000);
  const bannerUrl = (updates.bannerUrl || '').trim().slice(0, 250000);

  try {
    if (clean.slug !== previousSlug) {
      const nextHandleRef = doc(db, 'businessHandles', clean.slug);
      const prevHandleRef = previousSlug ? doc(db, 'businessHandles', previousSlug) : null;
      await runTransaction(db, async (tx) => {
        const nextHandleSnap = await tx.get(nextHandleRef);
        const prevHandleSnap = prevHandleRef ? await tx.get(prevHandleRef) : null;

        if (nextHandleSnap.exists()) {
          if (nextHandleSnap.data()?.businessProfileId !== bpId) {
            throw new Error(`The business handle "@${clean.slug}" is already taken.`);
          }
          tx.update(nextHandleRef, {
            isAlias: false,
            targetSlug: clean.slug,
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.set(nextHandleRef, {
            slug: clean.slug,
            businessProfileId: bpId,
            ownerUid: updates.ownerUid,
            isAlias: false,
            createdAt: serverTimestamp(),
          });
        }

        if (
          prevHandleRef &&
          prevHandleSnap &&
          prevHandleSnap.exists() &&
          prevHandleSnap.data()?.businessProfileId === bpId
        ) {
          tx.update(prevHandleRef, {
            isAlias: true,
            targetSlug: clean.slug,
            updatedAt: serverTimestamp(),
          });
        }

        tx.update(bpRef, {
          slug: clean.slug,
          displayName: clean.displayName,
          category: clean.category,
          bio: clean.bio,
          logoUrl,
          bannerUrl,
          websiteUrl: clean.websiteUrl || '',
          location: clean.location || '',
          currency: clean.currency,
          updatedAt: serverTimestamp(),
        });
      });
    } else {
      await updateDoc(bpRef, {
        displayName: clean.displayName,
        category: clean.category,
        bio: clean.bio,
        logoUrl,
        bannerUrl,
        websiteUrl: clean.websiteUrl || '',
        location: clean.location || '',
        currency: clean.currency,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('already taken')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, `businessProfiles/${bpId}`);
  }
}

export async function getBusinessProfileById(bpId: string): Promise<BusinessProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'businessProfiles', bpId));
    if (!snap.exists()) return null;
    return mapBusinessProfile(snap.id, snap.data());
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `businessProfiles/${bpId}`);
  }
}

export async function getBusinessProfileBySlug(slug: string): Promise<BusinessProfile | null> {
  const clean = normalizeBusinessSlug(slug);
  if (!clean) return null;
  try {
    const handleSnap = await getDoc(doc(db, 'businessHandles', clean));
    if (handleSnap.exists()) {
      const data = handleSnap.data();
      const bpId = String(data?.businessProfileId || '');
      if (bpId) {
        return getBusinessProfileById(bpId);
      }
      const targetSlug = typeof data?.targetSlug === 'string' ? normalizeBusinessSlug(data.targetSlug) : '';
      if (targetSlug && targetSlug !== clean) {
        return getBusinessProfileBySlug(targetSlug);
      }
    }
    const q = query(
      collection(db, 'businessProfiles'),
      where('slug', '==', clean),
      where('status', '==', 'ACTIVE')
    );
    const listSnap = await getDocs(q);
    if (listSnap.empty) return null;
    const first = listSnap.docs[0];
    return mapBusinessProfile(first.id, first.data());
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `businessHandles/${clean}`);
  }
}

export async function fetchActiveBusinessProfilesForOwner(
  ownerUid: string
): Promise<BusinessProfile[]> {
  const cleanUid = (ownerUid || '').trim();
  if (!cleanUid) return [];
  try {
    const q = query(
      collection(db, 'businessProfiles'),
      where('ownerUid', '==', cleanUid),
      where('status', '==', 'ACTIVE')
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => mapBusinessProfile(d.id, d.data()))
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `businessProfiles?ownerUid=${cleanUid}`);
  }
}

export function subscribeUserBusinessMemberships(
  uid: string,
  onChange: (memberships: BusinessMembership[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'businessMemberships'),
    where('uid', '==', uid),
    where('status', '==', 'ACTIVE')
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => mapBusinessMembership(d.id, d.data()))
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      onChange(items);
    },
    (err) => {
      console.warn('Unable to subscribe to businessMemberships:', err);
      onChange([]);
    }
  );
}

export function subscribeBusinessProfilesByIds(
  ids: string[],
  onChange: (profiles: BusinessProfile[]) => void
): Unsubscribe {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    onChange([]);
    return () => {};
  }

  const profileMap = new Map<string, BusinessProfile>();
  const emit = () => {
    onChange(
      uniqueIds
        .map((id) => profileMap.get(id))
        .filter((p): p is BusinessProfile => Boolean(p))
    );
  };

  const unsubs = uniqueIds.map((bpId) =>
    onSnapshot(
      doc(db, 'businessProfiles', bpId),
      (snap) => {
        if (snap.exists()) {
          profileMap.set(bpId, mapBusinessProfile(snap.id, snap.data()));
        } else {
          profileMap.delete(bpId);
        }
        emit();
      },
      (err) => {
        console.warn(`Unable to subscribe businessProfiles/${bpId}:`, err);
      }
    )
  );

  return () => {
    for (const u of unsubs) u();
  };
}

export function subscribeIsFollowingBusinessProfile(
  bpId: string,
  followerUid: string,
  onChange: (isFollowing: boolean) => void
): Unsubscribe {
  if (!bpId || !followerUid) {
    onChange(false);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'businessProfiles', bpId, 'followers', followerUid),
    (snap) => onChange(snap.exists()),
    () => onChange(false)
  );
}

export async function toggleFollowBusinessProfile(params: {
  bpId: string;
  followerUid: string;
  actorName: string;
  actorAvatar: string;
  currentlyFollowing: boolean;
}): Promise<boolean> {
  const { bpId, followerUid, actorName, actorAvatar, currentlyFollowing } = params;
  const bpRef = doc(db, 'businessProfiles', bpId);
  const followerRef = doc(db, 'businessProfiles', bpId, 'followers', followerUid);

  try {
    await runTransaction(db, async (tx) => {
      const bpSnap = await tx.get(bpRef);
      if (!bpSnap.exists()) throw new Error('Business profile not found.');
      const followerSnap = await tx.get(followerRef);
      const count = Number(bpSnap.data()?.followersCount || 0);

      if (currentlyFollowing || followerSnap.exists()) {
        tx.delete(followerRef);
        tx.update(bpRef, {
          followersCount: Math.max(0, count - 1),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(followerRef, {
          followerUid,
          businessProfileId: bpId,
          createdAt: serverTimestamp(),
        });
        tx.update(bpRef, {
          followersCount: count + 1,
          updatedAt: serverTimestamp(),
        });
      }
    });

    if (!currentlyFollowing) {
      await emitBusinessNotification({
        bpId,
        actorId: followerUid,
        actorName: actorName || 'Looma Member',
        actorAvatar: actorAvatar || '',
        type: 'follow',
        title: `${actorName || 'Someone'} started following your business`,
        body: 'New follower on your public Business Profile.',
        targetId: bpId,
      }).catch(() => {});
    }

    return !currentlyFollowing;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `businessProfiles/${bpId}/followers/${followerUid}`);
  }
}

export async function emitBusinessNotification(params: {
  bpId: string;
  actorId: string;
  actorName: string;
  actorAvatar: string;
  type: BusinessNotificationType;
  title: string;
  body: string;
  targetId: string;
}): Promise<void> {
  const notifId = makeId('bnotif');
  const ref = doc(db, 'businessProfiles', params.bpId, 'notifications', notifId);
  await setDoc(ref, {
    id: notifId,
    businessProfileId: params.bpId,
    actorId: params.actorId,
    actorName: params.actorName.slice(0, 80) || 'Looma Member',
    actorAvatar: (params.actorAvatar || '').slice(0, 250000),
    type: params.type,
    title: params.title.slice(0, 120),
    body: params.body.slice(0, 240),
    targetId: params.targetId.slice(0, 128),
    read: false,
    createdAt: serverTimestamp(),
  });
}

export function subscribeBusinessNotifications(
  bpId: string,
  onChange: (items: BusinessNotification[]) => void
): Unsubscribe {
  if (!bpId) {
    onChange([]);
    return () => {};
  }
  const q = collection(db, 'businessProfiles', bpId, 'notifications');
  return onSnapshot(
    q,
    (snap) => {
      const list: BusinessNotification[] = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: String(d.id || docSnap.id),
            businessProfileId: String(d.businessProfileId || bpId),
            actorId: String(d.actorId || ''),
            actorName: String(d.actorName || 'Member'),
            actorAvatar: String(d.actorAvatar || ''),
            type: (d.type || 'system') as BusinessNotificationType,
            title: String(d.title || ''),
            body: String(d.body || ''),
            targetId: String(d.targetId || ''),
            read: Boolean(d.read),
            createdAtMs: timestampToMs(d.createdAt),
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onChange(list);
    },
    () => onChange([])
  );
}

export async function markBusinessNotificationRead(bpId: string, notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'businessProfiles', bpId, 'notifications', notificationId), {
      read: true,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `businessProfiles/${bpId}/notifications/${notificationId}`);
  }
}

export async function markAllBusinessNotificationsRead(
  bpId: string,
  notificationIds: string[]
): Promise<void> {
  if (notificationIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const id of notificationIds) {
      batch.update(doc(db, 'businessProfiles', bpId, 'notifications', id), { read: true });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `businessProfiles/${bpId}/notifications`);
  }
}

export function subscribeBusinessMembers(
  bpId: string,
  onChange: (members: BusinessMembership[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'businessMemberships'),
    where('businessProfileId', '==', bpId)
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((d) => mapBusinessMembership(d.id, d.data()))
          .sort((a, b) => a.createdAtMs - b.createdAtMs)
      );
    },
    () => onChange([])
  );
}

export function subscribeBusinessInvitesForBusiness(
  bpId: string,
  onChange: (invites: BusinessInvite[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'businessInvites'),
    where('businessProfileId', '==', bpId)
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((d) => mapBusinessInvite(d.id, d.data()))
          .sort((a, b) => b.createdAtMs - a.createdAtMs)
      );
    },
    () => onChange([])
  );
}

export function subscribePendingInvitesForEmail(
  email: string,
  onChange: (invites: BusinessInvite[]) => void
): Unsubscribe {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) {
    onChange([]);
    return () => {};
  }
  const q = query(
    collection(db, 'businessInvites'),
    where('email', '==', cleanEmail),
    where('status', '==', 'PENDING')
  );
  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      onChange(
        snap.docs
          .map((d) => mapBusinessInvite(d.id, d.data()))
          .filter((inv) => inv.expiresAtMs > now)
      );
    },
    () => onChange([])
  );
}

export async function createBusinessInvite(params: {
  businessProfileId: string;
  businessName: string;
  email: string;
  role: Exclude<BusinessMembershipRole, 'OWNER'>;
  invitedByUid: string;
}): Promise<BusinessInvite> {
  const cleanEmail = params.email.trim().toLowerCase();
  if (!cleanEmail.includes('@')) {
    throw new Error('Enter a valid email address to send an invitation.');
  }
  const inviteId = makeId('binv');
  const rawToken = makeId('tok');
  const expiresAtMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = {
    id: inviteId,
    businessProfileId: params.businessProfileId,
    businessName: params.businessName.slice(0, 80),
    email: cleanEmail.slice(0, 200),
    role: params.role,
    tokenHash: rawToken,
    status: 'PENDING',
    invitedByUid: params.invitedByUid,
    createdAt: serverTimestamp(),
    expiresAtMs,
  };
  try {
    await setDoc(doc(db, 'businessInvites', inviteId), payload);
    return {
      ...payload,
      status: 'PENDING',
      createdAtMs: Date.now(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `businessInvites/${inviteId}`);
  }
}

export async function acceptBusinessInvite(params: {
  invite: BusinessInvite;
  uid: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
}): Promise<void> {
  const { invite, uid, displayName, handle, avatarUrl } = params;
  const membershipId = `${invite.businessProfileId}_${uid}`;
  const membershipRef = doc(db, 'businessMemberships', membershipId);
  const inviteRef = doc(db, 'businessInvites', invite.id);
  try {
    await setDoc(membershipRef, {
      id: membershipId,
      businessProfileId: invite.businessProfileId,
      uid,
      role: invite.role,
      status: 'ACTIVE',
      invitedByUid: invite.invitedByUid,
      inviteId: invite.id,
      displayName: displayName.slice(0, 60),
      handle: handle.slice(0, 32),
      avatarUrl: (avatarUrl || '').slice(0, 250000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(inviteRef, { status: 'ACCEPTED' });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `businessMemberships/${membershipId}`);
  }
}

export async function revokeBusinessInvite(inviteId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'businessInvites', inviteId), { status: 'REVOKED' });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `businessInvites/${inviteId}`);
  }
}

export async function updateBusinessMemberRole(
  membership: BusinessMembership,
  nextRole: Exclude<BusinessMembershipRole, 'OWNER'>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'businessMemberships', membership.id), {
      role: nextRole,
      updatedAt: serverTimestamp(),
    });
    const token = await getVerifiedIdToken().catch(() => '');
    if (token) {
      await fetch('/api/commerce/sso/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          businessProfileId: membership.businessProfileId,
          firebaseUid: membership.uid,
          nextRole,
        }),
      }).catch(() => {});
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `businessMemberships/${membership.id}`);
  }
}

export async function removeBusinessMember(
  membershipId: string,
  meta?: { businessProfileId: string; uid: string }
): Promise<void> {
  try {
    let businessProfileId = meta?.businessProfileId || '';
    let uid = meta?.uid || '';
    if (!businessProfileId || !uid) {
      const snap = await getDoc(doc(db, 'businessMemberships', membershipId)).catch(() => null);
      if (snap?.exists()) {
        businessProfileId = String(snap.data()?.businessProfileId || '');
        uid = String(snap.data()?.uid || '');
      }
    }
    await deleteDoc(doc(db, 'businessMemberships', membershipId));
    if (businessProfileId && uid) {
      const token = await getVerifiedIdToken().catch(() => '');
      if (token) {
        await fetch('/api/commerce/sso/revoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            businessProfileId,
            firebaseUid: uid,
            removeMember: true,
          }),
        }).catch(() => {});
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `businessMemberships/${membershipId}`);
  }
}

async function getVerifiedIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in with your verified Looma account to continue.');
  }
  return user.getIdToken();
}

export async function provisionCommerceStoreForBusiness(
  businessProfileId: string
): Promise<{ storeId: string; storeSlug: string }> {
  const token = await getVerifiedIdToken();
  const res = await fetch(`/api/business-profiles/${encodeURIComponent(businessProfileId)}/provision-store`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const data = (await res.json().catch(() => ({}))) as {
    storeId?: string;
    storeSlug?: string;
    error?: string;
  };
  if (!res.ok || !data.storeId) {
    throw new Error(data.error || 'Unable to provision merchant store.');
  }
  return {
    storeId: data.storeId,
    storeSlug: data.storeSlug || '',
  };
}

export async function launchCommerceDashboardSso(businessProfileId: string): Promise<void> {
  const token = await getVerifiedIdToken();
  const res = await fetch('/api/commerce/sso/authorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ businessProfileId }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    redirectUrl?: string;
    error?: string;
  };
  if (!res.ok || !data.redirectUrl) {
    throw new Error(data.error || 'Unable to authorize Commerce Portal session.');
  }
  window.location.assign(data.redirectUrl);
}

export function subscribeAllActiveBusinessProfiles(
  onChange: (profiles: BusinessProfile[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'businessProfiles'),
    where('status', '==', 'ACTIVE')
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((d) => mapBusinessProfile(d.id, d.data()))
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      );
    },
    (err) => {
      console.warn('Unable to subscribe to active businessProfiles:', err);
      onChange([]);
    }
  );
}

const DEFAULT_MESSAGING_SETTINGS = (bpId: string): BusinessMessagingSettings => ({
  businessProfileId: bpId,
  welcomeEnabled: false,
  welcomeMessage: 'Thanks for contacting us. Share your question and our team will respond shortly.',
  awayEnabled: false,
  awayMessage: 'Our team is currently away. We have received your message and will reply soon.',
  quickReplies: [],
  updatedByUid: '',
  updatedAtMs: Date.now(),
});

function mapMessagingSettings(bpId: string, d: Record<string, unknown>): BusinessMessagingSettings {
  const rawReplies = Array.isArray(d.quickReplies) ? d.quickReplies : [];
  const quickReplies: QuickReplyItem[] = rawReplies
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, index) => ({
      id: String(item.id || `qr_${index}`),
      label: String(item.label || 'Reply').slice(0, 60),
      text: String(item.text || '').slice(0, 500),
    }))
    .filter((item) => item.text.length > 0);
  return {
    businessProfileId: String(d.businessProfileId || bpId),
    welcomeEnabled: Boolean(d.welcomeEnabled),
    welcomeMessage: String(d.welcomeMessage || ''),
    awayEnabled: Boolean(d.awayEnabled),
    awayMessage: String(d.awayMessage || ''),
    quickReplies,
    updatedByUid: String(d.updatedByUid || ''),
    updatedAtMs: timestampToMs(d.updatedAt),
  };
}

export function subscribeBusinessMessagingSettings(
  bpId: string,
  onChange: (settings: BusinessMessagingSettings) => void
): Unsubscribe {
  if (!bpId) {
    onChange(DEFAULT_MESSAGING_SETTINGS(''));
    return () => {};
  }
  return onSnapshot(
    doc(db, 'businessProfiles', bpId, 'messagingSettings', 'config'),
    (snap) => {
      if (!snap.exists()) {
        onChange(DEFAULT_MESSAGING_SETTINGS(bpId));
        return;
      }
      onChange(mapMessagingSettings(bpId, snap.data()));
    },
    () => onChange(DEFAULT_MESSAGING_SETTINGS(bpId))
  );
}

export async function getBusinessMessagingSettings(bpId: string): Promise<BusinessMessagingSettings> {
  if (!bpId) return DEFAULT_MESSAGING_SETTINGS('');
  try {
    const snap = await getDoc(doc(db, 'businessProfiles', bpId, 'messagingSettings', 'config'));
    if (!snap.exists()) return DEFAULT_MESSAGING_SETTINGS(bpId);
    return mapMessagingSettings(bpId, snap.data());
  } catch {
    return DEFAULT_MESSAGING_SETTINGS(bpId);
  }
}

export async function saveBusinessMessagingSettings(
  bpId: string,
  uid: string,
  input: {
    welcomeEnabled: boolean;
    welcomeMessage: string;
    awayEnabled: boolean;
    awayMessage: string;
    quickReplies: QuickReplyItem[];
  }
): Promise<void> {
  const cleanReplies = input.quickReplies
    .filter((item) => item.label.trim() && item.text.trim())
    .slice(0, 20)
    .map((item) => ({
      id: item.id || makeId('qr'),
      label: item.label.trim().slice(0, 60),
      text: item.text.trim().slice(0, 500),
    }));
  try {
    await setDoc(doc(db, 'businessProfiles', bpId, 'messagingSettings', 'config'), {
      businessProfileId: bpId,
      welcomeEnabled: Boolean(input.welcomeEnabled),
      welcomeMessage: input.welcomeMessage.trim().slice(0, 500),
      awayEnabled: Boolean(input.awayEnabled),
      awayMessage: input.awayMessage.trim().slice(0, 500),
      quickReplies: cleanReplies,
      updatedByUid: uid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `businessProfiles/${bpId}/messagingSettings/config`);
  }
}

export function subscribeBusinessVerificationRequests(
  bpId: string,
  uid: string,
  onChange: (requests: VerificationRequest[]) => void
): Unsubscribe {
  if (!bpId || !uid) {
    onChange([]);
    return () => {};
  }
  const q = query(
    collection(db, 'verificationRequests'),
    where('uid', '==', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          const targetType = d.targetType === 'business' ? 'business' : 'personal';
          const statusRaw = String(d.status || 'pending');
          const status =
            statusRaw === 'under_review' ||
            statusRaw === 'approved' ||
            statusRaw === 'rejected' ||
            statusRaw === 'more_info_required'
              ? statusRaw
              : 'pending';
          return {
            id: String(d.id || docSnap.id),
            uid: String(d.uid || ''),
            targetType,
            ...(typeof d.businessProfileId === 'string' && d.businessProfileId
              ? { businessProfileId: d.businessProfileId }
              : {}),
            displayName: String(d.displayName || ''),
            handle: String(d.handle || ''),
            avatarUrl: String(d.avatarUrl || ''),
            reason: String(d.reason || ''),
            links: Array.isArray(d.links) ? d.links.map(String) : [],
            ...(Array.isArray(d.documentUrls) ? { documentUrls: d.documentUrls.map(String) } : {}),
            status,
            reviewerUid: String(d.reviewerUid || ''),
            reviewerNote: String(d.reviewerNote || ''),
            createdAtMs: timestampToMs(d.createdAt),
            updatedAtMs: timestampToMs(d.updatedAt),
          } satisfies VerificationRequest;
        })
        .filter((req) => req.targetType === 'business' && req.businessProfileId === bpId)
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onChange(list);
    },
    () => onChange([])
  );
}

