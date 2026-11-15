import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Search, X } from 'lucide-react';
import type { Post, PostComment, StoryGroup, UserProfile } from '../types/social';
import { filterMediaPosts, paginateFeed } from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { MediaViewerModal } from './MediaViewerModal';
import { PostCard } from './PostCard';
import { StoriesStrip } from './StoriesStrip';

interface FeedViewProps {
  profile: UserProfile;
  posts: Post[];
  storyGroups: StoryGroup[];
  commentsByPost: Record<string, PostComment[]>;
  likedPostIds: string[];
  bookmarkedPostIds: string[];
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onOpenComposer: () => void;
  onOpenStory: (group: StoryGroup) => void;
  onOpenAddStory: () => void;
  onToggleLike: (post: Post) => void;
  onToggleBookmark: (postId: string) => void;
  onAddComment: (post: Post, text: string) => Promise<void>;
  onDeletePost?: (post: Post) => Promise<void>;
  onDeleteComment?: (post: Post, commentId: string) => Promise<void>;
  onShareToStory: (post: Post) => Promise<unknown> | void;
  onAuthorClick: (post: Post) => void;
  onMentionClick?: (handle: string) => void;
  onSelectHashtag?: (tag: string) => void;
}

const PAGE_SIZE = 4;

export function FeedView({
  profile,
  posts,
  storyGroups,
  commentsByPost,
  likedPostIds,
  bookmarkedPostIds,
  searchQuery: externalSearchQuery,
  onSearchQueryChange,
  onOpenComposer,
  onOpenStory,
  onOpenAddStory,
  onToggleLike,
  onToggleBookmark,
  onAddComment,
  onDeletePost,
  onDeleteComment,
  onShareToStory,
  onAuthorClick,
  onMentionClick,
  onSelectHashtag,
}: FeedViewProps) {
  const [internalQuery, setInternalQuery] = useState('');
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalQuery;
  const setSearchQuery = (q: string) => {
    if (onSearchQueryChange) onSearchQueryChange(q);
    else setInternalQuery(q);
  };
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeMediaPostId, setActiveMediaPostId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { items, filteredTotal, hasMore } = paginateFeed(
    posts,
    PAGE_SIZE,
    visibleCount,
    'All',
    searchQuery
  );

  const mediaEntries = useMemo(() => filterMediaPosts(posts), [posts]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery]);

  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const node = sentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setLoadingMore(true);
          window.requestAnimationFrame(() => {
            setVisibleCount((prev) => prev + PAGE_SIZE);
            setLoadingMore(false);
          });
        }
      },
      { rootMargin: '180px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, items.length]);

  return (
    <section aria-label="Community Post Feed" className="space-y-4">
      {/* Homefeed Header Stories */}
      <StoriesStrip
        profile={profile}
        storyGroups={storyGroups}
        onOpenStory={onOpenStory}
        onOpenAddStory={onOpenAddStory}
      />

      {/* Quick Post Prompt */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
        <Avatar src={profile.avatarUrl} name={profile.displayName} size="md" />
        <button
          type="button"
          onClick={onOpenComposer}
          className="flex-1 min-h-[44px] px-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-left text-sm text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
        >
          Share a note or photo, {profile.displayName.split(' ')[0]}...
        </button>
        <button
          type="button"
          onClick={onOpenComposer}
          aria-label="Upload photo post"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <ImagePlus className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <label htmlFor="feed-search" className="sr-only">
          Search posts and creators
        </label>
        <Search
          className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />
        <input
          id="feed-search"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search posts or creators..."
          className="w-full min-h-[44px] pl-10 pr-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Feed Cards */}
      {items.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
          <p className="text-sm font-semibold">
            {posts.length === 0 ? 'No posts yet' : 'No matching posts'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {posts.length === 0
              ? 'Be the first to share a note, photo, video, or link with the community.'
              : 'Try clearing your search to view all posts.'}
          </p>
          {posts.length === 0 && (
            <button
              type="button"
              onClick={onOpenComposer}
              className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
            >
              Create First Post
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={profile.uid}
              isLiked={likedPostIds.includes(post.id)}
              isBookmarked={bookmarkedPostIds.includes(post.id)}
              comments={commentsByPost[post.id] || []}
              onToggleLike={onToggleLike}
              onToggleBookmark={onToggleBookmark}
              onAddComment={onAddComment}
              onDeletePost={onDeletePost}
              onDeleteComment={onDeleteComment}
              onShareToStory={onShareToStory}
              onAuthorClick={onAuthorClick}
              onSelectHashtag={(tag) => {
                setSearchQuery(`#${tag}`);
                onSelectHashtag?.(tag);
              }}
              onMentionClick={onMentionClick}
              onOpenMedia={(clickedPost) => setActiveMediaPostId(clickedPost.id)}
            />
          ))}
        </div>
      )}

      {/* Infinite Scroll Sentinel */}
      <div ref={sentinelRef} className="py-4 text-center">
        {hasMore ? (
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            className="min-h-[42px] px-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer tabular-nums"
          >
            {loadingMore
              ? 'Loading more posts...'
              : `Load more (${items.length} of ${filteredTotal})`}
          </button>
        ) : (
          filteredTotal > 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              Showing all {filteredTotal} posts
            </p>
          )
        )}
      </div>

      <MediaViewerModal
        open={Boolean(activeMediaPostId)}
        entries={mediaEntries}
        activePostId={activeMediaPostId}
        currentUserId={profile.uid}
        likedPostIds={likedPostIds}
        bookmarkedPostIds={bookmarkedPostIds}
        onClose={() => setActiveMediaPostId(null)}
        onSelectPostId={(postId) => setActiveMediaPostId(postId)}
        onToggleLike={onToggleLike}
        onToggleBookmark={onToggleBookmark}
        onShareToStory={onShareToStory}
        onAuthorClick={onAuthorClick}
        onSelectHashtag={(tag) => {
          setSearchQuery(`#${tag}`);
          onSelectHashtag?.(tag);
        }}
        onMentionClick={onMentionClick}
      />
    </section>
  );
}
