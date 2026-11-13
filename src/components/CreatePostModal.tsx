import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AtSign,
  ExternalLink,
  File,
  Globe,
  Hash,
  Music,
  Play,
  Trash2,
  X,
} from 'lucide-react';
import type { PostCategory, UserProfile } from '../types/social';
import {
  POPULAR_HASHTAGS,
  extractFirstUrl,
  filterCreatorsForMention,
  filterHashtags,
  getHashtagQueryAtCursor,
  getMentionQueryAtCursor,
  parseRichUrl,
  validatePostInput,
} from '../utils/socialLogic';
import { SEED_CREATORS } from '../services/seedData';
import {
  deleteUploadedMedia,
  uploadMediaToCloudflareR2,
} from '../services/storage';
import { Avatar } from './Avatar';

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [cursorPos, setCursorPos] = useState<number>(0);

  const allCandidateCreators = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const c of SEED_CREATORS) {
      if (c.uid !== profile.uid) map.set(c.handle.toLowerCase(), c);
    }
    for (const c of communityUsers) {
      if (c.uid !== profile.uid) map.set(c.handle.toLowerCase(), c);
    }
    return Array.from(map.values());
  }, [communityUsers, profile.uid]);

  const activeMentionQuery = useMemo(
    () => getMentionQueryAtCursor(caption, cursorPos),
    [caption, cursorPos]
  );
  const activeHashtagQuery = useMemo(
    () => getHashtagQueryAtCursor(caption, cursorPos),
    [caption, cursorPos]
  );

  const mentionSuggestions = useMemo(
    () =>
      activeMentionQuery
        ? filterCreatorsForMention(activeMentionQuery.query, allCandidateCreators)
        : [],
    [activeMentionQuery, allCandidateCreators]
  );

  const hashtagSuggestions = useMemo(
    () =>
      activeHashtagQuery
        ? filterHashtags(activeHashtagQuery.query)
        : [],
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
    if (!activeHashtagQuery) {
      const before = caption.slice(0, cursorPos);
      const after = caption.slice(cursorPos);
      const space = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
      const next = `${before}${space}#${tag} ${after}`;
      setCaption(next);
      const nextPos = before.length + space.length + tag.length + 2;
      setCursorPos(nextPos);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nextPos, nextPos);
        }
      }, 0);
      return;
    }
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
        ? parseRichUrl(effectivePreviewUrl, mediaTitle.trim() || undefined)
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
      const cleanTitle = file.name.replace(/\.[a-z0-9]+$/i, '');
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
    let finalMediaTitle = mediaTitle.trim();

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
          finalMediaTitle = detectedParsed.displayTitle;
        }
      }
    }

    const hasAttachment = Boolean(
      finalImageUrl || finalVideoUrl || finalAudioUrl || finalLinkUrl
    );
    const check = validatePostInput(caption, DEFAULT_CATEGORY, hasAttachment);
    if (!check.valid) {
      setError(check.error || 'Write a caption or attach a file before posting.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onCreatePost(caption, DEFAULT_CATEGORY, finalImageUrl, {
        videoUrl: finalVideoUrl,
        audioUrl: finalAudioUrl,
        linkUrl: finalLinkUrl,
        mediaTitle: finalMediaTitle,
      });
      setCaption('');
      setImageUrl('');
      setVideoUrl('');
      setAudioUrl('');
      setMediaTitle('');
      setDismissedCaptionUrl(null);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-post-title"
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4"
    >
      <div className="w-full md:max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-t-3xl md:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
        {/* Mobile grab handle */}
        <div className="md:hidden pt-3 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
          <h2 id="create-post-title" className="font-display text-base font-bold">
            Create Post
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close create post modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar
              src={profile.avatarUrl}
              name={profile.displayName}
              size="sm"
            />
            <div className="text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {profile.displayName}
              </span>{' '}
              <span aria-hidden="true">·</span> @{profile.handle}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="post-caption" className="sr-only">
              Post caption or paste a link
            </label>
            <div className="relative">
              <textarea
                ref={textareaRef}
                id="post-caption"
                rows={3}
                value={caption}
                onChange={handleCaptionChange}
                onClick={(e) => setCursorPos(e.currentTarget.selectionStart || 0)}
                onKeyUp={(e) => setCursorPos(e.currentTarget.selectionStart || 0)}
                onSelect={(e) => setCursorPos(e.currentTarget.selectionStart || 0)}
                placeholder="Write thoughts, tag creators with @handle, or topics with #hashtag..."
                maxLength={1200}
                className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
              />

              {/* Mention Autocomplete Dropdown */}
              {activeMentionQuery && mentionSuggestions.length > 0 && (
                <div
                  data-testid="composer-mention-suggestions"
                  className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1.5 space-y-0.5"
                >
                  <p className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <AtSign className="w-3 h-3 text-blue-600 dark:text-blue-400" /> Mention Creator
                  </p>
                  {mentionSuggestions.map((creator) => (
                    <button
                      key={creator.uid}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(creator.handle);
                      }}
                      className="w-full px-2.5 py-2 rounded-xl flex items-center gap-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
                  className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1.5 space-y-0.5"
                >
                  <p className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Hash className="w-3 h-3 text-blue-600 dark:text-blue-400" /> Trending Hashtags
                  </p>
                  {hashtagSuggestions.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertHashtag(tag);
                      }}
                      className="w-full px-2.5 py-2 rounded-xl flex items-center gap-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-xs font-medium text-slate-800 dark:text-slate-200"
                    >
                      <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                        #
                      </span>
                      <span>#{tag}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Tag and Mention Helper Strip */}
            <div className="flex items-center justify-between gap-2 pt-1 text-xs">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
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
                  className="min-h-[28px] px-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <AtSign className="w-3 h-3 text-blue-600 dark:text-blue-400" />
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
                  className="min-h-[28px] px-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Hash className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  <span>Tag</span>
                </button>

                {POPULAR_HASHTAGS.slice(0, 5).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertHashtag(tag)}
                    className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-medium shrink-0 cursor-pointer"
                  >
                    #{tag}
                  </button>
                ))}
              </div>

              <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                {caption.length}/1200
              </span>
            </div>
          </div>



          {/* Live Self-Preview Card inside Composer */}
          {parsedPreview && (
            <div
              data-testid="composer-live-preview"
              className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 overflow-hidden"
            >
              <div className="px-3.5 py-2 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Live Preview · {parsedPreview.kind}
                </span>
                <button
                  type="button"
                  onClick={clearAllMedia}
                  aria-label="Remove preview attachment"
                  className="min-h-[28px] px-2 rounded-lg text-[11px] font-medium text-slate-500 hover:text-red-600 dark:hover:text-red-400 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Remove</span>
                </button>
              </div>

              {parsedPreview.kind === 'image' && (
                <img
                  src={parsedPreview.url}
                  alt={parsedPreview.displayTitle}
                  className="w-full max-h-56 object-cover block"
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
                    className="w-full max-h-56 bg-black block"
                  />
                  <div className="p-3">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {parsedPreview.displayTitle}
                    </p>
                  </div>
                </div>
              )}

              {parsedPreview.kind === 'audio' && (
                <div className="p-3.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
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
                <div className="p-3.5 space-y-1">
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
          )}

          </div>

          <div className="shrink-0 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
            <input
              type="file"
              accept="image/*,video/*,audio/*"
              onChange={handleAllInOneFileChange}
              className="hidden"
              id="all-in-one-file-upload"
            />
            <label
              htmlFor="all-in-one-file-upload"
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer"
            >
              <File className="w-4 h-4" aria-hidden="true" />
              <span>
                {uploading
                  ? `Uploading${uploadProgress > 0 ? ` ${uploadProgress}%` : '...'}`
                  : hasUploadedFile
                    ? 'Replace File'
                    : 'Add File'}
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting || uploading}
              className="min-h-[44px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Publishing...' : 'Publish Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
