import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Search, X } from 'lucide-react';
import type {
  ChatThread,
  FeedFilter,
  FeedSortOrder,
  Post,
  PostCategory,
  PostComment,
  StoryGroup,
  UserProfile,
} from '../types/social';
import {
  filterAndSortFeed,
  filterMediaPosts,
  mergeCategoryNames,
  normalizeHashtag,
  POST_CATEGORIES,
} from '../utils/socialLogic';
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
  followedUserIds?: string[];
  shareThreads?: ChatThread[];
  categories?: string[];
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onOpenComposer: () => void;
  onOpenStory: (group: StoryGroup) => void;
  onOpenAddStory: () => void;
  onToggleLike: (post: Post) => void;
  onToggleBookmark: (postId: string) => void;
  onAddComment: (post: Post, text: string) => Promise<void>;
  onUpdatePost?: (
    post: Post,
    updates: { caption: string; category: PostCategory }
  ) => Promise<void>;
  onDeletePost?: (post: Post) => Promise<void>;
  onDeleteComment?: (post: Post, commentId: string) => Promise<void>;
  onShareToStory?: (post: Post) => Promise<unknown> | void;
  onShareToChat?: (thread: ChatThread, post: Post) => Promise<void>;
  onReportPost?: (post: Post, category: 'spam' | 'harassment' | 'misinformation' | 'nudity' | 'copyright' | 'other', reason: string) => Promise<void>;
  storiesEnabled?: boolean;
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
  followedUserIds = [],
  shareThreads = [],
  categories = POST_CATEGORIES,
  searchQuery: externalSearchQuery,
  onSearchQueryChange,
  onOpenComposer,
  onOpenStory,
  onOpenAddStory,
  onToggleLike,
  onToggleBookmark,
  onAddComment,
  onUpdatePost,
  onDeletePost,
  onDeleteComment,
  onShareToStory,
  onShareToChat,
  onReportPost,
  storiesEnabled = true,
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
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('All');
  const [sortOrder, setSortOrder] = useState<FeedSortOrder>('latest');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeMediaPostId, setActiveMediaPostId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { items, filteredTotal, hasMore } = filterAndSortFeed({
    posts,
    pageSize: PAGE_SIZE,
    visibleCount,
    filter: feedFilter,
    sortOrder,
    searchQuery,
    followedUserIds,
    currentUserId: profile.uid,
  });

  const mediaEntries = useMemo(() => filterMediaPosts(posts), [posts]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, feedFilter, sortOrder]);

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

  const categoryList = useMemo(
    () => mergeCategoryNames(categories, POST_CATEGORIES),
    [categories]
  );

  const filterOptions: { id: FeedFilter; label: string }[] = [
    { id: 'All', label: 'All' },
    { id: 'Following', label: 'Following' },
  ];

  const hasActiveFilterOrSearch =
    feedFilter !== 'All' || Boolean(searchQuery.trim());

  const activeHashtag = searchQuery.trim().startsWith('#')
    ? normalizeHashtag(searchQuery)
    : '';

  const applyHashtagFilter = (tag: string) => {
    const clean = normalizeHashtag(tag);
    setFeedFilter('All');
    setSearchQuery(clean ? `#${clean}` : '');
    onSelectHashtag?.(clean || tag);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <section aria-label="Community Post Feed" className="space-y-4">
      {/* Homefeed Header Stories */}
      {storiesEnabled && (
        <StoriesStrip
          profile={profile}
          storyGroups={storyGroups}
          onOpenStory={onOpenStory}
          onOpenAddStory={onOpenAddStory}
        />
      )}

      {/* Quick Post Prompt */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
        <Avatar src={profile.avatarUrl} name={profile.displayName} size="md" />
        <button
          type="button"
          onClick={onOpenComposer}
          className="flex-1 min-w-0 min-h-[44px] px-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-left text-sm text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer truncate"
        >
          Share a note or photo, {profile.displayName.split(' ')[0]}...
        </button>
        <button
          type="button"
          onClick={onOpenComposer}
          aria-label="Upload photo post"
          className="min-h-[44px] min-w-[44px] shrink-0 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <ImagePlus className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {/* Search & Feed Filter Controls */}
      <div className="space-y-2.5">
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

        <div
          data-testid="feed-filter-toolbar"
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <div
            role="tablist"
            aria-label="Feed streams"
            className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0"
          >
            {filterOptions.map((option) => {
              const selected = feedFilter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setFeedFilter(option.id)}
                  className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                    selected
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Sort feed posts"
            className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0"
          >
            <button
              type="button"
              aria-pressed={sortOrder === 'latest'}
              onClick={() => setSortOrder('latest')}
              className={`min-h-[30px] px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                sortOrder === 'latest'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Latest
            </button>
            <button
              type="button"
              aria-pressed={sortOrder === 'top'}
              onClick={() => setSortOrder('top')}
              className={`min-h-[30px] px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                sortOrder === 'top'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Most Liked
            </button>
          </div>
        </div>

        {activeHashtag && (
          <div
            data-testid="active-hashtag-filter"
            className="rounded-xl border border-blue-200 dark:border-blue-900/70 bg-blue-50/80 dark:bg-blue-950/30 px-3.5 py-2 flex items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-blue-700 dark:text-blue-300 truncate">
                #{activeHashtag}
              </span>
              <span className="text-slate-600 dark:text-slate-400 tabular-nums shrink-0">
                {filteredTotal} {filteredTotal === 1 ? 'post' : 'posts'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-blue-700 dark:text-blue-300 font-semibold hover:underline cursor-pointer shrink-0"
            >
              Clear filter
            </button>
          </div>
        )}
      </div>

      {/* Feed Cards */}
      {items.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
          <p className="text-sm font-semibold">
            {posts.length === 0
              ? 'No posts yet'
              : feedFilter === 'Following'
                ? 'No posts from people you follow yet'
                : 'No matching posts'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {posts.length === 0
              ? 'Be the first to share a note, photo, video, or link with the community.'
              : feedFilter === 'Following'
                ? 'Follow creators in Community Members or switch back to All posts.'
                : 'Try clearing your search or switching back to All posts.'}
          </p>
          {posts.length === 0 ? (
            <button
              type="button"
              onClick={onOpenComposer}
              className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
            >
              Create First Post
            </button>
          ) : hasActiveFilterOrSearch ? (
            <button
              type="button"
              onClick={() => {
                setFeedFilter('All');
                setSearchQuery('');
              }}
              className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
            >
              Show All Posts
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={profile.uid}
              categories={categoryList}
              isLiked={likedPostIds.includes(post.id)}
              isBookmarked={bookmarkedPostIds.includes(post.id)}
              comments={commentsByPost[post.id] || []}
              shareThreads={shareThreads}
              onToggleLike={onToggleLike}
              onToggleBookmark={onToggleBookmark}
              onAddComment={onAddComment}
              onUpdatePost={onUpdatePost}
              onDeletePost={onDeletePost}
              onDeleteComment={onDeleteComment}
              onShareToStory={storiesEnabled ? onShareToStory : undefined}
              onShareToChat={onShareToChat}
              onReportPost={onReportPost}
              onAuthorClick={onAuthorClick}
              onSelectHashtag={applyHashtagFilter}
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
        onSelectHashtag={applyHashtagFilter}
        onMentionClick={onMentionClick}
      />
    </section>
  );
}
