export type PlatformMode = 'normal' | 'business';
export type BusinessMembershipRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
export type BusinessProfileStatus = 'ACTIVE' | 'SUSPENDED';
export type BusinessMembershipStatus = 'ACTIVE' | 'INVITED' | 'REVOKED';
export type BusinessInviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface BusinessProfile {
  id: string;
  slug: string;
  displayName: string;
  category: string;
  bio: string;
  logoUrl: string;
  bannerUrl: string;
  websiteUrl?: string;
  location?: string;
  currency: string;
  ownerUid: string;
  commerceStoreId?: string;
  commerceStoreSlug?: string;
  status: BusinessProfileStatus;
  verified: boolean;
  followersCount: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface BusinessHandle {
  slug: string;
  businessProfileId: string;
  ownerUid: string;
  createdAtMs: number;
}

export interface BusinessMembership {
  id: string;
  businessProfileId: string;
  uid: string;
  role: BusinessMembershipRole;
  status: BusinessMembershipStatus;
  invitedByUid: string;
  inviteId?: string;
  displayName?: string;
  handle?: string;
  avatarUrl?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface BusinessInvite {
  id: string;
  businessProfileId: string;
  businessName: string;
  email: string;
  role: Exclude<BusinessMembershipRole, 'OWNER'>;
  tokenHash: string;
  status: BusinessInviteStatus;
  invitedByUid: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface BusinessFollower {
  followerUid: string;
  businessProfileId: string;
  createdAtMs: number;
}

export type BusinessNotificationType =
  | 'order'
  | 'payment'
  | 'follow'
  | 'comment'
  | 'like'
  | 'mention'
  | 'team'
  | 'system';

export interface BusinessNotification {
  id: string;
  businessProfileId: string;
  actorId: string;
  actorName: string;
  actorAvatar: string;
  type: BusinessNotificationType;
  title: string;
  body: string;
  targetId: string;
  read: boolean;
  createdAtMs: number;
}

export type ActiveIdentity =
  | {
      type: 'personal';
      uid: string;
      displayName: string;
      handle: string;
      avatarUrl: string;
      isVerified?: boolean;
    }
  | {
      type: 'business';
      uid: string;
      businessProfileId: string;
      businessProfile: BusinessProfile;
      role: BusinessMembershipRole;
    };
