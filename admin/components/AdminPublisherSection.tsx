import { useMemo, useState } from 'react';
import { Clock, Link2, Megaphone, PlusCircle, Send, Sparkles, Trash2, Upload } from 'lucide-react';
import {
  computeHashtagStats,
  type AnnouncementAudience,
  type AnnouncementSeverity,
} from '../adminLogic';
import type { Post, PostCategory, UserProfile } from '../../src/types/social';
import { POST_CATEGORIES } from '../../src/utils/socialLogic';
import { VerifiedBadge } from '../../src/components/VerifiedBadge';

interface AdminPublisherSectionProps {
  currentProfile: UserProfile;
  communityUsers?: UserProfile[];
  posts?: Post[];
  savedHashtags?: string[];
  dynamicHashtags?: string[];
  onCreateHashtag?: (
    rawTag: string
  ) => Promise<{ ok: boolean; tag?: string; error?: string }>;
  onDeleteHashtag?: (tag: string) => Promise<{ ok: boolean; error?: string }>;
  onUploadMedia?: (
    file: File,
    folder: 'posts' | 'stories'
  ) => Promise<{ ok: boolean; url?: string; kind?: string; error?: string }>;
  onPublishPost: (input: {
    caption: string;
    category: PostCategory;
    imageUrl: string;
    videoUrl?: string;
    linkUrl?: string;
    mediaTitle?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onPublishStory?: (input: {
    caption: string;
    imageUrl: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onPublishAnnouncement: (input: {
    title: string;
    body: string;
    severity: AnnouncementSeverity;
    audience: AnnouncementAudience;
  }) => Promise<{ ok: boolean; error?: string }>;
}

const SAMPLE_IMAGE_PRESETS = [
  { label: 'Modern Architecture', url: '/images/post_architecture_1794518948238.jpg' },
  { label: 'Alpine Trail', url: '/images/post_alpine_trail_1794518949014.jpg' },
  { label: 'Studio Workspace', url: '/images/post_cafe_workspace_1794518949649.jpg' },
  { label: 'Portrait Feature', url: '/images/avatar_elena_1794518948136.jpg' },
];

export function AdminPublisherSection({
  currentProfile,
  communityUsers = [],
  posts = [],
  savedHashtags = [],
  dynamicHashtags = [],
  onCreateHashtag,
  onDeleteHashtag,
  onUploadMedia,
  onPublishPost,
  onPublishStory,
  onPublishAnnouncement,
}: AdminPublisherSectionProps) {
  const [publisherTab, setPublisherTab] = useState<'post' | 'story' | 'announcement'>('post');

  // Post state
  const [postCaption, setPostCaption] = useState('');
  const [postCategory, setPostCategory] = useState<PostCategory>('Architecture');
  const [postImageUrl, setPostImageUrl] = useState(SAMPLE_IMAGE_PRESETS[0].url);
  const [postVideoUrl, setPostVideoUrl] = useState('');
  const [postLinkUrl, setPostLinkUrl] = useState('');
  const [postMediaTitle, setPostMediaTitle] = useState('');
  const [uploadingPostMedia, setUploadingPostMedia] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [savingTag, setSavingTag] = useState(false);
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [postFeedback, setPostFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Story state
  const [storyCaption, setStoryCaption] = useState('');
  const [storyImageUrl, setStoryImageUrl] = useState(SAMPLE_IMAGE_PRESETS[0].url);
  const [uploadingStoryMedia, setUploadingStoryMedia] = useState(false);
  const [storySubmitting, setStorySubmitting] = useState(false);
  const [storyFeedback, setStoryFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Announcement state
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annSeverity, setAnnSeverity] = useState<AnnouncementSeverity>('info');
  const [annAudience, setAnnAudience] = useState<AnnouncementAudience>('all');
  const [annSubmitting, setAnnSubmitting] = useState(false);
  const [annFeedback, setAnnFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const hashtagStats = useMemo(
    () => computeHashtagStats(savedHashtags, dynamicHashtags, posts),
    [dynamicHashtags, posts, savedHashtags]
  );

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postCaption.trim() && !postImageUrl.trim() && !postVideoUrl.trim() && !postLinkUrl.trim()) {
      return;
    }
    setPostSubmitting(true);
    setPostFeedback(null);
    const res = await onPublishPost({
      caption: postCaption.trim(),
      category: postCategory,
      imageUrl: postImageUrl.trim(),
      videoUrl: postVideoUrl.trim() || undefined,
      linkUrl: postLinkUrl.trim() || undefined,
      mediaTitle: postMediaTitle.trim() || undefined,
    });
    setPostSubmitting(false);
    if (!res.ok) {
      setPostFeedback({ type: 'err', text: res.error || 'Failed to publish post.' });
      return;
    }
    setPostFeedback({
      type: 'ok',
      text: 'Post published successfully to global feed with master admin blue tick!',
    });
    setPostCaption('');
    setPostVideoUrl('');
    setPostLinkUrl('');
    setPostMediaTitle('');
  };

  const handleStorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onPublishStory) return;
    if (!storyImageUrl.trim() && !storyCaption.trim()) {
      setStoryFeedback({ type: 'err', text: 'Provide a story image URL or caption.' });
      return;
    }
    setStorySubmitting(true);
    setStoryFeedback(null);
    const res = await onPublishStory({
      caption: storyCaption.trim(),
      imageUrl: storyImageUrl.trim(),
    });
    setStorySubmitting(false);
    if (!res.ok) {
      setStoryFeedback({ type: 'err', text: res.error || 'Failed to publish story.' });
      return;
    }
    setStoryCaption('');
    setStoryFeedback({ type: 'ok', text: '24-hour Story published to the community story bar.' });
  };

  const handlePostFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUploadMedia) return;
    setUploadingPostMedia(true);
    setPostFeedback(null);
    const res = await onUploadMedia(file, 'posts');
    setUploadingPostMedia(false);
    if (!res.ok || !res.url) {
      setPostFeedback({ type: 'err', text: res.error || 'Cloudflare R2 upload failed.' });
      return;
    }
    if (res.kind === 'video') {
      setPostVideoUrl(res.url);
      setPostImageUrl('');
    } else {
      setPostImageUrl(res.url);
      setPostVideoUrl('');
    }
    setPostFeedback({ type: 'ok', text: 'Uploaded media directly to Cloudflare R2.' });
  };

