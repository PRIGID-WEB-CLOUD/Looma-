import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Building2,
  Camera,
  Check,
  Lock,
  LogOut,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  Trash2,
  User,
} from 'lucide-react';
import type { PushPermissionState } from '../services/notifications';
import type {
  ActiveIdentity,
  BusinessMembership,
  BusinessProfile,
} from '../types/business';
import type {
  MessagePrivacy,
  ProfileVisibility,
  ThemeMode,
  UserPrivateSettings,
  UserProfile,
  VerificationRequest,
} from '../types/social';
import {
  BUSINESS_CATEGORIES,
  BUSINESS_CURRENCIES,
  normalizeBusinessSlug,
  updateBusinessProfile,
  validateBusinessProfileInput,
} from '../services/businessProfiles';
import { RequestVerificationModal } from './RequestVerificationModal';
import {
  deleteUploadedMedia,
  uploadMediaToCloudflareR2,
} from '../services/storage';
import {
  BUSINESS_ACCOUNT_CATEGORIES,
  INTEREST_OPTIONS,
  validateBusinessAccountDetails,
  validateProfileInput,
} from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';
import type { LegalDocId } from '../utils/legalLogic';

interface ProfileSettingsViewProps {
  profile: UserProfile;
  privateSettings: UserPrivateSettings;
  accountEmail?: string | null;
  theme: ThemeMode;
  pushPermission: PushPermissionState;
  activeIdentity?: ActiveIdentity;
  businesses?: BusinessProfile[];
  memberships?: BusinessMembership[];
  onSwitchToPersonal?: () => void;
  onSwitchToBusiness?: (businessProfileId: string) => void;
  onOpenBusinessProfile?: (slug: string) => void;
  onEditBusiness?: (business: BusinessProfile) => void;
  onSetTheme: (theme: ThemeMode) => void;
  onEnablePush: () => Promise<PushPermissionState>;
  onLogout: () => Promise<void>;
  onDeleteAccount?: () => Promise<void>;
  onOpenLegal?: (docId: LegalDocId) => void;
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  onUpdatePrivateSettings: (
    updates: Partial<UserPrivateSettings>
  ) => Promise<void>;
  onBack: () => void;
  userVerificationRequest?: VerificationRequest | null;
  onSubmitVerificationRequest?: (reason: string, links: string[]) => Promise<{ ok: boolean; error?: string }>;
  onCreateBusiness?: () => void;
}

