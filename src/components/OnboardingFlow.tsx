import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Camera,
  Check,
  MapPin,
  Moon,
  Sun,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { PushPermissionState } from '../services/notifications';
import {
  ASSET_AVATAR_ELENA,
  ASSET_AVATAR_KENJI,
  ASSET_AVATAR_MAYA,
} from '../services/seedData';
import type { ThemeMode, UserProfile } from '../types/social';
import {
  deleteUploadedMedia,
  uploadMediaToCloudflareR2,
} from '../services/storage';
import { INTEREST_OPTIONS, sanitizeHandle, validateProfileInput } from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { LoomaLogo } from './LoomaLogo';
import { VerifiedBadge } from './VerifiedBadge';

interface OnboardingFlowProps {
  profile: UserProfile;
  firebaseUser: User | null;
  theme: ThemeMode;
  pushPermission: PushPermissionState;
  suggestedCreators: UserProfile[];
  followedUserIds: string[];
  followersCount: number;
  onToggleFollow: (uid: string) => void;
  onSetTheme: (theme: ThemeMode) => void;
  onEnablePush: () => Promise<PushPermissionState>;
  onSkip: () => Promise<void>;
  onComplete: (data: {
    displayName: string;
    handle: string;
    bio: string;
    location: string;
    interests: string[];
    avatarUrl: string;
  }) => Promise<void>;
}

const STARTER_AVATARS = [
  { label: 'Portrait A', url: ASSET_AVATAR_MAYA },
  { label: 'Portrait B', url: ASSET_AVATAR_KENJI },
  { label: 'Portrait C', url: ASSET_AVATAR_ELENA },
];

const STEPS: { id: 1 | 2 | 3; number: string; title: string }[] = [
  { id: 1, number: '01', title: 'Identity' },
  { id: 2, number: '02', title: 'Topics & Creators' },
  { id: 3, number: '03', title: 'Look & Alerts' },
];

