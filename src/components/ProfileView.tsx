import { useMemo, useState, type ReactNode } from 'react';
import {
  Building2,
  ExternalLink,
  Globe,
  MapPin,
  Plus,
  Settings,
  Users,
} from 'lucide-react';
import type { BusinessProfile } from '../types/business';
import type {
  ChatThread,
  ConnectionsTab,
  Post,
  PostCategory,
  PostComment,
  UserProfile,
} from '../types/social';
import {
  filterMediaPosts,
  isSafeExternalHttpUrl,
} from '../utils/socialLogic';
import { Avatar } from './Avatar';
import { MediaGalleryGrid } from './MediaGalleryGrid';
import { MediaViewerModal } from './MediaViewerModal';
import { PostCard } from './PostCard';
import { RichText } from './RichText';
import { VerifiedBadge } from './VerifiedBadge';

interface ProfileViewProps {
  profile: UserProfile;
  activeBusinessProfile?: BusinessProfile | null;
  canManageActiveBusiness?: boolean;
  profileSwitcherSlot?: ReactNode;
  posts: Post[];
  followersCount?: number;
  followingCount?: number;
  friendsCount: number;
  likedPostIds: string[];
  bookmarkedPostIds: string[];
  commentsByPost: Record<string, PostComment[]>;
  shareThreads?: ChatThread[];
  categories?: string[];
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
  onOpenSettings: () => void;
  onOpenConnections: (tab: ConnectionsTab) => void;
  onCreateBusinessPost?: (bp: BusinessProfile) => void;
  onAuthorClick: (post: Post) => void;
  onSelectHashtag?: (tag: string) => void;
  onMentionClick?: (handle: string) => void;
}

