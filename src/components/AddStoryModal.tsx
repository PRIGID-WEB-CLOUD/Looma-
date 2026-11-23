import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowLeft, ImagePlus, Sparkles } from 'lucide-react';
import type { BusinessProfile } from '../types/business';
import {
  ASSET_POST_ALPINE,
  ASSET_POST_ARCH,
  ASSET_POST_CAFE,
} from '../services/seedData';
import {
  deleteUploadedMedia,
  uploadMediaToCloudflareR2,
} from '../services/storage';
import { Avatar } from './Avatar';

interface AddStoryModalProps {
  open: boolean;
  activeBusinessProfile?: BusinessProfile | null;
  onClose: () => void;
  onCreateStory: (caption: string, imageUrl: string) => Promise<void>;
}

const STORY_PRESETS = [
  { label: 'Courtyard Light', url: ASSET_POST_ARCH },
  { label: 'Morning Desk', url: ASSET_POST_CAFE },
  { label: 'Alpine Ridge', url: ASSET_POST_ALPINE },
];

export function AddStoryModal({
  open,
  activeBusinessProfile = null,
  onClose,
  onCreateStory,
}: AddStoryModalProps) {
  const [imageUrl, setImageUrl] = useState(ASSET_POST_ARCH);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const handleClose = () => {
    void deleteUploadedMedia(imageUrl);
    setCaption('');
    setImageUrl(ASSET_POST_ARCH);
    setError(null);
    onClose();
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const previousUrl = imageUrl;
      const uploaded = await uploadMediaToCloudflareR2(file, 'stories');
      if (uploaded.kind !== 'image') {
        void deleteUploadedMedia(uploaded.url);
        setError(
          'Stories support image files only (PNG, JPG, WebP, GIF, or AVIF).'
        );
        return;
      }
      void deleteUploadedMedia(previousUrl);
      setImageUrl(uploaded.url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not upload story photo to Cloudflare R2.'
      );
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!imageUrl && !caption.trim()) {
      setError('Select an image or write a quick story note.');
      return;
    }
    setSubmitting(true);
    try {
      await onCreateStory(caption, imageUrl);
      setCaption('');
      setImageUrl(ASSET_POST_ARCH);
      setError(null);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-story-title"
      data-testid="add-story-fullscreen"
      className="fixed inset-0 z-50 h-[100dvh] w-screen bg-slate-950 text-white flex flex-col overflow-hidden"
    >
      {/* Full-Screen Top Navigation Bar */}
      <header className="h-16 px-4 sm:px-6 border-b border-white/10 bg-slate-950/95 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close add story modal"
            className="min-h-[44px] min-w-[44px] px-2.5 rounded-xl flex items-center justify-center gap-2 text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            <span className="hidden sm:inline text-xs font-semibold">Back</span>
          </button>
          {activeBusinessProfile && (
            <Avatar
              src={activeBusinessProfile.logoUrl}
              name={activeBusinessProfile.displayName}
              size="sm"
              shape="business"
            />
          )}
          <div className="min-w-0">
            <h2
              id="add-story-title"
              className="font-display text-base sm:text-lg font-bold text-white truncate"
            >
              {activeBusinessProfile
                ? `Create Story · ${activeBusinessProfile.displayName}`
                : 'Create Story'}
            </h2>
            <p className="text-[11px] text-slate-400 truncate">
              {activeBusinessProfile
                ? `Business Story (@${activeBusinessProfile.slug}) · Visible for 24 hours`
                : 'Full-screen frame · Visible for 24 hours'}
            </p>
          </div>
        </div>

        <button
          type="submit"
          form="add-story-form"
          disabled={submitting || uploading}
          className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-60 transition-colors shrink-0"
        >
          {submitting ? 'Sharing...' : 'Share Story'}
        </button>
      </header>

      {/* Main Studio Body */}
      <form
        id="add-story-form"
        onSubmit={handleSubmit}
        className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden"
      >
        {/* Edge-to-Edge Live Story Frame Preview */}
        <div className="lg:col-span-7 relative flex-1 min-h-[260px] flex items-center justify-center bg-slate-900/60 p-4 sm:p-8 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center blur-3xl opacity-35 scale-110 pointer-events-none"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
          <div className="relative z-10 h-full max-h-[68vh] lg:max-h-[78vh] w-full max-w-[380px] aspect-[9/16] rounded-3xl overflow-hidden bg-slate-900 border border-white/15 shadow-2xl flex items-center justify-center">
            <img
              src={imageUrl}
              alt="Story preview"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />

            {caption.trim() && (
              <div className="absolute bottom-14 inset-x-4 text-center pointer-events-none">
                <p className="inline-block px-3.5 py-2 rounded-2xl bg-black/55 backdrop-blur-md border border-white/10 text-xs sm:text-sm font-medium text-white leading-relaxed">
                  {caption}
                </p>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-3 right-3 min-h-[42px] px-4 rounded-xl bg-white/95 hover:bg-white text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-lg disabled:opacity-60"
            >
              <ImagePlus className="w-4 h-4" aria-hidden="true" />
              <span>{uploading ? 'Uploading...' : 'Upload Photo'}</span>
            </button>
          </div>
        </div>

        {/* Side / Bottom Customization Controls */}
        <div className="lg:col-span-5 lg:border-l border-t lg:border-t-0 border-white/10 bg-slate-950 p-4 sm:p-6 flex flex-col justify-between gap-5 overflow-y-auto shrink-0">
          <div className="space-y-5">
            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-200"
              >
                {error}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                <span>Curated Backdrops</span>
              </p>
              <div className="grid grid-cols-3 gap-2.5">
                {STORY_PRESETS.map((preset) => {
                  const selected = imageUrl === preset.url;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setImageUrl(preset.url)}
                      className={`group rounded-2xl overflow-hidden border text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-blue-500 ring-2 ring-blue-500/40 bg-blue-950/30'
                          : 'border-white/10 bg-slate-900 hover:border-white/25'
                      }`}
                    >
                      <div className="aspect-[4/3] w-full overflow-hidden bg-slate-800">
                        <img
                          src={preset.url}
                          alt={preset.label}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <p className="px-2 py-2 text-[11px] font-medium text-slate-200 truncate">
                        {preset.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="story-caption-input"
                  className="text-xs font-semibold uppercase tracking-wider text-slate-400"
                >
                  Story Note (optional)
                </label>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {caption.length}/160
                </span>
              </div>
              <textarea
                id="story-caption-input"
                rows={3}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a brief caption for the next 24 hours..."
                maxLength={160}
                className="w-full p-3.5 rounded-2xl border border-slate-800 bg-slate-900 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={handleClose}
              className="min-h-[44px] px-5 rounded-xl border border-white/15 text-xs font-semibold text-slate-300 hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploading}
              className="min-h-[44px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Sharing...' : 'Share to Story'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
