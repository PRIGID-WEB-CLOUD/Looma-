import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import type { UserProfile } from '../types/social';
import type {
  ActiveIdentity,
  BusinessInvite,
  BusinessMembership,
  BusinessMembershipRole,
  BusinessNotification,
  BusinessProfile,
  BusinessWorkspaceSection,
  PlatformMode,
} from '../types/business';
import {
  markAllBusinessNotificationsRead as markAllBusinessNotificationsReadService,
  markBusinessNotificationRead as markBusinessNotificationReadService,
  subscribeBusinessNotifications,
  subscribeBusinessProfilesByIds,
  subscribePendingInvitesForEmail,
  subscribeUserBusinessMemberships,
} from '../services/businessProfiles';

import { buildScopedCacheKey } from '../utils/cacheIsolation';

export { buildScopedCacheKey };

const STORAGE_KEY_PREF = 'looma_active_business_id_pref_v1';

export interface ActiveIdentityContextValue {
  platformMode: PlatformMode;
  activeProfileId: string;
  activeIdentity: ActiveIdentity;
  memberships: BusinessMembership[];
  businesses: BusinessProfile[];
  pendingInvites: BusinessInvite[];
  activeBusinessProfile: BusinessProfile | null;
  activeBusinessMembership: BusinessMembership | null;
  activeMembershipRole: BusinessMembershipRole | null;
  canManageActiveBusiness: boolean;
  canAdminActiveBusiness: boolean;
  businessNotifications: BusinessNotification[];
  unreadBusinessNotifications: number;
  businessSection: BusinessWorkspaceSection;
  setBusinessSection: (section: BusinessWorkspaceSection) => void;
  isTransitioning: boolean;
  switchEpoch: number;
  getScopedCacheKey: (namespace: string, key: string) => string;
  markBusinessNotificationRead: (notificationId: string) => Promise<void>;
  markAllBusinessNotificationsRead: () => Promise<void>;
  switchToNormal: () => void;
  switchToPersonal: () => void;
  switchToBusiness: (businessProfileId: string, initialSection?: BusinessWorkspaceSection) => void;
  switchProfile: (profileId: string) => void;
}

const ActiveIdentityContext = createContext<ActiveIdentityContextValue | null>(null);

