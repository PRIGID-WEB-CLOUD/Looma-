import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, X } from 'lucide-react';
import {
  ASSET_POST_ALPINE,
  ASSET_POST_ARCH,
  ASSET_POST_CAFE,
} from '../services/seedData';
import {
  deleteUploadedMedia,
  uploadMediaToCloudflareR2,
} from '../services/storage';

interface AddStoryModalProps {
  open: boolean;
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
        setError('Stories support image files only (PNG, JPG, WebP, GIF, or AVIF).');
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
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="add-story-title"
            className="font-display text-lg font-bold text-slate-900 dark:text-white"
          >
            Add to Your Story
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close add story modal"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="relative h-56 rounded-2xl overflow-hidden bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <img
              src={imageUrl}
              alt="Story preview"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 to-transparent" />
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
              className="absolute bottom-3 right-3 min-h-[38px] px-3.5 rounded-xl bg-white/90 hover:bg-white text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-60"
            >
              <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{uploading ? 'Uploading...' : 'Upload Photo'}</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {STORY_PRESETS.map((preset) => {
              const selected = imageUrl === preset.url;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setImageUrl(preset.url)}
                  className={`min-h-[38px] px-2.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer truncate ${
                    selected
                      ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div>
            <label
              htmlFor="story-caption-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Story Note (optional)
            </label>
            <input
              id="story-caption-input"
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a brief caption for the next 24 hours..."
              maxLength={160}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[42px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Sharing...' : 'Share to Story'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
