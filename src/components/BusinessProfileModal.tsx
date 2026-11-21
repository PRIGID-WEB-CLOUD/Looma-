import { useEffect, useState, type FormEvent } from 'react';
import { Check, Globe, MapPin, Sparkles, Store, X } from 'lucide-react';
import type { BusinessProfile } from '../types/business';
import type { UserProfile } from '../types/social';
import {
  BUSINESS_CATEGORIES,
  BUSINESS_CURRENCIES,
  checkBusinessSlugAvailable,
  createBusinessProfile,
  normalizeBusinessSlug,
  provisionCommerceStoreForBusiness,
  updateBusinessProfile,
  validateBusinessProfileInput,
} from '../services/businessProfiles';
import {
  generateBusinessHandleFromName,
  suggestAlternativeBusinessHandles,
} from '../utils/businessProfileValidation';
import { uploadMediaToCloudflareR2 } from '../services/storage';

interface BusinessProfileModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialProfile?: BusinessProfile | null;
  personalProfile: UserProfile;
  onClose: () => void;
  onSaved: (profile: BusinessProfile) => void;
}

export function BusinessProfileModal({
  open,
  mode,
  initialProfile,
  personalProfile,
  onClose,
  onSaved,
}: BusinessProfileModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [category, setCategory] = useState<string>(BUSINESS_CATEGORIES[0]);
  const [bio, setBio] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [location, setLocation] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [enableCommerceNow, setEnableCommerceNow] = useState(true);

  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [suggestedHandles, setSuggestedHandles] = useState<string[]>([]);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === 'edit' && initialProfile) {
      setDisplayName(initialProfile.displayName);
      setSlug(initialProfile.slug);
      setSlugManuallyEdited(true);
      setCategory(initialProfile.category || BUSINESS_CATEGORIES[0]);
      setBio(initialProfile.bio || '');
      setWebsiteUrl(initialProfile.websiteUrl || '');
      setLocation(initialProfile.location || '');
      setCurrency(initialProfile.currency || 'USD');
      setLogoUrl(initialProfile.logoUrl || '');
      setBannerUrl(initialProfile.bannerUrl || '');
      setEnableCommerceNow(false);
    } else {
      setDisplayName('');
      setSlug('');
      setSlugManuallyEdited(false);
      setCategory(BUSINESS_CATEGORIES[0]);
      setBio('');
      setWebsiteUrl('');
      setLocation(personalProfile.location || '');
      setCurrency('USD');
      setLogoUrl('');
      setBannerUrl('');
      setEnableCommerceNow(true);
    }
    setSlugStatus('idle');
    setSuggestedHandles([]);
  }, [open, mode, initialProfile, personalProfile.location]);

  useEffect(() => {
    if (!open) return;
    const clean = normalizeBusinessSlug(slug);
    if (clean.length < 2) {
      setSlugStatus('idle');
      setSuggestedHandles([]);
      return;
    }
    if (mode === 'edit' && initialProfile && clean === initialProfile.slug) {
      setSlugStatus('available');
      setSuggestedHandles([]);
      return;
    }
    let active = true;
    setSlugStatus('checking');
    setSuggestedHandles([]);
    const timer = window.setTimeout(() => {
      const ignoreId = mode === 'edit' ? initialProfile?.id : undefined;
      void checkBusinessSlugAvailable(clean, ignoreId)
        .then(async (ok) => {
          if (!active) return;
          if (ok) {
            setSlugStatus('available');
            setSuggestedHandles([]);
            return;
          }
          setSlugStatus('taken');
          const candidates = suggestAlternativeBusinessHandles(clean);
          const checks = await Promise.all(
            candidates.map(async (candidate) => ({
              candidate,
              available: await checkBusinessSlugAvailable(candidate, ignoreId).catch(() => false),
            }))
          );
          if (!active) return;
          setSuggestedHandles(
            checks.filter((c) => c.available).slice(0, 3).map((c) => c.candidate)
          );
        })
        .catch(() => {
          if (active) {
            setSlugStatus('idle');
            setSuggestedHandles([]);
          }
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [slug, open, mode, initialProfile]);

  if (!open) return null;

  const handleUploadImage = async (
    file: File | undefined,
    kind: 'logo' | 'banner'
  ) => {
    if (!file) return;
    setError(null);
    if (kind === 'logo') setUploadingLogo(true);
    else setUploadingBanner(true);
    try {
      const uploaded = await uploadMediaToCloudflareR2(file, 'avatars');
      if (kind === 'logo') setLogoUrl(uploaded.url);
      else setBannerUrl(uploaded.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload image right now.');
    } finally {
      if (kind === 'logo') setUploadingLogo(false);
      else setUploadingBanner(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || uploadingLogo || uploadingBanner) return;
    const validation = validateBusinessProfileInput({
      displayName,
      slug,
      category,
      bio,
      websiteUrl,
      location,
      currency,
    });
    if (!validation.valid) {
      setError(validation.error || 'Review Business Profile details.');
      return;
    }
    if (slugStatus === 'taken') {
      setError(`Handle "@${validation.clean.slug}" is already claimed by another business.`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'edit' && initialProfile) {
        await updateBusinessProfile(initialProfile.id, initialProfile.slug, {
          ...validation.clean,
          logoUrl,
          bannerUrl,
          ownerUid: initialProfile.ownerUid,
        });
        onSaved({
          ...initialProfile,
          ...validation.clean,
          logoUrl,
          bannerUrl,
          updatedAtMs: Date.now(),
        });
        onClose();
        return;
      }

      const created = await createBusinessProfile({
        ownerUid: personalProfile.uid,
        ownerDisplayName: personalProfile.displayName,
        ownerHandle: personalProfile.handle,
        ownerAvatarUrl: personalProfile.avatarUrl,
        ...validation.clean,
        logoUrl,
        bannerUrl,
      });

      let finalProfile = created;
      if (enableCommerceNow) {
        try {
          const provisioned = await provisionCommerceStoreForBusiness(created.id);
          finalProfile = {
            ...created,
            commerceStoreId: provisioned.storeId,
            commerceStoreSlug: provisioned.storeSlug,
          };
        } catch (provErr) {
          console.warn('Business profile created, deferred commerce store provisioning:', provErr);
        }
      }

      onSaved(finalProfile);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save Business Profile.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="business-profile-modal-title"
      data-testid="business-profile-modal"
      className="fixed inset-0 z-50 h-[100dvh] w-screen flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden looma-stage-enter"
    >
      <header className="h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-slate-950">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close business profile modal"
            className="min-h-[44px] min-w-[44px] px-2.5 flex items-center justify-center gap-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
            <span className="hidden sm:inline text-xs font-semibold">Back</span>
          </button>
          <div className="min-w-0">
            <h2 id="business-profile-modal-title" className="font-display text-base sm:text-lg font-bold truncate">
              {mode === 'edit' ? 'Edit Business Profile' : 'Create Business Profile'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Separate brand identity managed by @{personalProfile.handle}
            </p>
          </div>
        </div>

        <button
          type="submit"
          form="business-profile-form"
          disabled={submitting || uploadingLogo || uploadingBanner}
          className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-60 transition-colors shrink-0"
        >
          {submitting
            ? mode === 'edit'
              ? 'Saving...'
              : 'Creating...'
            : mode === 'edit'
              ? 'Save Changes'
              : 'Create Business'}
        </button>
      </header>

      <form
        id="business-profile-form"
        onSubmit={handleSubmit}
        className="flex flex-col flex-1 min-h-0 overflow-y-auto"
      >
        <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label
                htmlFor="bp-display-name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Business Name *
              </label>
              <input
                id="bp-display-name"
                type="text"
                required
                maxLength={80}
                value={displayName}
                onChange={(e) => {
                  const val = e.target.value;
                  setDisplayName(val);
                  if (!slugManuallyEdited && mode === 'create') {
                    setSlug(generateBusinessHandleFromName(val));
                  }
                }}
                placeholder="e.g., Prigid Web Cloud"
                className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="bp-slug"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Business @handle *
                </label>
                {slugStatus === 'checking' && (
                  <span className="text-[11px] text-slate-400">Checking handle...</span>
                )}
                {slugStatus === 'available' && (
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                    <Check className="w-3 h-3" aria-hidden="true" /> Available
                  </span>
                )}
                {slugStatus === 'taken' && (
                  <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    @handle already taken
                  </span>
                )}
              </div>
              <div className="flex items-center rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-600">
                <span className="px-3 text-sm font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 shrink-0">
                  @
                </span>
                <input
                  id="bp-slug"
                  type="text"
                  required
                  maxLength={64}
                  value={slug}
                  onChange={(e) => {
                    setSlugManuallyEdited(true);
                    setSlug(normalizeBusinessSlug(e.target.value));
                  }}
                  placeholder="prigidwebcloud"
                  className="w-full min-h-[42px] px-3 bg-transparent text-sm focus:outline-none"
                />
              </div>
              {slugStatus === 'taken' && suggestedHandles.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="handle-suggestions">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Suggested available:
                  </span>
                  {suggestedHandles.map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      onClick={() => {
                        setSlugManuallyEdited(true);
                        setSlug(candidate);
                      }}
                      className="min-h-[30px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-500 text-xs font-medium text-blue-600 dark:text-blue-400 cursor-pointer transition-colors"
                    >
                      @{candidate}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="bp-category"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Category
              </label>
              <select
                id="bp-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                htmlFor="bp-currency"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Primary Store Currency
              </label>
              <select
                id="bp-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {BUSINESS_CURRENCIES.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="bp-bio"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                About this Business
              </label>
              <textarea
                id="bp-bio"
                rows={3}
                maxLength={280}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Describe what your brand builds, curates, or sells..."
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
              />
            </div>

            <div>
              <label
                htmlFor="bp-location"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Location
              </label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="bp-location"
                  type="text"
                  maxLength={80}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, Country"
                  className="w-full min-h-[40px] pl-8 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="bp-website"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Website (Optional)
              </label>
              <div className="relative">
                <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="bp-website"
                  type="url"
                  maxLength={500}
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full min-h-[40px] pl-8 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Brand Logo (Optional)
              </label>
              <div className="flex items-center gap-2">
                <label className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleUploadImage(e.target.files?.[0], 'logo')}
                  />
                  {uploadingLogo ? 'Uploading...' : logoUrl ? 'Replace Logo' : 'Upload Logo'}
                </label>
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt="Business logo preview"
                    className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Cover Banner (Optional)
              </label>
              <div className="flex items-center gap-2">
                <label className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleUploadImage(e.target.files?.[0], 'banner')}
                  />
                  {uploadingBanner ? 'Uploading...' : bannerUrl ? 'Replace Cover' : 'Upload Cover'}
                </label>
                {bannerUrl && (
                  <img
                    src={bannerUrl}
                    alt="Business cover preview"
                    className="w-16 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                  />
                )}
              </div>
            </div>
          </div>

          {mode === 'create' && (
            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 cursor-pointer">
              <input
                type="checkbox"
                checked={enableCommerceNow}
                onChange={(e) => setEnableCommerceNow(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <span>Provision Merchant Commerce Store</span>
                </p>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Automatically initialize this business&apos;s isolated catalog, inventory, and orders workspace in the Seller Portal.
                </p>
              </div>
            </label>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploadingLogo || uploadingBanner}
              className="min-h-[42px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {submitting
                  ? mode === 'edit'
                    ? 'Saving...'
                    : 'Creating Business...'
                  : mode === 'edit'
                    ? 'Save Changes'
                    : 'Create Business Profile'}
              </span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
