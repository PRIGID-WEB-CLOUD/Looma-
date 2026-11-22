import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Building2,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import type {
  BusinessInvite,
  BusinessMembership,
  BusinessMembershipRole,
  BusinessProfile,
} from '../types/business';
import type {
  ChatThread,
  Post,
  PostCategory,
  PostComment,
  ThemeMode,
  UserProfile,
  VerificationRequest,
  VerificationRequestStatus,
} from '../types/social';
import type { MarketplaceProduct } from '../types/marketplace';
import {
  createBusinessInvite,
  getBusinessProfileBySlug,
  launchCommerceDashboardSso,
  provisionCommerceStoreForBusiness,
  removeBusinessMember,
  revokeBusinessInvite,
  subscribeBusinessInvitesForBusiness,
  subscribeBusinessMembers,
  subscribeBusinessVerificationRequests,
  subscribeIsFollowingBusinessProfile,
  toggleFollowBusinessProfile,
  updateBusinessMemberRole,
} from '../services/businessProfiles';
import { formatCurrencyCents } from '../services/marketplaceCatalogAssets';
import { Avatar } from './Avatar';
import { PostCard } from './PostCard';
import { RequestVerificationModal } from './RequestVerificationModal';
import { VerifiedBadge } from './VerifiedBadge';

function getVerificationStatusMeta(status: VerificationRequestStatus): {
  label: string;
  tone: string;
} {
  switch (status) {
    case 'approved':
      return {
        label: 'Verified',
        tone: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      };
    case 'under_review':
      return {
        label: 'Under Review',
        tone: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      };
    case 'more_info_required':
      return {
        label: 'More Info Required',
        tone: 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        tone: 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
      };
    default:
      return {
        label: 'Pending Review',
        tone: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      };
  }
}

interface BusinessProfilePageProps {
  slug: string;
  currentProfile: UserProfile;
  isAuthorized: boolean;
  memberships: BusinessMembership[];
  posts: Post[];
  commentsByPost: Record<string, PostComment[]>;
  likedPostIds: string[];
  bookmarkedPostIds: string[];
  shareThreads: ChatThread[];
  categories: string[];
  theme?: ThemeMode;
  onBack: () => void;
  onRequireAuth: () => void;
  onEditBusiness: (bp: BusinessProfile) => void;
  onCreateBusinessPost: (bp: BusinessProfile) => void;
  onMessageOwner?: (ownerUid: string, businessName: string) => void;
  onMessageBusiness?: (bp: BusinessProfile) => Promise<void> | void;
  onSubmitVerificationRequest?: (
    bp: BusinessProfile,
    reason: string,
    links: string[],
    documentUrls?: string[]
  ) => Promise<{ ok: boolean; error?: string }>;
  onResubmitVerificationRequest?: (
    requestId: string,
    reason: string,
    links: string[],
    documentUrls?: string[]
  ) => Promise<{ ok: boolean; error?: string }>;
  onOpenProduct: (productId: string) => void;
  onToggleLike: (post: Post) => void;
  onToggleBookmark: (postId: string) => void;
  onAddComment: (post: Post, text: string) => Promise<void>;
  onUpdatePost: (
    post: Post,
    updates: { caption: string; category: PostCategory }
  ) => Promise<void>;
  onDeletePost: (post: Post) => Promise<void>;
  onDeleteComment: (post: Post, commentId: string) => Promise<void>;
  onShareToStory: (post: Post) => Promise<unknown> | void;
  onShareToChat: (thread: ChatThread, post: Post) => Promise<void>;
  onMentionClick: (handle: string) => void;
  onSelectHashtag: (tag: string) => void;
  onOpenComments?: (post: Post) => void;
}