export function OnboardingFlow({
  profile,
  firebaseUser,
  theme,
  pushPermission,
  suggestedCreators,
  followedUserIds,
  followersCount,
  onToggleFollow,
  onSetTheme,
  onEnablePush,
  onSkip,
  onComplete,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [location, setLocation] = useState(profile.location);
  const [bio, setBio] = useState(profile.bio);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [interests, setInterests] = useState<string[]>(profile.interests);
  const [error, setError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const syncedUidRef = useRef<string>(profile.uid);

  useEffect(() => {
    const activeUid = firebaseUser?.uid || profile.uid;
    if (syncedUidRef.current !== activeUid || profile.uid !== syncedUidRef.current) {
      syncedUidRef.current = activeUid;
      setDisplayName(
        (profile.displayName !== 'Looma Member' ? profile.displayName : '') ||
          firebaseUser?.displayName ||
          profile.displayName
      );
      setHandle(
        profile.handle ||
          sanitizeHandle(
            firebaseUser?.email?.split('@')[0] ||
              firebaseUser?.displayName ||
              'looma_member'
          )
      );
      setLocation(profile.location);
      setBio(profile.bio);
      setAvatarUrl(profile.avatarUrl || firebaseUser?.photoURL || ASSET_AVATAR_MAYA);
      setInterests(profile.interests);
    }
  }, [firebaseUser, profile]);

  const cleanHandlePreview =
    handle.trim().replace(/^@+/, '') || 'your.handle';
  const cleanNamePreview = displayName.trim() || 'Your Name';
  const cleanLocationPreview = location.trim() || 'Earth';
  const cleanBioPreview =
    bio.trim() ||
    'Sharing daylight notes, design studies, and field dispatches.';

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setAvatarUploading(true);
    try {
      const previousUrl = avatarUrl;
      const uploaded = await uploadMediaToCloudflareR2(file, 'avatars');
      if (uploaded.kind !== 'image') {
        void deleteUploadedMedia(uploaded.url);
        setError('Please select a valid image file (PNG, JPG, WebP, GIF, or AVIF).');
        return;
      }
      if (previousUrl !== profile.avatarUrl) {
        void deleteUploadedMedia(previousUrl);
      }
      setAvatarUrl(uploaded.url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to upload avatar to Cloudflare R2.'
      );
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const toggleInterest = (topic: string) => {
    setInterests((prev) =>
      prev.includes(topic)
        ? prev.filter((item) => item !== topic)
        : prev.length < 6
          ? [...prev, topic]
          : prev
    );
  };

  const handleNextFromIdentity = () => {
    const check = validateProfileInput(displayName, handle, bio);
    if (!check.valid) {
      setError(check.error || 'Please check your profile details.');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleSkipSetup = async () => {
    setSkipping(true);
    try {
      await onSkip();
    } finally {
      setSkipping(false);
    }
  };

  const handleFinish = async () => {
    const check = validateProfileInput(displayName, handle, bio);
    if (!check.valid) {
      setError(check.error || 'Please check your profile details.');
      setStep(1);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onComplete({
        displayName: displayName.trim(),
        handle: handle.trim().replace(/^@+/, ''),
        bio: bio.trim(),
        location: location.trim() || 'Earth',
        interests,
        avatarUrl,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const otherSuggestedCreators = suggestedCreators.filter(
    (c) => c.uid !== profile.uid && c.uid !== firebaseUser?.uid
  );

  const followedCreators = otherSuggestedCreators.filter((c) =>
    followedUserIds.includes(c.uid)
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Studio Top Bar */}
      <header className="sticky top-0 z-30 h-14 md:h-16 px-4 md:px-8 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md">
        <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <LoomaLogo />
            <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500">
              · Creator Studio Setup
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              disabled={skipping}
              onClick={handleSkipSetup}
              className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {skipping ? 'Skipping...' : 'Skip setup'}
            </button>

            <button
              type="button"
              onClick={() => onSetTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={
                theme === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Progress Track */}
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/60">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-3">
          <nav
            aria-label="Onboarding steps"
            className="grid grid-cols-3 gap-2 sm:gap-4"
          >
            {STEPS.map((item) => {
              const isCurrent = step === item.id;
              const isCompleted = step > item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id < step) {
                      setError(null);
                      setStep(item.id);
                    }
                  }}
                  disabled={item.id > step}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`text-left py-1.5 border-b-2 transition-colors ${
                    item.id < step ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    isCurrent
                      ? 'border-blue-600 dark:border-blue-500 text-slate-900 dark:text-white'
                      : isCompleted
                        ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                        : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <span className="block text-[11px] font-semibold tabular-nums">
                    {item.number}
                  </span>
                  <span className="block text-xs font-semibold truncate">
                    {item.title}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Setup Workspace */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-8 py-5 md:py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Compact Mobile Live Identity Strip */}
        <div className="lg:hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar src={avatarUrl} name={cleanNamePreview} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1 max-w-full min-w-0">
                <span className="truncate">{cleanNamePreview}</span>
                {profile.isVerified && <VerifiedBadge size={13} />}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                @{cleanHandlePreview} · {cleanLocationPreview}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
            {followedUserIds.length} following
          </span>
        </div>

        {/* Left Interactive Step Panel */}
        <section
          aria-label={`Onboarding step ${step}`}
          className="lg:col-span-7 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-8 space-y-6"
        >
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs sm:text-sm text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                  Step 01 of 03 · Profile Identity
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1 text-balance">
                  Shape your creator card
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Customize how people recognize you in the feed, direct chats, and follower lists.
                </p>
              </div>

              {/* Avatar Picker */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <Avatar
                    src={avatarUrl}
                    name={cleanNamePreview}
                    size="xl"
                  />
                  <div>
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
                      className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{avatarUploading ? 'Uploading...' : 'Upload Photo'}</span>
                    </button>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                      Or choose a starter portrait
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {STARTER_AVATARS.map((preset) => {
                    const selected = avatarUrl === preset.url;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setAvatarUrl(preset.url)}
                        aria-label={`Select ${preset.label}`}
                        aria-pressed={selected}
                        className={`rounded-full p-0.5 border-2 transition-colors cursor-pointer ${
                          selected
                            ? 'border-blue-600 dark:border-blue-400'
                            : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <Avatar
                          src={preset.url}
                          name={preset.label}
                          size="sm"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="onboard-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Display Name
                  </label>
                  <input
                    id="onboard-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={60}
                    placeholder="Alex Rivera"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor="onboard-handle"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Handle
                  </label>
                  <input
                    id="onboard-handle"
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    maxLength={32}
                    placeholder="alex.rivera"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="onboard-location"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  City or Studio
                </label>
                <input
                  id="onboard-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={80}
                  placeholder="San Francisco"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="onboard-bio"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Short Bio
                  </label>
                  <span className="text-xs text-slate-400 tabular-nums">
                    {bio.trim().length}/280
                  </span>
                </div>
                <textarea
                  id="onboard-bio"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={280}
                  placeholder="What are you building, photographing, or exploring?"
                  className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleNextFromIdentity}
                  className="w-full sm:w-auto min-h-[48px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>Continue to Topics</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                  Step 02 of 03 · Community &amp; Topics
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1 text-balance">
                  Pick interests &amp; follow creators
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Select up to six topics and follow studios to seed your live stream immediately.
                </p>
              </div>

              {/* Topics Grid */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Topics
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
                        className={`min-h-[42px] px-3 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-blue-600 border-blue-600 text-white dark:bg-blue-500 dark:border-blue-500'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                        }`}
                      >
                        {topic}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Suggested Creators */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Creators in the Community
                  </span>
                  <span className="text-xs text-slate-400 tabular-nums">
                    {followedUserIds.length} following
                  </span>
                </div>

                {otherSuggestedCreators.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                    Other members will appear here once they join Looma.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    {otherSuggestedCreators.map((creator) => {
                      const isFollowing = followedUserIds.includes(creator.uid);
                      return (
                        <div
                          key={creator.uid}
                          className="p-3.5 sm:p-4 flex items-center justify-between gap-3 bg-white dark:bg-slate-900"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar
                              src={creator.avatarUrl}
                              name={creator.displayName}
                              size="md"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1 max-w-full min-w-0">
                                <span className="truncate">{creator.displayName}</span>
                                {creator.isVerified && <VerifiedBadge size={13} />}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                @{creator.handle}
                                {creator.location ? ` · ${creator.location}` : ''}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            aria-pressed={isFollowing}
                            onClick={() => onToggleFollow(creator.uid)}
                            className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                              isFollowing
                                ? 'border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                                : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white'
                            }`}
                          >
                            {isFollowing ? (
                              <>
                                <UserCheck
                                  className="w-3.5 h-3.5"
                                  aria-hidden="true"
                                />
                                <span>Following</span>
                              </>
                            ) : (
                              <>
                                <UserPlus
                                  className="w-3.5 h-3.5"
                                  aria-hidden="true"
                                />
                                <span>Follow</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="min-h-[48px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <span>Continue to Look &amp; Alerts</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                  Step 03 of 03 · Look &amp; Alerts
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1 text-balance">
                  Tune appearance &amp; instant alerts
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Choose your reading surface and enable real-time notifications before launching your feed.
                </p>
              </div>

              {/* Tactile Theme Preview Selector */}
              <div className="space-y-2.5">
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Workspace Theme
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    aria-pressed={theme === 'light'}
                    onClick={() => onSetTheme('light')}
                    className={`p-4 rounded-2xl border text-left cursor-pointer space-y-3 ${
                      theme === 'light'
                        ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/50 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-slate-400 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-1.5">
                      <div className="h-2 w-12 rounded bg-slate-900/80" />
                      <div className="h-7 rounded-lg bg-white border border-slate-200" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                        <Sun className="w-4 h-4 text-amber-500" aria-hidden="true" />
                        <span>Daylight Light</span>
                      </span>
                      {theme === 'light' && (
                        <Check
                          className="w-4 h-4 text-blue-600 dark:text-blue-400"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-pressed={theme === 'dark'}
                    onClick={() => onSetTheme('dark')}
                    className={`p-4 rounded-2xl border text-left cursor-pointer space-y-3 ${
                      theme === 'dark'
                        ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/50 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-slate-400 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 space-y-1.5">
                      <div className="h-2 w-12 rounded bg-slate-100/80" />
                      <div className="h-7 rounded-lg bg-slate-900 border border-slate-800" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                        <Moon className="w-4 h-4 text-blue-400" aria-hidden="true" />
                        <span>Slate Dark</span>
                      </span>
                      {theme === 'dark' && (
                        <Check
                          className="w-4 h-4 text-blue-600 dark:text-blue-400"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </button>
                </div>
              </div>

              {/* Push Notifications */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Bell className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Real-time Push Notifications
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {pushPermission === 'granted'
                        ? 'Browser push alerts enabled'
                        : 'Get instant alerts for direct messages, likes, and replies.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onEnablePush}
                  className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {pushPermission === 'granted'
                    ? 'Browser Push Enabled'
                    : 'Allow Browser Push'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleFinish}
                  className="min-h-[48px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <span>
                    {submitting ? 'Launching Feed...' : 'Launch Live Feed'}
                  </span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Right Live Profile & Feed Preview (Desktop) */}
        <aside
          aria-label="Live profile preview"
          className="hidden lg:flex lg:col-span-5 flex-col gap-4 sticky top-24"
        >
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Live Profile Preview
              </p>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {firebaseUser ? 'Synced account' : 'New member setup'}
              </span>
            </div>

            <div className="flex items-start gap-4">
              <Avatar src={avatarUrl} name={cleanNamePreview} size="xl" />
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5 max-w-full min-w-0">
                  <span className="truncate">{cleanNamePreview}</span>
                  {profile.isVerified && <VerifiedBadge size={16} />}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  @{cleanHandlePreview}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{cleanLocationPreview}</span>
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {cleanBioPreview}
            </p>

            {interests.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {interests.join(' · ')}
              </p>
            )}

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-6 text-xs tabular-nums">
              <div>
                <span className="font-bold text-slate-900 dark:text-white">
                  {followersCount}
                </span>{' '}
                <span className="text-slate-500 dark:text-slate-400">
                  Followers
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-900 dark:text-white">
                  {followedUserIds.length}
                </span>{' '}
                <span className="text-slate-500 dark:text-slate-400">
                  Following
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900 dark:text-white">
                Your Starting Network
              </span>
              <span className="text-slate-500 dark:text-slate-400 capitalize">
                {theme} mode
              </span>
            </div>
            {followedCreators.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Follow creators in Step 02 to customize your initial feed.
              </p>
            ) : (
              <div className="space-y-2.5">
                {followedCreators.map((creator) => (
                  <div
                    key={creator.uid}
                    className="flex items-center gap-2.5 text-xs"
                  >
                    <Avatar
                      src={creator.avatarUrl}
                      name={creator.displayName}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1 max-w-full min-w-0">
                        <span className="truncate">{creator.displayName}</span>
                        {creator.isVerified && <VerifiedBadge size={12} />}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 truncate">
                        @{creator.handle} · {creator.location}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