export function ActiveIdentityProvider({
  profile,
  firebaseUser,
  isLocalAutostart,
  children,
}: {
  profile: UserProfile;
  firebaseUser: User | null;
  isLocalAutostart: boolean;
  children: ReactNode;
}) {
  const [memberships, setMemberships] = useState<BusinessMembership[]>([]);
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [pendingInvites, setPendingInvites] = useState<BusinessInvite[]>([]);
  const [businessNotifications, setBusinessNotifications] = useState<BusinessNotification[]>([]);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [switchEpoch, setSwitchEpoch] = useState<number>(0);
  const [businessSection, setBusinessSection] = useState<BusinessWorkspaceSection>('dashboard');

  const transitionTimerRef = useRef<number | null>(null);

  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY_PREF);
      return saved ? saved : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser || isLocalAutostart || !firebaseUser.emailVerified) {
      setMemberships([]);
      setBusinesses([]);
      setPendingInvites([]);
      return;
    }

    const unsubMemberships = subscribeUserBusinessMemberships(firebaseUser.uid, setMemberships);
    const unsubInvites = firebaseUser.email
      ? subscribePendingInvitesForEmail(firebaseUser.email, setPendingInvites)
      : () => {};

    return () => {
      unsubMemberships();
      unsubInvites();
    };
  }, [firebaseUser, isLocalAutostart]);

  const membershipBpIds = useMemo(
    () => memberships.map((m) => m.businessProfileId),
    [memberships]
  );

  useEffect(() => {
    if (membershipBpIds.length === 0) {
      setBusinesses([]);
      return;
    }
    return subscribeBusinessProfilesByIds(membershipBpIds, setBusinesses);
  }, [membershipBpIds]);

  const activeBusinessMembership = useMemo(() => {
    if (!selectedBusinessId) return null;
    return (
      memberships.find(
        (m) => m.businessProfileId === selectedBusinessId && m.status === 'ACTIVE'
      ) || null
    );
  }, [memberships, selectedBusinessId]);

  const activeBusinessProfile = useMemo(() => {
    if (!activeBusinessMembership) return null;
    return (
      businesses.find((b) => b.id === activeBusinessMembership.businessProfileId) || null
    );
  }, [activeBusinessMembership, businesses]);

  const activeMembershipRole: BusinessMembershipRole | null = useMemo(
    () => activeBusinessMembership?.role || null,
    [activeBusinessMembership]
  );

  const canManageActiveBusiness: boolean = useMemo(() => {
    if (!activeBusinessMembership) return false;
    const role = activeBusinessMembership.role;
    return role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR';
  }, [activeBusinessMembership]);

  const canAdminActiveBusiness: boolean = useMemo(() => {
    if (!activeBusinessMembership) return false;
    const role = activeBusinessMembership.role;
    return role === 'OWNER' || role === 'ADMIN';
  }, [activeBusinessMembership]);

  const platformMode: PlatformMode = useMemo(() => {
    return activeBusinessProfile && activeBusinessMembership ? 'business' : 'normal';
  }, [activeBusinessMembership, activeBusinessProfile]);

  const activeProfileId: string = useMemo(() => {
    return activeBusinessProfile ? activeBusinessProfile.id : profile.uid;
  }, [activeBusinessProfile, profile.uid]);

  useEffect(() => {
    if (!activeBusinessProfile || !firebaseUser || isLocalAutostart) {
      setBusinessNotifications([]);
      return;
    }
    return subscribeBusinessNotifications(activeBusinessProfile.id, setBusinessNotifications);
  }, [activeBusinessProfile, firebaseUser, isLocalAutostart]);

  const triggerTransition = useCallback(() => {
    setSwitchEpoch((prev) => prev + 1);
    setIsTransitioning(true);
    if (transitionTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(transitionTimerRef.current);
    }
    if (typeof window !== 'undefined') {
      transitionTimerRef.current = window.setTimeout(() => {
        transitionTimerRef.current = null;
        setIsTransitioning(false);
      }, 280);
    } else {
      setIsTransitioning(false);
    }
  }, []);

  const switchToPersonal = useCallback(() => {
    triggerTransition();
    setBusinessNotifications([]);
    setBusinessSection('dashboard');
    setSelectedBusinessId(null);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY_PREF);
      } catch {
        // Ignore storage error
      }
    }
  }, [triggerTransition]);

  const switchToNormal = switchToPersonal;

  const switchToBusiness = useCallback(
    (businessProfileId: string, initialSection: BusinessWorkspaceSection = 'dashboard') => {
      triggerTransition();
      setBusinessNotifications([]);
      setBusinessSection(initialSection);
      setSelectedBusinessId(businessProfileId);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY_PREF, businessProfileId);
        } catch {
          // Ignore storage error
        }
      }
    },
    [triggerTransition]
  );

  const switchProfile = useCallback(
    (profileId: string) => {
      if (!profileId || profileId === profile.uid) {
        switchToPersonal();
      } else {
        switchToBusiness(profileId);
      }
    },
    [profile.uid, switchToBusiness, switchToPersonal]
  );

  const getScopedCacheKey = useCallback(
    (namespace: string, key: string) =>
      buildScopedCacheKey(platformMode, activeProfileId, namespace, key),
    [activeProfileId, platformMode]
  );

  const markBusinessNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!activeBusinessProfile) return;
      await markBusinessNotificationReadService(activeBusinessProfile.id, notificationId);
    },
    [activeBusinessProfile]
  );

  const markAllBusinessNotificationsRead = useCallback(async () => {
    if (!activeBusinessProfile) return;
    const unreadIds = businessNotifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await markAllBusinessNotificationsReadService(activeBusinessProfile.id, unreadIds);
  }, [activeBusinessProfile, businessNotifications]);

  const activeIdentity: ActiveIdentity = useMemo(() => {
    if (activeBusinessProfile && activeBusinessMembership) {
      return {
        type: 'business',
        uid: profile.uid,
        businessProfileId: activeBusinessProfile.id,
        businessProfile: activeBusinessProfile,
        role: activeBusinessMembership.role,
      };
    }
    return {
      type: 'personal',
      uid: profile.uid,
      displayName: profile.displayName,
      handle: profile.handle,
      avatarUrl: profile.avatarUrl,
      isVerified: profile.isVerified,
    };
  }, [
    activeBusinessMembership,
    activeBusinessProfile,
    profile.avatarUrl,
    profile.displayName,
    profile.handle,
    profile.isVerified,
    profile.uid,
  ]);

  const unreadBusinessNotifications = useMemo(
    () => businessNotifications.filter((n) => !n.read).length,
    [businessNotifications]
  );

  const value = useMemo<ActiveIdentityContextValue>(
    () => ({
      platformMode,
      activeProfileId,
      activeIdentity,
      memberships,
      businesses,
      pendingInvites,
      activeBusinessProfile,
      activeBusinessMembership,
      activeMembershipRole,
      canManageActiveBusiness,
      canAdminActiveBusiness,
      businessNotifications,
      unreadBusinessNotifications,
      businessSection,
      setBusinessSection,
      isTransitioning,
      switchEpoch,
      getScopedCacheKey,
      markBusinessNotificationRead,
      markAllBusinessNotificationsRead,
      switchToNormal,
      switchToPersonal,
      switchToBusiness,
      switchProfile,
    }),
    [
      activeBusinessMembership,
      activeBusinessProfile,
      activeIdentity,
      activeMembershipRole,
      activeProfileId,
      businessNotifications,
      businessSection,
      businesses,
      canAdminActiveBusiness,
      canManageActiveBusiness,
      getScopedCacheKey,
      isTransitioning,
      markAllBusinessNotificationsRead,
      markBusinessNotificationRead,
      memberships,
      pendingInvites,
      platformMode,
      switchEpoch,
      switchProfile,
      switchToBusiness,
      switchToNormal,
      switchToPersonal,
      unreadBusinessNotifications,
    ]
  );

  return (
    <ActiveIdentityContext.Provider value={value}>
      {children}
    </ActiveIdentityContext.Provider>
  );
}

export function useActiveIdentity(): ActiveIdentityContextValue {
  const ctx = useContext(ActiveIdentityContext);
  if (!ctx) {
    throw new Error('useActiveIdentity must be used within ActiveIdentityProvider.');
  }
  return ctx;
}