export function BusinessProfilePage({
  slug,
  currentProfile,
  isAuthorized,
  memberships,
  posts,
  commentsByPost,
  likedPostIds,
  bookmarkedPostIds,
  shareThreads,
  categories,
  theme,
  onBack,
  onRequireAuth,
  onEditBusiness,
  onCreateBusinessPost,
  onMessageOwner,
  onMessageBusiness,
  onSubmitVerificationRequest,
  onResubmitVerificationRequest,
  onOpenProduct,
  onToggleLike,
  onToggleBookmark,
  onAddComment,
  onUpdatePost,
  onDeletePost,
  onDeleteComment,
  onShareToStory,
  onShareToChat,
  onMentionClick,
  onSelectHashtag,
  onOpenComments,
}: BusinessProfilePageProps) {
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'posts' | 'shop' | 'team'>('posts');

  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<MarketplaceProduct[]>([]);
  const [members, setMembers] = useState<BusinessMembership[]>([]);
  const [invites, setInvites] = useState<BusinessInvite[]>([]);

  const [verificationHistory, setVerificationHistory] = useState<VerificationRequest[]>([]);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [resubmitTarget, setResubmitTarget] = useState<VerificationRequest | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<BusinessMembershipRole, 'OWNER'>>('EDITOR');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void getBusinessProfileBySlug(slug)
      .then((res) => {
        if (!active) return;
        setBusinessProfile(res);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Unable to load Business Profile.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const myMembership = useMemo(() => {
    if (!businessProfile) return null;
    return memberships.find((m) => m.businessProfileId === businessProfile.id) || null;
  }, [businessProfile, memberships]);

  const isOwnerOrAdmin = Boolean(
    myMembership && (myMembership.role === 'OWNER' || myMembership.role === 'ADMIN')
  );
  const canPostAsBusiness = Boolean(
    myMembership &&
      (myMembership.role === 'OWNER' ||
        myMembership.role === 'ADMIN' ||
        myMembership.role === 'EDITOR')
  );

  useEffect(() => {
    if (!businessProfile || !isAuthorized) {
      setIsFollowing(false);
      return;
    }
    return subscribeIsFollowingBusinessProfile(
      businessProfile.id,
      currentProfile.uid,
      setIsFollowing
    );
  }, [businessProfile, currentProfile.uid, isAuthorized]);

  // Subscribe to published products linked to this Business Profile
  useEffect(() => {
    if (!businessProfile) {
      setCatalogProducts([]);
      return;
    }
    const targetStoreId = businessProfile.commerceStoreId || '';
    if (!targetStoreId) {
      setCatalogProducts([]);
      return;
    }
    const q = query(
      collection(db, 'marketplaceProducts'),
      where('storeId', '==', targetStoreId),
      where('status', '==', 'ACTIVE')
    );
    return onSnapshot(
      q,
      (snap) => {
        const items: MarketplaceProduct[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: String(d.id || docSnap.id),
            storeId: String(d.storeId || targetStoreId),
            storeName: String(d.storeName || businessProfile.displayName),
            storeSlug: String(d.storeSlug || businessProfile.slug),
            ownerUid: String(d.ownerUid || businessProfile.ownerUid),
            title: String(d.title || ''),
            description: String(d.description || ''),
            category: String(d.category || ''),
            priceCents: Number(d.priceCents || 0),
            ...(typeof d.compareAtPriceCents === 'number'
              ? { compareAtPriceCents: d.compareAtPriceCents }
              : {}),
            currency: String(d.currency || businessProfile.currency || 'USD'),
            imageUrl: String(d.imageUrl || ''),
            stock: Number(d.stock || 0),
            status: 'ACTIVE',
            featured: Boolean(d.featured),
            ...(typeof d.tag === 'string' ? { tag: d.tag } : {}),
            ...(typeof d.location === 'string' ? { location: d.location } : {}),
            ...(typeof d.condition === 'string' ? { condition: d.condition as MarketplaceProduct['condition'] } : {}),
            ...(Array.isArray(d.galleryUrls) ? { galleryUrls: d.galleryUrls as string[] } : {}),
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
          };
        });
        setCatalogProducts(items);
      },
      () => setCatalogProducts([])
    );
  }, [businessProfile]);

  useEffect(() => {
    if (!businessProfile || !isOwnerOrAdmin) {
      setMembers([]);
      setInvites([]);
      return;
    }
    const unsubMembers = subscribeBusinessMembers(businessProfile.id, setMembers);
    const unsubInvites = subscribeBusinessInvitesForBusiness(businessProfile.id, setInvites);
    return () => {
      unsubMembers();
      unsubInvites();
    };
  }, [businessProfile, isOwnerOrAdmin]);

  useEffect(() => {
    if (!businessProfile || !isOwnerOrAdmin) {
      setVerificationHistory([]);
      return;
    }
    return subscribeBusinessVerificationRequests(
      businessProfile.id,
      businessProfile.ownerUid,
      setVerificationHistory
    );
  }, [businessProfile, isOwnerOrAdmin]);

  const latestVerification = verificationHistory[0] || null;
  const canRequestVerification = Boolean(
    isOwnerOrAdmin &&
      businessProfile &&
      !businessProfile.verified &&
      (!latestVerification ||
        latestVerification.status === 'rejected' ||
        latestVerification.status === 'more_info_required')
  );

  const businessPosts = useMemo(() => {
    if (!businessProfile) return [];
    return posts.filter(
      (p) =>
        (p.authorType === 'business' && p.businessProfileId === businessProfile.id) ||
        p.authorId === businessProfile.id
    );
  }, [businessProfile, posts]);

  const handleToggleFollow = async () => {
    if (!businessProfile) return;
    if (!isAuthorized) {
      onRequireAuth();
      return;
    }
    setFollowBusy(true);
    try {
      const next = await toggleFollowBusinessProfile({
        bpId: businessProfile.id,
        followerUid: currentProfile.uid,
        actorName: currentProfile.displayName,
        actorAvatar: currentProfile.avatarUrl,
        currentlyFollowing: isFollowing,
      });
      setIsFollowing(next);
      setBusinessProfile((prev) =>
        prev
          ? {
              ...prev,
              followersCount: Math.max(0, prev.followersCount + (next ? 1 : -1)),
            }
          : prev
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update follow status.');
    } finally {
      setFollowBusy(false);
    }
  };

  const handleLaunchCommerce = async () => {
    if (!businessProfile || portalBusy) return;
    setActionError(null);
    setActionStatus(null);
    setPortalBusy(true);
    try {
      if (!businessProfile.commerceStoreId) {
        const res = await provisionCommerceStoreForBusiness(businessProfile.id);
        setBusinessProfile((prev) =>
          prev ? { ...prev, commerceStoreId: res.storeId, commerceStoreSlug: res.storeSlug } : prev
        );
      }
      await launchCommerceDashboardSso(businessProfile.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to launch Seller Portal.');
      setPortalBusy(false);
    }
  };

  const handleInviteMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!businessProfile || inviteBusy) return;
    setActionError(null);
    setActionStatus(null);
    setInviteBusy(true);
    try {
      await createBusinessInvite({
        businessProfileId: businessProfile.id,
        businessName: businessProfile.displayName,
        email: inviteEmail,
        role: inviteRole,
        invitedByUid: currentProfile.uid,
      });
      setInviteEmail('');
      setActionStatus('Invitation sent cleanly. Collaborator can join from their identity switcher.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to create invite.');
    } finally {
      setInviteBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-44 rounded-3xl bg-slate-200 dark:bg-slate-800 w-full" />
        <div className="px-4 sm:px-6 space-y-3">
          <div className="w-20 h-20 rounded-2xl bg-slate-200 dark:bg-slate-800 -mt-12 border-4 border-white dark:border-slate-900" />
          <div className="h-7 w-52 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-36 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-24 w-full rounded-2xl bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (loadError || !businessProfile) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back</span>
        </button>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
          <Building2 className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <p className="text-base font-bold">Business Profile not found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {loadError || `No active business matches @${slug}.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <section aria-label={`${businessProfile.displayName} Business Profile`} className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back</span>
        </button>
      </div>

      {actionError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300"
        >
          {actionError}
        </div>
      )}
      {actionStatus && (
        <div
          role="status"
          className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-700 dark:text-emerald-300"
        >
          {actionStatus}
        </div>
      )}

      {isOwnerOrAdmin && latestVerification && (latestVerification.status === 'more_info_required' || latestVerification.status === 'rejected') && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <p className="font-bold text-amber-900 dark:text-amber-200">
              Verification Notice: {getVerificationStatusMeta(latestVerification.status).label}
            </p>
            {latestVerification.reviewerNote ? (
              <p className="text-amber-800 dark:text-amber-300">
                Admin note: {latestVerification.reviewerNote}
              </p>
            ) : (
              <p className="text-amber-800 dark:text-amber-300">
                {latestVerification.status === 'more_info_required'
                  ? 'Administrators need additional verification documents (registration, domain, or trademark proof).'
                  : 'Your previous verification request was not approved. You can submit updated documents.'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setResubmitTarget(latestVerification);
              setVerifyModalOpen(true);
            }}
            className="min-h-[36px] px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold shrink-0 cursor-pointer"
          >
            {latestVerification.status === 'more_info_required' ? 'Update & Provide Info' : 'Resubmit Request'}
          </button>
        </div>
      )}

      {/* Business Header Card */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {businessProfile.bannerUrl ? (
          <img
            src={businessProfile.bannerUrl}
            alt={`${businessProfile.displayName} banner`}
            className="w-full h-36 sm:h-48 object-cover block"
          />
        ) : (
          <div className="w-full h-24 sm:h-32 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900" />
        )}

        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="-mt-12 sm:-mt-14 rounded-2xl p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm shrink-0">
                <Avatar
                  src={businessProfile.logoUrl}
                  name={businessProfile.displayName}
                  size="xl"
                />
              </div>
              <div className="min-w-0 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                    <span>{businessProfile.displayName}</span>
                    {businessProfile.verified && <VerifiedBadge size={16} />}
                  </h1>
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[11px] font-semibold">
                    Business Profile
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  @{businessProfile.slug} · {businessProfile.category}
                </p>
                {businessProfile.bio && (
                  <p className="text-sm text-slate-700 dark:text-slate-300 mt-2.5 max-w-2xl leading-relaxed">
                    {businessProfile.bio}
                  </p>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {businessProfile.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                      {businessProfile.location}
                    </span>
                  )}
                  {businessProfile.websiteUrl && (
                    <a
                      href={businessProfile.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                      Website
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isOwnerOrAdmin ? (
                <>
                  <button
                    type="button"
                    onClick={() => onEditBusiness(businessProfile)}
                    className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Edit Profile</span>
                  </button>
                  <button
                    type="button"
                    disabled={portalBusy}
                    onClick={() => void handleLaunchCommerce()}
                    data-testid="launch-commerce-portal-btn"
                    title={
                      portalBusy
                        ? 'Authorizing...'
                        : businessProfile.commerceStoreId
                          ? 'Open Seller Portal'
                          : 'Activate Merchant Store'
                    }
                    aria-label={
                      portalBusy
                        ? 'Authorizing...'
                        : businessProfile.commerceStoreId
                          ? 'Open Seller Portal'
                          : 'Activate Merchant Store'
                    }
                    className="min-h-[40px] w-[40px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center justify-center cursor-pointer disabled:opacity-60 shrink-0"
                  >
                    <Store className="w-4 h-4" aria-hidden="true" />
                  </button>

                  {/* Verification Badge Request Button / Status Pill */}
                  {businessProfile.verified ? (
                    <span className="min-h-[40px] px-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5">
                      <VerifiedBadge size={14} />
                      <span>Verified Business</span>
                    </span>
                  ) : canRequestVerification ? (
                    <button
                      type="button"
                      onClick={() => {
                        setResubmitTarget(
                          latestVerification &&
                            (latestVerification.status === 'more_info_required' ||
                              latestVerification.status === 'rejected')
                            ? latestVerification
                            : null
                        );
                        setVerifyModalOpen(true);
                      }}
                      title={
                        latestVerification?.status === 'more_info_required'
                          ? 'Submit Additional Info'
                          : latestVerification?.status === 'rejected'
                            ? 'Resubmit Verification'
                            : 'Request Verification'
                      }
                      aria-label={
                        latestVerification?.status === 'more_info_required'
                          ? 'Submit Additional Info'
                          : latestVerification?.status === 'rejected'
                            ? 'Resubmit Verification'
                            : 'Request Verification'
                      }
                      className="min-h-[40px] w-[40px] rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 inline-flex items-center justify-center cursor-pointer shrink-0"
                    >
                      <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                    </button>
                  ) : latestVerification ? (
                    <span
                      className={`min-h-[40px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 ${
                        getVerificationStatusMeta(latestVerification.status).tone
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{getVerificationStatusMeta(latestVerification.status).label}</span>
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={followBusy}
                    onClick={() => void handleToggleFollow()}
                    className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                      isFollowing
                        ? 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Following</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Follow</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAuthorized) {
                        onRequireAuth();
                        return;
                      }
                      if (onMessageBusiness) {
                        void onMessageBusiness(businessProfile);
                        return;
                      }
                      onMessageOwner?.(businessProfile.ownerUid, businessProfile.displayName);
                    }}
                    className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Message</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-6 text-xs sm:text-sm tabular-nums">
            <div>
              <span className="font-bold text-slate-900 dark:text-white">
                {businessProfile.followersCount}
              </span>{' '}
              <span className="text-slate-500 dark:text-slate-400">Followers</span>
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-white">
                {businessPosts.length}
              </span>{' '}
              <span className="text-slate-500 dark:text-slate-400">Posts</span>
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-white">
                {catalogProducts.length}
              </span>{' '}
              <span className="text-slate-500 dark:text-slate-400">Products</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setSubTab('posts')}
            className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              subTab === 'posts'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Posts ({businessPosts.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('shop')}
            className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              subTab === 'shop'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Shop ({catalogProducts.length})</span>
          </button>
          {isOwnerOrAdmin && (
            <button
              type="button"
              onClick={() => setSubTab('team')}
              className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                subTab === 'team'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Team & Roles ({members.length})</span>
            </button>
          )}
        </div>

        {canPostAsBusiness && (
          <button
            type="button"
            onClick={() => onCreateBusinessPost(businessProfile)}
            className="min-h-[38px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Post as {businessProfile.displayName}</span>
          </button>
        )}
      </div>

      {subTab === 'posts' && (
        businessPosts.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No updates published by {businessProfile.displayName} yet.
          </div>
        ) : (
          <div className="space-y-4">
            {businessPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={currentProfile.uid}
                categories={categories}
                isLiked={likedPostIds.includes(post.id)}
                isBookmarked={bookmarkedPostIds.includes(post.id)}
                comments={commentsByPost[post.id] || []}
                shareThreads={shareThreads}
                onToggleLike={onToggleLike}
                onToggleBookmark={onToggleBookmark}
                onAddComment={onAddComment}
                onUpdatePost={canPostAsBusiness ? onUpdatePost : undefined}
                onDeletePost={canPostAsBusiness ? onDeletePost : undefined}
                onDeleteComment={onDeleteComment}
                onShareToStory={onShareToStory}
                onShareToChat={onShareToChat}
                onMentionClick={onMentionClick}
                onSelectHashtag={onSelectHashtag}
                onOpenComments={onOpenComments}
              />
            ))}
          </div>
        )
      )}

      {subTab === 'shop' && (
        catalogProducts.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
            <ShoppingBag className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
            <p className="text-sm font-semibold">No active storefront products yet</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isOwnerOrAdmin
                ? 'Launch the Seller Portal above to publish products into Looma Marketplace.'
                : `${businessProfile.displayName} has not listed public catalog items yet.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalogProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onOpenProduct(product.id)}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden text-left hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer flex flex-col"
              >
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    className="w-full h-44 object-cover block bg-slate-100 dark:bg-slate-950"
                  />
                ) : (
                  <div className="w-full h-44 bg-slate-100 dark:bg-slate-950 flex items-center justify-center text-slate-400">
                    <ShoppingBag className="w-6 h-6" aria-hidden="true" />
                  </div>
                )}
                <div className="p-4 flex-1 flex flex-col justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                      {product.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                      {product.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                      {formatCurrencyCents(product.priceCents, product.currency)}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {product.stock > 0 ? `${product.stock} in stock` : 'Sold out'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {subTab === 'team' && isOwnerOrAdmin && (
        <div className="space-y-4">
          <form
            onSubmit={handleInviteMember}
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3"
          >
            <h2 className="text-sm font-bold">Invite Team Member</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Invited users keep their own personal Looma login and gain scoped Business Profile permissions.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="flex-1 min-h-[40px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as Exclude<BusinessMembershipRole, 'OWNER'>)
                }
                className="min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ADMIN">ADMIN</option>
                <option value="EDITOR">EDITOR</option>
                <option value="VIEWER">VIEWER</option>
              </select>
              <button
                type="submit"
                disabled={inviteBusy}
                className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {inviteBusy ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </form>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            <div className="px-5 py-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Active Members ({members.length})
              </h3>
            </div>
            {members.map((member) => (
              <div key={member.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    src={member.avatarUrl || ''}
                    name={member.displayName || member.uid}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">
                      {member.displayName || member.uid}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {member.handle ? `@${member.handle}` : member.uid}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {member.role === 'OWNER' ? (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold">
                      OWNER
                    </span>
                  ) : (
                    <>
                      <select
                        value={member.role}
                        onChange={(e) =>
                          void updateBusinessMemberRole(
                            member,
                            e.target.value as Exclude<BusinessMembershipRole, 'OWNER'>
                          )
                        }
                        className="min-h-[34px] px-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="EDITOR">EDITOR</option>
                        <option value="VIEWER">VIEWER</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void removeBusinessMember(member.id)}
                        aria-label="Remove team member"
                        className="min-h-[34px] min-w-[34px] rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {invites.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              <div className="px-5 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Invitations ({invites.length})
                </h3>
              </div>
              {invites.map((inv) => (
                <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{inv.email}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Role: {inv.role} · Status: {inv.status}
                    </p>
                  </div>
                  {inv.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() => void revokeBusinessInvite(inv.id)}
                      className="min-h-[32px] px-3 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {businessProfile && (
        <RequestVerificationModal
          isOpen={verifyModalOpen}
          onClose={() => {
            setVerifyModalOpen(false);
            setResubmitTarget(null);
          }}
          theme={theme || 'light'}
          targetType="business"
          businessProfile={businessProfile}
          initialReason={resubmitTarget?.reason || ''}
          initialLinks={resubmitTarget?.links || []}
          initialDocumentUrls={resubmitTarget?.documentUrls || []}
          onSubmit={async (reason, links, documentUrls) => {
            if (
              resubmitTarget &&
              (resubmitTarget.status === 'more_info_required' || resubmitTarget.status === 'rejected') &&
              onResubmitVerificationRequest
            ) {
              return onResubmitVerificationRequest(
                resubmitTarget.id,
                reason,
                links,
                documentUrls
              );
            }
            if (onSubmitVerificationRequest) {
              return onSubmitVerificationRequest(
                businessProfile,
                reason,
                links,
                documentUrls
              );
            }
            return { ok: false, error: 'Verification handler not available.' };
          }}
        />
      )}
    </section>
  );
}
