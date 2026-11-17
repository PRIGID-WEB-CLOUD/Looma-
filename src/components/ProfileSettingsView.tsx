import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Camera,
  Check,
  Lock,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
} from 'lucide-react';
import type { PushPermissionState } from '../services/notifications';
import type {
  MessagePrivacy,
  ProfileVisibility,
  ThemeMode,
  UserPrivateSettings,
  UserProfile,
} from '../types/social';
import {
  deleteUploadedMedia,
  uploadMediaToCloudflareR2,
} from '../services/storage';
import { INTEREST_OPTIONS, validateProfileInput } from '../utils/socialLogic';
import { Avatar } from './Avatar';
import type { LegalDocId } from '../utils/legalLogic';

interface ProfileSettingsViewProps {
  profile: UserProfile;
  privateSettings: UserPrivateSettings;
  accountEmail?: string | null;
  theme: ThemeMode;
  pushPermission: PushPermissionState;
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
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  onOpenLanding?: () => void;
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
  onSetTheme,
  onEnablePush,
  onLogout,
  onDeleteAccount,
  onOpenLegal,
  onUpdateProfile,
  onUpdatePrivateSettings,
  onBack,
  isAdmin = false,
  onOpenAdmin,
  onOpenLanding,
}: ProfileSettingsViewProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [location, setLocation] = useState(profile.location);
  const [bio, setBio] = useState(profile.bio);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [interests, setInterests] = useState<string[]>(profile.interests);

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
  const [savedNotice, setSavedNotice] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeletePanel, setShowDeletePanel] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const syncedUidRef = useRef<string>(profile.uid);

  useEffect(() => {
    if (syncedUidRef.current !== profile.uid) {
      syncedUidRef.current = profile.uid;
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
    setSavedNotice(false);
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
          : 'Failed to upload avatar to Cloudflare R2.'
      );
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const toggleInterest = (topic: string) => {
    setSavedNotice(false);
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
      setSavedNotice(false);
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
      setSavedNotice(true);
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
            <span>Settings saved</span>
          </div>
        )}

        {/* 01 · Identity & Public Profile */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 tabular-nums">
              01 · Identity
            </p>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white mt-0.5">
              Public Profile
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
                  setDisplayName(e.target.value);
                  setSavedNotice(false);
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
                  setHandle(e.target.value);
                  setSavedNotice(false);
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
                setLocation(e.target.value);
                setSavedNotice(false);
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
                setBio(e.target.value);
                setSavedNotice(false);
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
        </div>

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
                setSavedNotice(false);
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
                setSavedNotice(false);
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
                setSavedNotice(false);
              }}
            />
            <SwitchRow
              id="switch-notify-likes"
              label="Likes & reactions"
              description="Notify when creators appreciate one of your posts."
              checked={notifyLikes}
              onToggle={() => {
                setNotifyLikes((prev) => !prev);
                setSavedNotice(false);
              }}
            />
            <SwitchRow
              id="switch-notify-comments"
              label="Replies & comments"
              description="Notify when someone leaves a comment on your post."
              checked={notifyComments}
              onToggle={() => {
                setNotifyComments((prev) => !prev);
                setSavedNotice(false);
              }}
            />
            <SwitchRow
              id="switch-notify-messages"
              label="Direct messages"
              description="Notify immediately when a creator sends you a chat message."
              checked={notifyMessages}
              onToggle={() => {
                setNotifyMessages((prev) => !prev);
                setSavedNotice(false);
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
                  setSavedNotice(false);
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
                  setSavedNotice(false);
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
                  setSavedNotice(false);
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
                  setSavedNotice(false);
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
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {profile.displayName} (@{profile.handle})
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

          {isAdmin && onOpenAdmin && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60">
                <div>
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                    Platform Administration
                  </p>
                  <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mt-0.5">
                    Access member management, content moderation, reports, and system operations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="min-h-[38px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  <span>Open Admin Console</span>
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
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </section>
  );
}
