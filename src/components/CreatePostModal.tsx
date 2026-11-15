import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowLeft,
  AtSign,
  ExternalLink,
  File,
  Globe,
  Hash,
  ImagePlus,
  Music,
  Play,
  Trash2,
} from 'lucide-react';
import type { PostCategory, UserProfile } from '../types/social';
import {
  extractFirstUrl,
  filterCreatorsForMention,
  filterHashtags,
  getHashtagQueryAtCursor,
  getMentionQueryAtCursor,
  parseRichUrl,
  POST_CATEGORIES,
  sanitizeMediaTitle,
  sanitizeUploadedFilenameTitle,
  validatePostInput,
  type CuratedGif,
} from '../utils/socialLogic';
import {
  deleteUploadedMedia,
  uploadMediaToCloudflareR2,
} from '../services/storage';
import { Avatar } from './Avatar';
import { GifPickerModal } from './GifPickerModal';

const DEFAULT_CATEGORY: PostCategory = 'Journal';

export interface CreatePostExtra {
  videoUrl?: string;
  audioUrl?: string;
  linkUrl?: string;
  mediaTitle?: string;
}

interface CreatePostModalProps {
  open: boolean;
  profile: UserProfile;
  communityUsers?: UserProfile[];
  onClose: () => void;
  onCreatePost: (
    caption: string,
    category: PostCategory,
    imageUrl: string,
    extra?: CreatePostExtra
  ) => Promise<void>;
}