  const handleStoryFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUploadMedia) return;
    setUploadingStoryMedia(true);
    setStoryFeedback(null);
    const res = await onUploadMedia(file, 'stories');
    setUploadingStoryMedia(false);
    if (!res.ok || !res.url) {
      setStoryFeedback({ type: 'err', text: res.error || 'Story R2 upload failed.' });
      return;
    }
    setStoryImageUrl(res.url);
    setStoryFeedback({ type: 'ok', text: 'Story image uploaded to Cloudflare R2.' });
  };

  const handleAnnouncementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    setAnnSubmitting(true);
    setAnnFeedback(null);
    const res = await onPublishAnnouncement({
      title: annTitle.trim(),
      body: annBody.trim(),
      severity: annSeverity,
      audience: annAudience,
    });
    setAnnSubmitting(false);
    if (!res.ok) {
      setAnnFeedback({ type: 'err', text: res.error || 'Failed to publish announcement.' });
      return;
    }
    setAnnFeedback({ type: 'ok', text: 'Platform announcement published successfully.' });
    setAnnTitle('');
    setAnnBody('');
  };

  const insertTag = (tag: string) => {
    setPostCaption((prev) => (prev ? `${prev} #${tag}` : `#${tag}`));
  };

  const insertMention = (handle: string) => {
    setPostCaption((prev) => (prev ? `${prev} @${handle}` : `@${handle}`));
  };

  const handleSaveCustomTag = async () => {
    if (!onCreateHashtag || !newTagInput.trim() || savingTag) return;
    setSavingTag(true);
    setPostFeedback(null);
    const res = await onCreateHashtag(newTagInput);
    setSavingTag(false);
    if (!res.ok || !res.tag) {
      setPostFeedback({ type: 'err', text: res.error || 'Could not save hashtag.' });
      return;
    }
    setNewTagInput('');
    insertTag(res.tag);
    setPostFeedback({ type: 'ok', text: `Saved #${res.tag} to community hashtags.` });
  };

  const displayTags = savedHashtags.length > 0
    ? savedHashtags.slice(0, 10)
    : ['architecture', 'design', 'looma', 'urban', 'release'];
  const mentionMembers = communityUsers.filter((u) => u.uid !== currentProfile.uid).slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Admin Publisher Hub</span>
            <VerifiedBadge size={20} title="Master Admin Verified" />
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Publish official posts with master admin blue tick verification, hashtags, user mentions, and global workspace announcements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start">
          <button
            type="button"
            onClick={() => setPublisherTab('post')}
            className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              publisherTab === 'post'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Create Post
          </button>
          {onPublishStory && (
            <button
              type="button"
              onClick={() => setPublisherTab('story')}
              className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                publisherTab === 'story'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Publish Story (24h)
            </button>
          )}
          <button
            type="button"
            onClick={() => setPublisherTab('announcement')}
            className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              publisherTab === 'announcement'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Announcement Banner
          </button>
        </div>
      </div>

      {publisherTab === 'post' ? (
        <form
          onSubmit={handlePostSubmit}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
        >
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold font-display">
              {currentProfile.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm text-slate-900 dark:text-white">
                  {currentProfile.displayName}
                </span>
                <VerifiedBadge size={15} />
                <span className="text-xs font-mono text-blue-600 dark:text-blue-400 font-semibold">
                  (Master Admin Publisher)
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                @{currentProfile.handle} · Posts instantly appear in public feeds with verified badge
              </p>
            </div>
          </div>

          {postFeedback && (
            <div
              role="status"
              className={`rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium ${
                postFeedback.type === 'err'
                  ? 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                  : 'border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {postFeedback.text}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Post Category
              </span>
              <select
                value={postCategory}
                onChange={(e) => setPostCategory(e.target.value as PostCategory)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
              >
                {POST_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Media Image URL or R2 Upload
                </span>
                <div className="flex items-center gap-2">
                  {onUploadMedia && (
                    <label className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer inline-flex items-center gap-1">
                      <Upload className="w-3 h-3" aria-hidden="true" />
                      <span>{uploadingPostMedia ? 'Uploading...' : 'Upload R2 Media'}</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        disabled={uploadingPostMedia}
                        onChange={(e) => void handlePostFileUpload(e)}
                        className="sr-only"
                      />
                    </label>
                  )}
                  {(postImageUrl || postVideoUrl) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPostImageUrl('');
                        setPostVideoUrl('');
                      }}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Text Only
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                aria-label="Post image or media URL"
                value={postVideoUrl || postImageUrl}
                onChange={(e) => {
                  setPostVideoUrl('');
                  setPostImageUrl(e.target.value);
                }}
                placeholder="/images/post_architecture_1794518948238.jpg or R2 URL"
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                <span>Reference Link URL (optional)</span>
              </span>
              <input
                type="url"
                value={postLinkUrl}
                onChange={(e) => setPostLinkUrl(e.target.value)}
                placeholder="https://example.com/release-notes"
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Link / Media Title (optional)
              </span>
              <input
                type="text"
                maxLength={120}
                value={postMediaTitle}
                onChange={(e) => setPostMediaTitle(e.target.value)}
                placeholder="Optional editorial card title"
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
              />
            </label>
          </div>

          {/* Preset Images */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Quick Preset Photos
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SAMPLE_IMAGE_PRESETS.map((preset) => (
                <button
                  key={preset.url}
                  type="button"
                  onClick={() => setPostImageUrl(preset.url)}
                  className={`relative rounded-xl overflow-hidden border-2 text-left p-2 transition-all cursor-pointer ${
                    postImageUrl === preset.url
                      ? 'border-blue-600 ring-2 ring-blue-600/20'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="aspect-[16/9] rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 mb-1">
                    <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate block">
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Post Caption (supports #hashtags and @mentions)
            </span>
            <textarea
              required
              rows={4}
              value={postCaption}
              onChange={(e) => setPostCaption(e.target.value)}
              placeholder="Share an official update, architectural feature, or community announcement..."
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white resize-none"
            />
          </label>

          {/* Hashtags & Member Mentions Builder */}
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Saved Tags:</span>
              {displayTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => insertTag(tag)}
                  className="min-h-[30px] px-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-mono font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer"
                >
                  #{tag}
                </button>
              ))}
            </div>

            {onCreateHashtag && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="New hashtag (e.g. looma_release)"
                  aria-label="Create and save new hashtag"
                  className="min-h-[38px] px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="button"
                  disabled={savingTag || !newTagInput.trim()}
                  onClick={() => void handleSaveCustomTag()}
                  className="min-h-[38px] px-3.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{savingTag ? 'Saving...' : 'Create & Save Hashtag'}</span>
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Mention Member:</span>
              {mentionMembers.length > 0 ? (
                mentionMembers.map((member) => (
                  <button
                    key={member.uid}
                    type="button"
                    onClick={() => insertMention(member.handle)}
                    className="min-h-[30px] px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-mono font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    @{member.handle}
                  </button>
                ))
              ) : (
                ['admin', 'community', 'moderator'].map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    onClick={() => insertMention(handle)}
                    className="min-h-[30px] px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-mono font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    @{handle}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={postSubmitting || (!postCaption.trim() && !postImageUrl.trim() && !postVideoUrl.trim() && !postLinkUrl.trim())}
              className="min-h-[42px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 shadow-lg shadow-blue-600/20"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>{postSubmitting ? 'Publishing...' : 'Publish Official Post'}</span>
            </button>
          </div>
        </form>
      ) : publisherTab === 'story' && onPublishStory ? (
        <form
          onSubmit={handleStorySubmit}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
        >
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Clock className="w-5 h-5" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Publish Official 24-Hour Story
            </h2>
          </div>

          {storyFeedback && (
            <div
              role="status"
              className={`rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium ${
                storyFeedback.type === 'err'
                  ? 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                  : 'border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {storyFeedback.text}
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Story Visual Image URL
              </span>
              {onUploadMedia && (
                <label className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer inline-flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{uploadingStoryMedia ? 'Uploading...' : 'Upload R2 Story Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingStoryMedia}
                    onChange={(e) => void handleStoryFileUpload(e)}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
            <input
              type="text"
              value={storyImageUrl}
              onChange={(e) => setStoryImageUrl(e.target.value)}
              placeholder="/images/post_architecture_1794518948238.jpg"
              className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
            />
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Story Overlay Caption (max 280 chars)
            </span>
            <input
              type="text"
              maxLength={280}
              value={storyCaption}
              onChange={(e) => setStoryCaption(e.target.value)}
              placeholder="e.g. Live studio spotlight from Looma HQ"
              className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
            />
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={storySubmitting || (!storyImageUrl.trim() && !storyCaption.trim())}
              className="min-h-[42px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>{storySubmitting ? 'Publishing...' : 'Publish 24h Story'}</span>
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={handleAnnouncementSubmit}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
        >
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Megaphone className="w-5 h-5" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Publish Workspace Announcement Banner
            </h2>
          </div>

          {annFeedback && (
            <div
              role="status"
              className={`rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium ${
                annFeedback.type === 'err'
                  ? 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                  : 'border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {annFeedback.text}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Severity Level
              </span>
              <select
                value={annSeverity}
                onChange={(e) => setAnnSeverity(e.target.value as AnnouncementSeverity)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
              >
                <option value="info">Info / Notice</option>
                <option value="warning">Warning / Alert</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Target Audience
              </span>
              <select
                value={annAudience}
                onChange={(e) => setAnnAudience(e.target.value as AnnouncementAudience)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
              >
                <option value="all">All Members</option>
                <option value="verified">Verified Members Only</option>
                <option value="admins">Admins Only</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Announcement Title
            </span>
            <input
              type="text"
              required
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              placeholder="e.g. Scheduled Platform Upgrade & New Features"
              className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Announcement Body Message
            </span>
            <textarea
              required
              rows={4}
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              placeholder="Provide details about the announcement or maintenance notice..."
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-white resize-none"
            />
          </label>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={annSubmitting || !annTitle.trim() || !annBody.trim()}
              className="min-h-[42px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 shadow-lg shadow-blue-600/20"
            >
              <Megaphone className="w-4 h-4" aria-hidden="true" />
              <span>{annSubmitting ? 'Publishing...' : 'Publish Announcement Banner'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Hashtag Registry Governance */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Community Hashtags Registry
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live tag usage across posts and deletion controls for saved dynamic hashtags.
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {hashtagStats.length} tags
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {hashtagStats.map((item) => (
            <div
              key={item.tag}
              className="px-6 py-3 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0 text-xs">
                <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 truncate">
                  #{item.tag}
                </span>
                <span className="text-slate-400" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                  {item.postCount} post{item.postCount === 1 ? '' : 's'}
                </span>
                <span className="text-slate-400" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {item.isDynamic ? 'Saved in Firestore' : 'Core Preset'}
                </span>
              </div>

              {onDeleteHashtag && item.isDynamic && (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await onDeleteHashtag(item.tag);
                    setPostFeedback(
                      res.ok
                        ? { type: 'ok', text: `Deleted #${item.tag} from saved hashtags.` }
                        : { type: 'err', text: res.error || `Could not delete #${item.tag}.` }
                    );
                  }}
                  aria-label={`Delete hashtag #${item.tag}`}
                  className="min-h-[34px] px-3 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