interface SwitchRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  onToggle,
}: SwitchRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-slate-900 dark:text-slate-100 cursor-pointer"
        >
          {label}
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {description}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onToggle}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
          checked
            ? 'bg-blue-600 dark:bg-blue-500'
            : 'bg-slate-300 dark:bg-slate-700'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export function ProfileSettingsView({
  profile,
  privateSettings,
  accountEmail,
  theme,
  pushPermission,
  activeIdentity,
  businesses = [],
  memberships = [],
  onSwitchToPersonal,
  onSwitchToBusiness,
  onSetTheme,
  onEnablePush,
  onLogout,
  onDeleteAccount,
  onOpenLegal,
  onUpdateProfile,
  onUpdatePrivateSettings,
  onBack,
  userVerificationRequest,
  onSubmitVerificationRequest,
  onCreateBusiness,
}: ProfileSettingsViewProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [location, setLocation] = useState(profile.location);
  const [bio, setBio] = useState(profile.bio);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [interests, setInterests] = useState<string[]>(profile.interests);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(privateSettings.pushEnabled);
  const [notifyLikes, setNotifyLikes] = useState(privateSettings.notifyLikes);
  const [notifyComments, setNotifyComments] = useState(
    privateSettings.notifyComments
  );
  const [notifyMessages, setNotifyMessages] = useState(
    privateSettings.notifyMessages
  );
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>(
    privateSettings.profileVisibility
  );
  const [messagePrivacy, setMessagePrivacy] = useState<MessagePrivacy>(
    privateSettings.messagePrivacy
  );

  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeletePanel, setShowDeletePanel] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const syncedUidRef = useRef<string>(profile.uid);
  const isDirtyRef = useRef<boolean>(false);

  const activeBusinessProfile =
    activeIdentity?.type === 'business'
      ? businesses.find((b) => b.id === activeIdentity.businessProfileId) ||
        activeIdentity.businessProfile
      : null;
  const activeBusinessRole =
    activeIdentity?.type === 'business'
      ? memberships.find((m) => m.businessProfileId === activeIdentity.businessProfileId)?.role ||
        activeIdentity.role
      : null;
  const isBusinessMode = Boolean(activeBusinessProfile);
  const canEditActiveBusiness =
    activeBusinessRole === 'OWNER' || activeBusinessRole === 'ADMIN';

  const [bizDisplayName, setBizDisplayName] = useState(
    activeBusinessProfile?.displayName || ''
  );
  const [bizSlug, setBizSlug] = useState(activeBusinessProfile?.slug || '');
  const [bizCategory, setBizCategory] = useState(
    activeBusinessProfile?.category || BUSINESS_CATEGORIES[0]
  );
  const [bizBio, setBizBio] = useState(activeBusinessProfile?.bio || '');
  const [bizLocation, setBizLocation] = useState(
    activeBusinessProfile?.location || ''
  );
  const [bizWebsiteUrl, setBizWebsiteUrl] = useState(
    activeBusinessProfile?.websiteUrl || ''
  );
  const [bizCurrency, setBizCurrency] = useState(
    activeBusinessProfile?.currency || 'USD'
  );
  const [bizLogoUrl, setBizLogoUrl] = useState(
    activeBusinessProfile?.logoUrl || ''
  );
  const [bizUploadingLogo, setBizUploadingLogo] = useState(false);
  const [bizSaving, setBizSaving] = useState(false);
  const [bizError, setBizError] = useState<string | null>(null);
  const [bizSavedNotice, setBizSavedNotice] = useState<string | null>(null);
  const bizLogoInputRef = useRef<HTMLInputElement | null>(null);
  const syncedBizIdRef = useRef<string | null>(activeBusinessProfile?.id || null);
  const isBizDirtyRef = useRef<boolean>(false);

  useEffect(() => {
    const nextBizId = activeBusinessProfile?.id || null;
    const bizChanged = syncedBizIdRef.current !== nextBizId;
    if (bizChanged || !isBizDirtyRef.current) {
      syncedBizIdRef.current = nextBizId;
      isBizDirtyRef.current = false;
      setBizDisplayName(activeBusinessProfile?.displayName || '');
      setBizSlug(activeBusinessProfile?.slug || '');
      setBizCategory(activeBusinessProfile?.category || BUSINESS_CATEGORIES[0]);
      setBizBio(activeBusinessProfile?.bio || '');
      setBizLocation(activeBusinessProfile?.location || '');
      setBizWebsiteUrl(activeBusinessProfile?.websiteUrl || '');
      setBizCurrency(activeBusinessProfile?.currency || 'USD');
      setBizLogoUrl(activeBusinessProfile?.logoUrl || '');
      if (bizChanged) {
        setBizError(null);
        setBizSavedNotice(null);
      }
    }
  }, [activeBusinessProfile]);

  const handleBizLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeBusinessProfile) return;
    setBizError(null);
    setBizSavedNotice(null);
    setBizUploadingLogo(true);
    try {
      const uploaded = await uploadMediaToCloudflareR2(file, 'avatars');
      if (uploaded.kind !== 'image') {
        void deleteUploadedMedia(uploaded.url, { ignoreNotFound: true }).catch(
          () => {}
        );
        setBizError('Please select a valid image file (PNG, JPG, WebP, GIF, or AVIF).');
        return;
      }
      isBizDirtyRef.current = true;
      setBizLogoUrl(uploaded.url);
    } catch (err) {
      setBizError(
        err instanceof Error
          ? err.message
          : 'Failed to upload logo to Cloudflare R2.'
      );
    } finally {
      setBizUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleSaveBusinessDetails = async () => {
    if (!activeBusinessProfile || bizSaving || bizUploadingLogo) return;
    const validation = validateBusinessProfileInput({
      displayName: bizDisplayName,
      slug: bizSlug,
      category: bizCategory,
      bio: bizBio,
      websiteUrl: bizWebsiteUrl,
      location: bizLocation,
      currency: bizCurrency,
    });
    if (!validation.valid) {
      setBizError(validation.error || 'Please review your Business Profile details.');
      setBizSavedNotice(null);
      return;
    }

    setBizError(null);
    setBizSavedNotice(null);
    setBizSaving(true);
    try {
      await updateBusinessProfile(
        activeBusinessProfile.id,
        activeBusinessProfile.slug,
        {
          ...validation.clean,
          logoUrl: bizLogoUrl,
          bannerUrl: activeBusinessProfile.bannerUrl || '',
          ownerUid: activeBusinessProfile.ownerUid,
        }
      );
      isBizDirtyRef.current = false;
      setBizSavedNotice('Business profile details saved');
    } catch (err) {
      setBizError(
        err instanceof Error
          ? err.message
          : 'Unable to save Business Profile details.'
      );
    } finally {
      setBizSaving(false);
    }
  };

  useEffect(() => {
    const uidChanged = syncedUidRef.current !== profile.uid;
    if (uidChanged || !isDirtyRef.current) {
      syncedUidRef.current = profile.uid;
      isDirtyRef.current = false;
      setDisplayName(profile.displayName);
      setHandle(profile.handle);
      setLocation(profile.location);
      setBio(profile.bio);
      setAvatarUrl(profile.avatarUrl);
      setInterests(profile.interests);
      setPushEnabled(privateSettings.pushEnabled);
      setNotifyLikes(privateSettings.notifyLikes);
      setNotifyComments(privateSettings.notifyComments);
      setNotifyMessages(privateSettings.notifyMessages);
      setProfileVisibility(privateSettings.profileVisibility);
      setMessagePrivacy(privateSettings.messagePrivacy);
    }
  }, [profile, privateSettings]);

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSavedNotice(null);
    setAvatarUploading(true);
    try {
      const previousUnsavedUrl = avatarUrl;
      const previousSavedUrl = profile.avatarUrl;
      const uploaded = await uploadMediaToCloudflareR2(file, 'avatars');
      if (uploaded.kind !== 'image') {
        void deleteUploadedMedia(uploaded.url, { ignoreNotFound: true }).catch(
          () => {}
        );
        setError('Please select a valid image file (PNG, JPG, WebP, GIF, or AVIF).');
        return;
      }
      setAvatarUrl(uploaded.url);
      await onUpdateProfile({ avatarUrl: uploaded.url });
      if (previousUnsavedUrl && previousUnsavedUrl !== previousSavedUrl) {
        void deleteUploadedMedia(previousUnsavedUrl, { ignoreNotFound: true }).catch(
          () => {}
        );
      }
      setSavedNotice('Profile photo updated');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to upload avatar to Cloudflare R2.'
      );
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const toggleInterest = (topic: string) => {
    isDirtyRef.current = true;
    setSavedNotice(null);
    setInterests((prev) => {
      if (prev.includes(topic)) {
        return prev.filter((t) => t !== topic);
      }
      if (prev.length >= 6) return prev;
      return [...prev, topic];
    });
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const check = validateProfileInput(displayName, handle, bio);
    if (!check.valid) {
      setError(check.error || 'Please review your profile details.');
      setSavedNotice(null);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const cleanHandle = handle.trim().replace(/^@+/, '');
      await onUpdateProfile({
        displayName: displayName.trim(),
        handle: cleanHandle,
        location: location.trim() || 'Earth',
        bio: bio.trim(),
        avatarUrl,
        interests,
      });
      await onUpdatePrivateSettings({
        pushEnabled,
        themePreference: theme,
        notifyLikes,
        notifyComments,
        notifyMessages,
        profileVisibility,
        messagePrivacy,
      });
      isDirtyRef.current = false;
      setSavedNotice('Settings saved');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to save settings.'
      );
    } finally {
      setSaving(false);
    }
  };

  const permissionLabel =
    pushPermission === 'granted'
      ? 'Browser notifications allowed'
      : pushPermission === 'denied'
        ? 'Blocked in browser settings'
        : pushPermission === 'unsupported'
          ? 'In-app banners active'
          : 'Not yet authorized';

  return (
    <section aria-label="Profile Settings" className="space-y-5">
      {/* Header Bar */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3 -ml-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back to Profile</span>
        </button>

        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-2">
          Profile Settings
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage your public identity, appearance, notifications, and privacy.
        </p>
      </div>



      {/* Profile Switcher (Icon-Only) */}
      <div
        data-testid="settings-profile-switcher"
        className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Profile Switcher
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Active: {activeBusinessProfile ? activeBusinessProfile.displayName : profile.displayName}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Personal Profile Icon */}
            <button
              type="button"
              data-testid="switcher-option-personal"
              aria-pressed={!isBusinessMode}
              aria-label={`Switch to ${profile.displayName}`}
              title={profile.displayName}
              onClick={() => {
                setSavedNotice(null);
                onSwitchToPersonal?.();
              }}
              className={`relative rounded-full p-0.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                !isBusinessMode
                  ? 'ring-2 ring-blue-600 dark:ring-blue-400'
                  : 'opacity-75 hover:opacity-100'
              }`}
            >
              <Avatar src={profile.avatarUrl} name={profile.displayName} size="md" />
              {!isBusinessMode && (
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-600 text-white border-2 border-white dark:border-slate-900 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5" aria-hidden="true" />
                </span>
              )}
            </button>

            {/* Linked Business Profile Icons */}
            {businesses.map((biz) => {
              const selected =
                isBusinessMode && activeBusinessProfile?.id === biz.id;
              return (
                <button
                  key={biz.id}
                  type="button"
                  data-testid={`switcher-option-business-${biz.id}`}
                  aria-pressed={selected}
                  aria-label={`Switch to ${biz.displayName}`}
                  title={biz.displayName}
                  onClick={() => {
                    setSavedNotice(null);
                    onSwitchToBusiness?.(biz.id);
                  }}
                  className={`relative rounded-full p-0.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                    selected
                      ? 'ring-2 ring-blue-600 dark:ring-blue-400'
                      : 'opacity-75 hover:opacity-100'
                  }`}
                >
                  <Avatar src={biz.logoUrl} name={biz.displayName} size="md" />
                  {selected && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-600 text-white border-2 border-white dark:border-slate-900 flex items-center justify-center">
                      <Check className="w-2.5 h-2.5" aria-hidden="true" />
                    </span>
                  )}
                </button>
              );
            })}

            {onCreateBusiness && (
              <button
                type="button"
                onClick={onCreateBusiness}
                aria-label="Create Business Storefront"
                title="Create Business Storefront"
                className="w-11 h-11 rounded-full border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Active Business Profile Direct Editor (shown when switched to a Business Storefront) */}
      {isBusinessMode && activeBusinessProfile && (
        <div
          data-testid="active-business-settings-panel"
          className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              01 · Business Identity · {activeBusinessRole || 'MEMBER'}
            </p>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white mt-0.5 inline-flex items-center gap-1.5">
              <span>Edit {activeBusinessProfile.displayName}</span>
              {activeBusinessProfile.verified && <VerifiedBadge size={14} />}
            </h2>
          </div>

          {bizError && (
            <p
              role="alert"
              className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {bizError}
            </p>
          )}

          {bizSavedNotice && (
            <p
              role="status"
              className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
            >
              <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{bizSavedNotice}</span>
            </p>
          )}

          {canEditActiveBusiness ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <Avatar
                  src={bizLogoUrl}
                  name={bizDisplayName || activeBusinessProfile.displayName}
                  size="lg"
                />
                <div className="space-y-1.5">
                  <input
                    ref={bizLogoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleBizLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={bizUploadingLogo}
                    onClick={() => bizLogoInputRef.current?.click()}
                    className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <Camera className="w-4 h-4" aria-hidden="true" />
                    <span>{bizUploadingLogo ? 'Uploading...' : 'Upload Business Logo'}</span>
                  </button>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Updates your Business Profile avatar across Marketplace and posts.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="settings-biz-name"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                  >
                    Business Name
                  </label>
                  <input
                    id="settings-biz-name"
                    type="text"
                    value={bizDisplayName}
                    onChange={(e) => {
                      isBizDirtyRef.current = true;
                      setBizDisplayName(e.target.value);
                      setBizSavedNotice(null);
                    }}
                    maxLength={80}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="settings-biz-slug"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                  >
                    Business Handle
                  </label>
                  <input
                    id="settings-biz-slug"
                    type="text"
                    value={bizSlug}
                    onChange={(e) => {
                      isBizDirtyRef.current = true;
                      setBizSlug(normalizeBusinessSlug(e.target.value));
                      setBizSavedNotice(null);
                    }}
                    maxLength={64}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="settings-biz-category"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                  >
                    Category
                  </label>
                  <select
                    id="settings-biz-category"
                    value={bizCategory}
                    onChange={(e) => {
                      isBizDirtyRef.current = true;
                      setBizCategory(e.target.value);
                      setBizSavedNotice(null);
                    }}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  >
                    {BUSINESS_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="settings-biz-currency"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                  >
                    Storefront Currency
                  </label>
                  <select
                    id="settings-biz-currency"
                    value={bizCurrency}
                    onChange={(e) => {
                      isBizDirtyRef.current = true;
                      setBizCurrency(e.target.value);
                      setBizSavedNotice(null);
                    }}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  >
                    {BUSINESS_CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>
                        {cur}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="settings-biz-location"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                  >
                    City or Studio Location
                  </label>
                  <input
                    id="settings-biz-location"
                    type="text"
                    value={bizLocation}
                    onChange={(e) => {
                      isBizDirtyRef.current = true;
                      setBizLocation(e.target.value);
                      setBizSavedNotice(null);
                    }}
                    maxLength={80}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="settings-biz-website"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                  >
                    Business Website (Optional)
                  </label>
                  <input
                    id="settings-biz-website"
                    type="url"
                    value={bizWebsiteUrl}
                    onChange={(e) => {
                      isBizDirtyRef.current = true;
                      setBizWebsiteUrl(e.target.value);
                      setBizSavedNotice(null);
                    }}
                    placeholder="https://studio.example.com"
                    maxLength={500}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="settings-biz-bio"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Business Bio
                  </label>
                  <span className="text-xs text-slate-400 tabular-nums">
                    {bizBio.trim().length}/280
                  </span>
                </div>
                <textarea
                  id="settings-biz-bio"
                  rows={3}
                  value={bizBio}
                  onChange={(e) => {
                    isBizDirtyRef.current = true;
                    setBizBio(e.target.value);
                    setBizSavedNotice(null);
                  }}
                  maxLength={280}
                  className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 resize-none"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  data-testid="save-business-details-btn"
                  disabled={bizSaving || bizUploadingLogo}
                  onClick={() => void handleSaveBusinessDetails()}
                  className="min-h-[42px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {bizSaving ? 'Saving...' : 'Save Business Details'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your role ({activeBusinessRole || 'MEMBER'}) does not include editing Business Profile details. Contact the Business Owner or Admin to update profile information.
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {error && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {savedNotice && (
          <div
            role="status"
            className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
          >
            <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{savedNotice}</span>
          </div>
        )}

        {/* 01 · Identity & Public Profile (Unified Normal or Business Profile) */}
        {!isBusinessMode && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 tabular-nums">
              01 · Identity
            </p>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white mt-0.5">
              Personal Profile Details
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Avatar src={avatarUrl} name={displayName || profile.displayName} size="xl" />
            <div className="space-y-1.5">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <button
                type="button"
                disabled={avatarUploading}
                onClick={() => avatarInputRef.current?.click()}
                className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Camera className="w-4 h-4" aria-hidden="true" />
                <span>{avatarUploading ? 'Uploading...' : 'Upload New Avatar'}</span>
              </button>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Stored in your Cloudflare R2 bucket for fast feed and chat loading.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="settings-display-name"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
              >
                Display Name
              </label>
              <input
                id="settings-display-name"
                type="text"
                value={displayName}
                onChange={(e) => {
                  isDirtyRef.current = true;
                  setDisplayName(e.target.value);
                  setSavedNotice(null);
                }}
                maxLength={60}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="settings-handle"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
              >
                Handle
              </label>
              <input
                id="settings-handle"
                type="text"
                value={handle}
                onChange={(e) => {
                  isDirtyRef.current = true;
                  setHandle(e.target.value);
                  setSavedNotice(null);
                }}
                maxLength={32}
                placeholder="maya.lin"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="settings-location"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
            >
              City or Studio
            </label>
            <input
              id="settings-location"
              type="text"
              value={location}
              onChange={(e) => {
                isDirtyRef.current = true;
                setLocation(e.target.value);
                setSavedNotice(null);
              }}
              maxLength={80}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="settings-bio"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Bio
              </label>
              <span className="text-xs text-slate-400 tabular-nums">
                {bio.trim().length}/280
              </span>
            </div>
            <textarea
              id="settings-bio"
              rows={3}
              value={bio}
              onChange={(e) => {
                isDirtyRef.current = true;
                setBio(e.target.value);
                setSavedNotice(null);
              }}
              maxLength={280}
              className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Topics & Interests
              </span>
              <span className="text-xs text-slate-400 tabular-nums">
                {interests.length}/6 selected
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {INTEREST_OPTIONS.map((topic) => {
                const selected = interests.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleInterest(topic)}
                    className={`min-h-[42px] px-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                      selected
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                  <span>Account Verification Badge</span>
                  {profile.isVerified && <VerifiedBadge size={14} />}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {profile.isVerified
                    ? 'Your account is officially verified with a blue checkmark.'
                    : userVerificationRequest?.status === 'pending'
                      ? 'Your verification request is currently pending admin review.'
                      : userVerificationRequest?.status === 'rejected'
                        ? 'Your previous verification request was not approved. You may submit a new request.'
                        : 'Request an official verification badge by providing a reason and reference links.'}
                </p>
                {!profile.isVerified &&
                  userVerificationRequest?.status === 'rejected' &&
                  userVerificationRequest.reviewerNote && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      Admin note: {userVerificationRequest.reviewerNote}
                    </p>
                  )}
              </div>
              {!profile.isVerified && userVerificationRequest?.status !== 'pending' && (
                <button
                  type="button"
                  onClick={() => setVerifyModalOpen(true)}
                  className="min-h-[38px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  <span>Request Verification</span>
                </button>
              )}
              {profile.isVerified && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  Verified Creator
                </span>
              )}
              {!profile.isVerified && userVerificationRequest?.status === 'pending' && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-semibold">
                  Pending Review
                </span>
              )}
            </div>
          </div>
        </div>
        )}

        {/* 02 · Appearance & Display */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 tabular-nums">
              02 · Appearance
            </p>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white mt-0.5">
              Theme & Display
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={theme === 'light'}
              onClick={() => {
                onSetTheme('light');
                setSavedNotice(null);
              }}
              className={`min-h-[48px] px-4 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Sun className="w-4 h-4" aria-hidden="true" />
              <span>Light Mode</span>
            </button>

            <button
              type="button"
              aria-pressed={theme === 'dark'}
              onClick={() => {
                onSetTheme('dark');
                setSavedNotice(null);
              }}
              className={`min-h-[48px] px-4 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Moon className="w-4 h-4" aria-hidden="true" />
              <span>Dark Mode</span>
            </button>
          </div>
        </div>

        {/* 03 · Notifications & Engagement */}
        {!isBusinessMode && (
        <>
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 tabular-nums">
                03 · Notifications
              </p>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white mt-0.5">
                Push & Activity Preferences
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {permissionLabel}
              </p>
            </div>

            {pushPermission !== 'granted' && pushPermission !== 'unsupported' && (
              <button
                type="button"
                onClick={onEnablePush}
                className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Bell className="w-4 h-4" aria-hidden="true" />
                <span>Allow Browser Push</span>
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 pt-1">
            <SwitchRow
              id="switch-push-enabled"
              label="In-app & browser push alerts"
              description="Show real-time toast banners when new events arrive."
              checked={pushEnabled}
              onToggle={() => {
                setPushEnabled((prev) => !prev);
                setSavedNotice(null);
              }}
            />
            <SwitchRow
              id="switch-notify-likes"
              label="Likes & reactions"
              description="Notify when creators appreciate one of your posts."
              checked={notifyLikes}
              onToggle={() => {
                setNotifyLikes((prev) => !prev);
                setSavedNotice(null);
              }}
            />
            <SwitchRow
              id="switch-notify-comments"
              label="Replies & comments"
              description="Notify when someone leaves a comment on your post."
              checked={notifyComments}
              onToggle={() => {
                setNotifyComments((prev) => !prev);
                setSavedNotice(null);
              }}
            />
            <SwitchRow
              id="switch-notify-messages"
              label="Direct messages"
              description="Notify immediately when a creator sends you a chat message."
              checked={notifyMessages}
              onToggle={() => {
                setNotifyMessages((prev) => !prev);
                setSavedNotice(null);
              }}
            />
          </div>
        </div>

        {/* 04 · Privacy & Messaging */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 tabular-nums">
                04 · Privacy
              </p>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white mt-0.5">
                Visibility & Direct Messages
              </h2>
            </div>
            <Lock className="w-4 h-4 text-slate-400 mt-1" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Profile visibility
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                aria-pressed={profileVisibility === 'public'}
                onClick={() => {
                  setProfileVisibility('public');
                  setSavedNotice(null);
                }}
                className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  profileVisibility === 'public'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Public profile
              </button>
              <button
                type="button"
                aria-pressed={profileVisibility === 'followers'}
                onClick={() => {
                  setProfileVisibility('followers');
                  setSavedNotice(null);
                }}
                className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  profileVisibility === 'followers'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Followers only
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Who can message you
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                aria-pressed={messagePrivacy === 'everyone'}
                onClick={() => {
                  setMessagePrivacy('everyone');
                  setSavedNotice(null);
                }}
                className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  messagePrivacy === 'everyone'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Everyone
              </button>
              <button
                type="button"
                aria-pressed={messagePrivacy === 'following'}
                onClick={() => {
                  setMessagePrivacy('following');
                  setSavedNotice(null);
                }}
                className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  messagePrivacy === 'following'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                People you follow
              </button>
            </div>
          </div>
        </div>
        </>
        )}

        {/* 05 · Account Session */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 tabular-nums">
              05 · Account
            </p>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white mt-0.5">
              Account Session
            </h2>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 inline-flex items-center gap-1 max-w-full min-w-0">
                <span className="truncate">{profile.displayName}</span>
                {profile.isVerified && <VerifiedBadge size={14} />}
                <span className="text-slate-500 dark:text-slate-400 shrink-0">(@{profile.handle})</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {accountEmail
                  ? `Signed in as ${accountEmail}`
                  : 'Signed in to your Looma account'}
              </p>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="min-h-[42px] px-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/60 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>Log Out</span>
            </button>
          </div>

          {onOpenLegal && (
            <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Legal &amp; Policies
                </span>
                {privateSettings.termsAcceptedVersion && (
                  <span className="ml-2 tabular-nums">
                    · Accepted v{privateSettings.termsAcceptedVersion}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <button
                  type="button"
                  onClick={() => onOpenLegal('terms')}
                  className="min-h-[36px] hover:underline cursor-pointer"
                >
                  Terms &amp; Conditions
                </button>
                <button
                  type="button"
                  onClick={() => onOpenLegal('privacy')}
                  className="min-h-[36px] hover:underline cursor-pointer"
                >
                  Privacy Policy
                </button>
                <button
                  type="button"
                  onClick={() => onOpenLegal('guidelines')}
                  className="min-h-[36px] hover:underline cursor-pointer"
                >
                  Community Guidelines
                </button>
              </div>
            </div>
          )}



          {onDeleteAccount && (
            <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                    Danger Zone · Delete Account
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Permanently remove your Looma profile, private settings, presence, and Firebase Auth account.
                  </p>
                </div>
                {!showDeletePanel && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeletePanel(true);
                      setDeleteConfirmText('');
                      setDeleteAccountError(null);
                    }}
                    className="min-h-[38px] px-3.5 rounded-xl border border-red-300 dark:border-red-800 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Delete Account</span>
                  </button>
                )}
              </div>

              {showDeletePanel && (
                <div className="rounded-2xl border border-red-200 dark:border-red-900/70 bg-red-50/60 dark:bg-red-950/25 p-4 space-y-3">
                  <div className="flex items-start gap-2.5 text-xs text-red-800 dark:text-red-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" aria-hidden="true" />
                    <p>
                      This action cannot be undone. Type <span className="font-bold">DELETE</span> below to permanently delete your account.
                    </p>
                  </div>

                  {deleteAccountError && (
                    <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-300">
                      {deleteAccountError}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="delete-account-confirm" className="sr-only">
                      Type DELETE to confirm account deletion
                    </label>
                    <input
                      id="delete-account-confirm"
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE to confirm"
                      className="flex-1 min-w-[180px] min-h-[40px] px-3 rounded-xl border border-red-200 dark:border-red-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      disabled={deletingAccount || deleteConfirmText.trim() !== 'DELETE'}
                      onClick={async () => {
                        setDeleteAccountError(null);
                        setDeletingAccount(true);
                        try {
                          await onDeleteAccount();
                        } catch (err) {
                          setDeleteAccountError(
                            err instanceof Error ? err.message : 'Unable to delete account.'
                          );
                          setDeletingAccount(false);
                        }
                      }}
                      className="min-h-[40px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                    >
                      {deletingAccount ? 'Deleting...' : 'Permanently Delete Account'}
                    </button>
                    <button
                      type="button"
                      disabled={deletingAccount}
                      onClick={() => {
                        setShowDeletePanel(false);
                        setDeleteConfirmText('');
                        setDeleteAccountError(null);
                      }}
                      className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Action Bar */}
        {!isBusinessMode && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        )}
      </form>

      <RequestVerificationModal
        isOpen={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        onSubmit={onSubmitVerificationRequest || (async () => ({ ok: true }))}
        theme={theme}
      />
    </section>
  );
}