export function ProfileView({
  profile,
  activeBusinessProfile = null,
  canManageActiveBusiness = false,
  profileSwitcherSlot,
  posts,
  followersCount,
  followingCount,
  friendsCount,
  likedPostIds,
  bookmarkedPostIds,
  commentsByPost,
  shareThreads = [],
  categories,
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
  onOpenSettings,
  onOpenConnections,
  onCreateBusinessPost,
  onAuthorClick,
  onSelectHashtag,
  onMentionClick,
}: ProfileViewProps) {
  const [subTab, setSubTab] = useState<'posts' | 'media' | 'saved'>('posts');
  const [activeMediaPostId, setActiveMediaPostId] = useState<string | null>(null);

  const activeAuthorId = activeBusinessProfile
    ? activeBusinessProfile.id
    : profile.uid;
  const myPosts = useMemo(
    () => posts.filter((p) => p.authorId === activeAuthorId),
    [activeAuthorId, posts]
  );
  const myMediaEntries = useMemo(() => filterMediaPosts(myPosts), [myPosts]);
  const savedPosts = useMemo(
    () => posts.filter((p) => bookmarkedPostIds.includes(p.id)),
    [bookmarkedPostIds, posts]
  );
  const savedMediaEntries = useMemo(() => filterMediaPosts(savedPosts), [savedPosts]);
  const activeGalleryEntries =
    subTab === 'saved' ? savedMediaEntries : myMediaEntries;
  const displayedPosts = subTab === 'posts' ? myPosts : savedPosts;

  const displayedName = activeBusinessProfile
    ? activeBusinessProfile.displayName
    : profile.displayName;
  const displayedAvatar = activeBusinessProfile
    ? activeBusinessProfile.logoUrl
    : profile.avatarUrl;
  const displayedVerified = activeBusinessProfile
    ? activeBusinessProfile.verified
    : profile.isVerified;
  const displayedLocation = activeBusinessProfile
    ? activeBusinessProfile.location
    : profile.location;
  const displayedBio = activeBusinessProfile
    ? activeBusinessProfile.bio
    : profile.bio;
  const displayedFollowers = activeBusinessProfile
    ? activeBusinessProfile.followersCount
    : typeof followersCount === 'number'
      ? followersCount
      : profile.followersCount;
  const displayedFollowing =
    typeof followingCount === 'number' ? followingCount : profile.followingCount;

  return (
    <section aria-label="User Profile" className="space-y-5">
      <div
        data-testid="profile-card"
        className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <Avatar
              src={displayedAvatar}
              name={displayedName}
              size="xl"
            />
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span className="truncate">{displayedName}</span>
                {displayedVerified && <VerifiedBadge size={16} />}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {activeBusinessProfile
                  ? `/business/${activeBusinessProfile.slug}`
                  : `@${profile.handle}`}
                {displayedLocation && (
                  <>
                    {' '}
                    <span aria-hidden="true">·</span>{' '}
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                      {displayedLocation}
                    </span>
                  </>
                )}
              </p>

              {(activeBusinessProfile || profile.accountType === 'business') && (
                <p
                  data-testid="profile-unified-business-meta"
                  className="text-xs font-medium text-blue-700 dark:text-blue-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"
                >
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Business Profile</span>
                  </span>
                  {(activeBusinessProfile?.category || profile.businessCategory) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-600 dark:text-slate-300">
                        {activeBusinessProfile?.category || profile.businessCategory}
                      </span>
                    </>
                  )}
                  {isSafeExternalHttpUrl(
                    activeBusinessProfile?.websiteUrl || profile.businessWebsiteUrl
                  ) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <a
                        href={
                          activeBusinessProfile?.websiteUrl ||
                          profile.businessWebsiteUrl
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate max-w-[220px]">
                          {activeBusinessProfile?.websiteUrl ||
                            profile.businessWebsiteUrl}
                        </span>
                        <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                      </a>
                    </>
                  )}
                </p>
              )}

              {displayedBio && (
                <div className="text-sm text-slate-700 dark:text-slate-300 mt-2.5 max-w-xl leading-relaxed">
                  <RichText
                    text={displayedBio}
                    onHashtagClick={onSelectHashtag}
                    onMentionClick={onMentionClick}
                  />
                </div>
              )}

              {!activeBusinessProfile && profile.interests.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5">
                  {profile.interests.join(' · ')}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activeBusinessProfile && canManageActiveBusiness && onCreateBusinessPost ? (
              <button
                type="button"
                onClick={() => onCreateBusinessPost(activeBusinessProfile)}
                className="min-h-[42px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Create Post</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenConnections('followers')}
                className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Users className="w-4 h-4" aria-hidden="true" />
                <span>Connections</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenSettings}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              <span>Profile Settings</span>
            </button>
            {profileSwitcherSlot}
          </div>
        </div>

        {/* Profile Stats */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm tabular-nums">
          <div>
            <span className="font-bold text-slate-900 dark:text-white">
              {myPosts.length}
            </span>{' '}
            <span className="text-slate-500 dark:text-slate-400">
              {myPosts.length === 1 ? 'Post' : 'Posts'}
            </span>
          </div>
          {activeBusinessProfile ? (
            <div>
              <span className="font-bold text-slate-900 dark:text-white">
                {displayedFollowers}
              </span>{' '}
              <span className="text-slate-500 dark:text-slate-400">
                Followers
              </span>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenConnections('followers')}
                className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                <span className="font-bold text-slate-900 dark:text-white">
                  {displayedFollowers}
                </span>{' '}
                <span className="text-slate-500 dark:text-slate-400">
                  Followers
                </span>
              </button>
              <button
                type="button"
                onClick={() => onOpenConnections('following')}
                className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                <span className="font-bold text-slate-900 dark:text-white">
                  {displayedFollowing}
                </span>{' '}
                <span className="text-slate-500 dark:text-slate-400">
                  Following
                </span>
              </button>
              <button
                type="button"
                onClick={() => onOpenConnections('friends')}
                className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                <span className="font-bold text-slate-900 dark:text-white">
                  {friendsCount}
                </span>{' '}
                <span className="text-slate-500 dark:text-slate-400">
                  Friends
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Posts / Media / Saved Segmented Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setSubTab('posts')}
          className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
            subTab === 'posts'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Posts ({myPosts.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('media')}
          className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
            subTab === 'media'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Media ({myMediaEntries.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('saved')}
          className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
            subTab === 'saved'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Saved ({savedPosts.length})
        </button>
      </div>

      {subTab === 'media' ? (
        <MediaGalleryGrid
          entries={myMediaEntries}
          emptyMessage="No posted photos, videos, or audio tracks yet."
          onSelectEntry={(postId) => setActiveMediaPostId(postId)}
        />
      ) : displayedPosts.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {subTab === 'posts'
            ? activeBusinessProfile
              ? `${activeBusinessProfile.displayName} has not published any posts yet.`
              : 'You have not published any posts yet. Share a note or photo from your Feed.'
            : 'No saved posts yet. Bookmark posts in your feed to find them here.'}
        </div>
      ) : (
        <div className="space-y-4">
          {displayedPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={profile.uid}
              canManagePost={
                post.authorId === profile.uid ||
                (activeBusinessProfile
                  ? post.authorId === activeBusinessProfile.id &&
                    canManageActiveBusiness
                  : false)
              }
              categories={categories}
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
              onSelectHashtag={onSelectHashtag}
              onMentionClick={onMentionClick}
              onOpenMedia={(clickedPost) => setActiveMediaPostId(clickedPost.id)}
            />
          ))}
        </div>
      )}

      <MediaViewerModal
        open={Boolean(activeMediaPostId)}
        entries={activeGalleryEntries}
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
        onSelectHashtag={onSelectHashtag}
        onMentionClick={onMentionClick}
      />
    </section>
  );
}