export function CreatePostModal({
  open,
  profile,
  communityUsers = [],
  onClose,
  onCreatePost,
}: CreatePostModalProps) {
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<PostCategory>(DEFAULT_CATEGORY);
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [mediaTitle, setMediaTitle] = useState('');
  const [dismissedCaptionUrl, setDismissedCaptionUrl] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSelectGif = (gif: CuratedGif) => {
    setImageUrl(gif.url);
    setMediaTitle(gif.title);
    setVideoUrl('');
    setAudioUrl('');
  };
  const [cursorPos, setCursorPos] = useState<number>(0);

  const allCandidateCreators = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const c of communityUsers) {
      if (c.uid !== profile.uid) map.set(c.handle.toLowerCase(), c);
    }
    return Array.from(map.values());
  }, [communityUsers, profile.uid]);

  const activeMentionQuery = useMemo(
    () => getMentionQueryAtCursor(caption, cursorPos),
    [caption, cursorPos]
  );

  const mentionSuggestions = useMemo(
    () =>
      activeMentionQuery
        ? filterCreatorsForMention(activeMentionQuery.query, allCandidateCreators)
        : [],
    [activeMentionQuery, allCandidateCreators]
  );

  const activeHashtagQuery = useMemo(
    () => getHashtagQueryAtCursor(caption, cursorPos),
    [caption, cursorPos]
  );

  const hashtagSuggestions = useMemo(
    () =>
      activeHashtagQuery ? filterHashtags(activeHashtagQuery.query) : [],
    [activeHashtagQuery]
  );

  const insertMention = (handle: string) => {
    if (!activeMentionQuery) return;
    const before = caption.slice(0, activeMentionQuery.startIndex);
    const after = caption.slice(cursorPos);
    const next = `${before}@${handle} ${after}`;
    setCaption(next);
    const nextPos = activeMentionQuery.startIndex + handle.length + 2;
    setCursorPos(nextPos);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 0);
  };

  const insertHashtag = (tag: string) => {
    if (!activeHashtagQuery) return;
    const before = caption.slice(0, activeHashtagQuery.startIndex);
    const after = caption.slice(cursorPos);
    const next = `${before}#${tag} ${after}`;
    setCaption(next);
    const nextPos = activeHashtagQuery.startIndex + tag.length + 2;
    setCursorPos(nextPos);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 0);
  };

  const captionDetectedUrl = useMemo(() => extractFirstUrl(caption), [caption]);

  const effectivePreviewUrl = useMemo(() => {
    if (imageUrl.trim()) return imageUrl.trim();
    if (videoUrl.trim()) return videoUrl.trim();
    if (audioUrl.trim()) return audioUrl.trim();
    if (captionDetectedUrl && captionDetectedUrl !== dismissedCaptionUrl) {
      return captionDetectedUrl;
    }
    return '';
  }, [
    audioUrl,
    captionDetectedUrl,
    dismissedCaptionUrl,
    imageUrl,
    videoUrl,
  ]);

  const parsedPreview = useMemo(
    () =>
      effectivePreviewUrl
        ? parseRichUrl(
            effectivePreviewUrl,
            sanitizeMediaTitle(mediaTitle) || undefined
          )
        : null,
    [effectivePreviewUrl, mediaTitle]
  );

  if (!open) return null;

  const hasUploadedFile = Boolean(imageUrl || videoUrl || audioUrl);

  const cleanupStagedUrls = (urls: string[]) => {
    for (const url of urls) {
      if (url) {
        void deleteUploadedMedia(url);
      }
    }
  };

  const clearAllMedia = () => {
    cleanupStagedUrls([imageUrl, videoUrl, audioUrl]);
    setImageUrl('');
    setVideoUrl('');
    setAudioUrl('');
    setMediaTitle('');
    if (captionDetectedUrl) {
      setDismissedCaptionUrl(captionDetectedUrl);
    }
  };

  const handleClose = () => {
    cleanupStagedUrls([imageUrl, videoUrl, audioUrl]);
    setImageUrl('');
    setVideoUrl('');
    setAudioUrl('');
    setMediaTitle('');
    setCategory(DEFAULT_CATEGORY);
    setError(null);
    onClose();
  };

  const handleAllInOneFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    try {
      const previousUrls = [imageUrl, videoUrl, audioUrl].filter(Boolean);
      const uploaded = await uploadMediaToCloudflareR2(
        file,
        'posts',
        (pct) => setUploadProgress(pct)
      );
      cleanupStagedUrls(previousUrls);
      const cleanTitle = sanitizeUploadedFilenameTitle(file.name);
      setMediaTitle(cleanTitle);

      if (uploaded.kind === 'image') {
        setImageUrl(uploaded.url);
        setVideoUrl('');
        setAudioUrl('');
      } else if (uploaded.kind === 'video') {
        setVideoUrl(uploaded.url);
        setImageUrl('');
        setAudioUrl('');
      } else {
        setAudioUrl(uploaded.url);
        setImageUrl('');
        setVideoUrl('');
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to upload file to Cloudflare R2.'
      );
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  const handleCaptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setCaption(value);
    setCursorPos(e.target.selectionStart || 0);
    const nextUrl = extractFirstUrl(value);
    if (nextUrl && nextUrl !== dismissedCaptionUrl) {
      setDismissedCaptionUrl(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    let finalImageUrl = imageUrl.trim();
    let finalVideoUrl = videoUrl.trim();
    let finalAudioUrl = audioUrl.trim();
    let finalLinkUrl = '';
    let finalMediaTitle = sanitizeMediaTitle(mediaTitle);

    if (
      !finalImageUrl &&
      !finalVideoUrl &&
      !finalAudioUrl &&
      captionDetectedUrl &&
      captionDetectedUrl !== dismissedCaptionUrl
    ) {
      const detectedParsed = parseRichUrl(captionDetectedUrl);
      if (detectedParsed) {
        if (
          detectedParsed.kind === 'youtube' ||
          detectedParsed.kind === 'vimeo' ||
          detectedParsed.kind === 'video'
        ) {
          finalVideoUrl = detectedParsed.url;
        } else if (detectedParsed.kind === 'audio') {
          finalAudioUrl = detectedParsed.url;
        } else if (detectedParsed.kind === 'image') {
          finalImageUrl = detectedParsed.url;
        } else {
          finalLinkUrl = detectedParsed.url;
        }
        if (!finalMediaTitle) {
          finalMediaTitle = sanitizeMediaTitle(detectedParsed.displayTitle);
        }
      }
    }

    const hasAttachment = Boolean(
      finalImageUrl || finalVideoUrl || finalAudioUrl || finalLinkUrl
    );
    const check = validatePostInput(caption, category, hasAttachment);
    if (!check.valid) {
      setError(check.error || 'Write a caption or attach a file before posting.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onCreatePost(caption, category, finalImageUrl, {
        videoUrl: finalVideoUrl,
        audioUrl: finalAudioUrl,
        linkUrl: finalLinkUrl,
        mediaTitle: finalMediaTitle,
      });
      setCaption('');
      setCategory(DEFAULT_CATEGORY);
      setImageUrl('');
      setVideoUrl('');
      setAudioUrl('');
      setMediaTitle('');
      setDismissedCaptionUrl(null);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to publish post right now. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-post-title"
      data-testid="create-post-fullscreen"
      className="fixed inset-0 z-50 h-[100dvh] w-screen flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden"
    >
      {/* Full-Screen Page Header */}
      <header className="h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-slate-950">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close create post modal"
            className="min-h-[44px] min-w-[44px] px-2.5 flex items-center justify-center gap-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            <span className="hidden sm:inline text-xs font-semibold">Back</span>
          </button>
          <div className="min-w-0">
            <h2
              id="create-post-title"
              className="font-display text-base sm:text-lg font-bold truncate"
            >
              Create Post
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Share notes, photography, video, audio, or studio links
            </p>
          </div>
        </div>

        <button
          type="submit"
          form="create-post-form"
          disabled={submitting || uploading}
          className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-60 transition-colors shrink-0"
        >
          {submitting ? 'Publishing...' : 'Publish Post'}
        </button>
      </header>

      <form
        id="create-post-form"
        onSubmit={handleSubmit}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto w-full p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Author, Category, Rich Caption Studio */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <Avatar
                  src={profile.avatarUrl}
                  name={profile.displayName}
                  size="md"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {profile.displayName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    @{profile.handle} · Public to Looma feed
                  </p>
                </div>
              </div>

              {/* Topic Category Picker */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Topic Category
                </p>
                <div
                  role="group"
                  aria-label="Post category"
                  className="flex flex-wrap gap-2"
                >
                  {POST_CATEGORIES.map((cat) => {
                    const selected = category === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setCategory(cat)}
                        className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-blue-600 border-blue-600 text-white dark:bg-blue-500 dark:border-blue-500'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              <div className="space-y-2.5 flex-1 flex flex-col">
                <label htmlFor="post-caption" className="sr-only">
                  Post caption or paste a link
                </label>
                <div className="relative flex-1 flex flex-col">
                  <textarea
                    ref={textareaRef}
                    id="post-caption"
                    rows={8}
                    value={caption}
                    onChange={handleCaptionChange}
                    onClick={(e) => setCursorPos(e.currentTarget.selectionStart || 0)}
                    onKeyUp={(e) => setCursorPos(e.currentTarget.selectionStart || 0)}
                    onSelect={(e) => setCursorPos(e.currentTarget.selectionStart || 0)}
                    placeholder="Write thoughts, add #hashtags, @mention creators, or paste a link..."
                    maxLength={1200}
                    className="w-full min-h-[200px] lg:min-h-[280px] p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm sm:text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
                  />

                  {/* Mention Autocomplete Dropdown */}
                  {activeMentionQuery && mentionSuggestions.length > 0 && (
                    <div
                      data-testid="composer-mention-suggestions"
                      className="mt-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-1.5 space-y-0.5 max-h-48 overflow-y-auto"
                    >
                      <p className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <AtSign className="w-3 h-3 text-blue-600 dark:text-blue-400" /> Mention Creator
                      </p>
                      {mentionSuggestions.map((creator) => (
                        <button
                          key={creator.uid}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => insertMention(creator.handle)}
                          className="w-full min-h-[44px] px-2.5 py-2 rounded-xl flex items-center gap-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Avatar src={creator.avatarUrl} name={creator.displayName} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {creator.displayName}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              @{creator.handle}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Hashtag Autocomplete Dropdown */}
                  {activeHashtagQuery && hashtagSuggestions.length > 0 && (
                    <div
                      data-testid="composer-hashtag-suggestions"
                      className="mt-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-1.5 space-y-0.5 max-h-48 overflow-y-auto"
                    >
                      <p className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Hash className="w-3 h-3 text-blue-600 dark:text-blue-400" /> Add Hashtag
                      </p>
                      {hashtagSuggestions.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => insertHashtag(tag)}
                          className="w-full min-h-[44px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            #{tag}
                          </span>
                          <span className="text-[11px] text-slate-400">Insert</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Mention & Tag Helper Strip */}
                <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        const before = caption.slice(0, cursorPos);
                        const after = caption.slice(cursorPos);
                        const space = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
                        const next = `${before}${space}@${after}`;
                        setCaption(next);
                        const nextPos = before.length + space.length + 1;
                        setCursorPos(nextPos);
                        setTimeout(() => {
                          textareaRef.current?.focus();
                          textareaRef.current?.setSelectionRange(nextPos, nextPos);
                        }, 0);
                      }}
                      className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <AtSign className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Mention</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const before = caption.slice(0, cursorPos);
                        const after = caption.slice(cursorPos);
                        const space = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
                        const next = `${before}${space}#${after}`;
                        setCaption(next);
                        const nextPos = before.length + space.length + 1;
                        setCursorPos(nextPos);
                        setTimeout(() => {
                          textareaRef.current?.focus();
                          textareaRef.current?.setSelectionRange(nextPos, nextPos);
                        }, 0);
                      }}
                      className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Hash className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Tag</span>
                    </button>
                  </div>

                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    {caption.length}/1200
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Media Studio & Live Preview */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 sm:p-5 flex-1 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Media & Attachment Studio
                  </p>
                  {hasUploadedFile && (
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      Cloudflare R2 Ready
                    </span>
                  )}
                </div>

                <input
                  type="file"
                  accept="image/*,video/*,audio/*"
                  onChange={handleAllInOneFileChange}
                  className="hidden"
                  id="all-in-one-file-upload"
                />

                {parsedPreview ? (
                  <div
                    data-testid="composer-live-preview"
                    className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden"
                  >
                    <div className="px-3.5 py-2.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        Live Preview · {parsedPreview.kind}
                      </span>
                      <button
                        type="button"
                        onClick={clearAllMedia}
                        aria-label="Remove preview attachment"
                        className="min-h-[34px] px-2.5 rounded-lg text-xs font-medium text-slate-500 hover:text-red-600 dark:hover:text-red-400 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Remove</span>
                      </button>
                    </div>

                    {parsedPreview.kind === 'image' && (
                      <img
                        src={parsedPreview.url}
                        alt={parsedPreview.displayTitle}
                        className="w-full max-h-80 object-cover block"
                      />
                    )}

                    {(parsedPreview.kind === 'youtube' ||
                      parsedPreview.kind === 'vimeo') &&
                      parsedPreview.embedUrl && (
                        <div>
                          <div className="aspect-video bg-black">
                            <iframe
                              src={parsedPreview.embedUrl}
                              title={parsedPreview.displayTitle}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className="w-full h-full border-0"
                            />
                          </div>
                          <div className="p-3 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                {parsedPreview.displayTitle}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {parsedPreview.subtitle}
                              </p>
                            </div>
                            <Play className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                          </div>
                        </div>
                      )}

                    {parsedPreview.kind === 'video' && (
                      <div>
                        <video
                          src={parsedPreview.url}
                          controls
                          playsInline
                          className="w-full max-h-72 bg-black block"
                        />
                        <div className="p-3">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {parsedPreview.displayTitle}
                          </p>
                        </div>
                      </div>
                    )}

                    {parsedPreview.kind === 'audio' && (
                      <div className="p-4 space-y-2.5">
                        <div className="flex items-center gap-2.5">
                          <Music className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {parsedPreview.displayTitle}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {parsedPreview.subtitle}
                            </p>
                          </div>
                        </div>
                        <audio src={parsedPreview.url} controls className="w-full" />
                      </div>
                    )}

                    {parsedPreview.kind === 'link' && (
                      <div className="p-4 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider truncate">
                            <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                            {parsedPreview.hostname}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        </div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {parsedPreview.displayTitle}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {parsedPreview.url}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <label
                    htmlFor="all-in-one-file-upload"
                    className="flex-1 min-h-[220px] rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 bg-white/70 dark:bg-slate-950/60 p-6 flex flex-col items-center justify-center text-center gap-3 cursor-pointer transition-colors"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <ImagePlus className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {uploading
                          ? `Uploading${uploadProgress > 0 ? ` ${uploadProgress}%` : '...'}`
                          : 'Attach image, video, or audio'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                        Images up to 15 MB · Video & Audio up to 50 MB · Or paste a link in your post caption
                      </p>
                    </div>
                  </label>
                )}

                {uploading && (
                  <div className="space-y-1.5">
                    <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${Math.max(8, uploadProgress)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      Uploading media to Cloudflare R2 ({uploadProgress}%)
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Bottom Studio Bar */}
        <footer className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="all-in-one-file-upload"
              className="min-h-[44px] px-3.5 sm:px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer"
            >
              <File className="w-4 h-4" aria-hidden="true" />
              <span>
                {uploading
                  ? `Uploading${uploadProgress > 0 ? ` ${uploadProgress}%` : '...'}`
                  : hasUploadedFile
                    ? 'Replace'
                    : 'Add File'}
              </span>
            </label>

            <button
              type="button"
              onClick={() => setGifPickerOpen(true)}
              className="min-h-[44px] px-3 sm:px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span className="px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-500 font-bold text-[10px]">
                GIF
              </span>
              <span className="hidden xs:inline">Choose GIF</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              className="hidden sm:inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploading}
              className="min-h-[44px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Publishing...' : 'Publish Post'}
            </button>
          </div>
        </footer>
      </form>

      <GifPickerModal
        open={gifPickerOpen}
        onClose={() => setGifPickerOpen(false)}
        onSelectGif={handleSelectGif}
      />
    </div>
  );
}
