import { useState } from 'react';
import { Clock, Eye, EyeOff, FileAudio, Image as ImageIcon, Link2, Search, Trash2, Video } from 'lucide-react';
import type { Post, PostCategory, StoryGroup } from '../../src/types/social';
import { formatRelativeTime, POST_CATEGORIES } from '../../src/utils/socialLogic';

interface ContentModerationSectionProps {
  posts: Post[];
  storyGroups: StoryGroup[];
  hiddenSet: Set<string>;
  postSearch: string;
  postCategory: 'All' | PostCategory | 'Hidden';
  onChangePostSearch: (q: string) => void;
  onChangePostCategory: (cat: 'All' | PostCategory | 'Hidden') => void;
  onToggleHidePost: (postId: string) => void;
  onDeletePost: (postId: string) => Promise<void>;
  onDeleteStory: (storyId: string) => Promise<void>;
}

export function ContentModerationSection({
  posts,
  storyGroups,
  hiddenSet,
  postSearch,
  postCategory,
  onChangePostSearch,
  onChangePostCategory,
  onToggleHidePost,
  onDeletePost,
  onDeleteStory,
}: ContentModerationSectionProps) {
  const [subTab, setSubTab] = useState<'posts' | 'stories'>('posts');
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const flatStories = storyGroups.flatMap((group) => group.items);
  const nowMs = Date.now();

  const handleConfirmDeletePost = async (postId: string) => {
    setBusyId(postId);
    await onDeletePost(postId);
    setBusyId(null);
    setConfirmDeletePostId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Feed &amp; Stories Moderation
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Hide, restore, or permanently remove feed posts and 24-hour story frames.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start">
          <button
            type="button"
            onClick={() => setSubTab('posts')}
            className={`min-h-[34px] px-3 rounded-md text-xs font-semibold cursor-pointer tabular-nums ${
              subTab === 'posts'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Feed Posts ({posts.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('stories')}
            className={`min-h-[34px] px-3 rounded-md text-xs font-semibold cursor-pointer tabular-nums ${
              subTab === 'stories'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Stories ({flatStories.length})
          </button>
        </div>
      </div>

      {subTab === 'posts' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search posts for moderation"
                value={postSearch}
                onChange={(e) => onChangePostSearch(e.target.value)}
                placeholder="Search caption or author"
                className="w-full min-h-[40px] pl-9 pr-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              aria-label="Filter posts by category"
              value={postCategory}
              onChange={(e) =>
                onChangePostCategory(e.target.value as 'All' | PostCategory | 'Hidden')
              }
              className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="All">All Categories</option>
              <option value="Hidden">Hidden Only</option>
              {POST_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {posts.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No posts match the current moderation filter.
              </div>
            ) : (
              posts.map((post) => {
                const isHidden = hiddenSet.has(post.id);
                const confirming = confirmDeletePostId === post.id;
                return (
                  <article
                    key={post.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {post.authorName}
                        </span>
                        <span>@{post.authorHandle}</span>
                        <span aria-hidden="true">·</span>
                        <span>{post.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatRelativeTime(post.createdAtMs)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-mono font-semibold ${
                            isHidden
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {isHidden ? 'HIDDEN' : 'LIVE'}
                        </span>
                      </div>

                      <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 max-w-[68ch]">
                        {post.caption || post.mediaTitle || 'Media post'}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        <span>
                          {post.likesCount} likes · {post.commentsCount} comments
                        </span>
                        {post.imageUrl && (
                          <span className="inline-flex items-center gap-1">
                            <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" /> Image
                          </span>
                        )}
                        {post.videoUrl && (
                          <span className="inline-flex items-center gap-1">
                            <Video className="w-3.5 h-3.5" aria-hidden="true" /> Video
                          </span>
                        )}
                        {post.audioUrl && (
                          <span className="inline-flex items-center gap-1">
                            <FileAudio className="w-3.5 h-3.5" aria-hidden="true" /> Voice Note
                          </span>
                        )}
                        {post.linkUrl && (
                          <span className="inline-flex items-center gap-1">
                            <Link2 className="w-3.5 h-3.5" aria-hidden="true" /> Rich Link
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleHidePost(post.id)}
                        className="min-h-[38px] px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        {isHidden ? (
                          <>
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Restore Post</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Hide Post</span>
                          </>
                        )}
                      </button>

                      {confirming ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === post.id}
                            onClick={() => void handleConfirmDeletePost(post.id)}
                            className="min-h-[38px] px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePostId(null)}
                            className="min-h-[38px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePostId(post.id)}
                          aria-label={`Delete post by ${post.authorName}`}
                          className="min-h-[38px] px-3 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {flatStories.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No active stories found in the workspace.
            </div>
          ) : (
            flatStories.map((story) => {
              const expired = story.expiresAtMs <= nowMs;
              return (
                <div
                  key={story.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {story.authorName}
                      </span>
                      <span>@{story.authorHandle}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {formatRelativeTime(story.createdAtMs)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-mono font-semibold ${
                          expired
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {expired ? 'EXPIRED TTL' : 'ACTIVE 24H'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      {story.caption || 'Visual story frame'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void onDeleteStory(story.id)}
                    className="min-h-[38px] px-3 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Remove Story</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
