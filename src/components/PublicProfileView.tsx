import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Building2,
  Check,
  ExternalLink,
  Flag,
  Globe,
  MapPin,
  MessageSquare,
  Phone,
  Store,
  UserCheck,
  UserPlus,
  Users,
  Video,
  X,
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

interface PublicProfileViewProps {
  creator: UserProfile;
  currentUserId?: string;
  loading?: boolean;
  fullScreen?: boolean;
  ownerBusinesses?: BusinessProfile[];
  loadingBusinesses?: boolean;
  onOpenBusinessProfile?: (slug: string) => void;
  isFollowing: boolean;
  followersCount?: number;
  followingCount?: number;
  friendsCount?: number;
  posts: Post[];
  likedPostIds: string[];
  bookmarkedPostIds: string[];
  commentsByPost: Record<string, PostComment[]>;
  shareThreads?: ChatThread[];
  categories?: string[];
  backLabel?: string;
  onToggleFollow: (uid: string) => void;
  onMessage: (creator: UserProfile) => void;
  onStartCallWithUser?: (creator: UserProfile, isAudioOnly: boolean) => void;
  onOpenConnections: (tab: ConnectionsTab) => void;
  onBack: () => void;
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
  callsEnabled?: boolean;
  storiesEnabled?: boolean;
  onReportPost?: (post: Post, category: 'spam' | 'harassment' | 'misinformation' | 'nudity' | 'copyright' | 'other', reason: string) => Promise<void>;
  onReportUser?: (creator: UserProfile, category: 'spam' | 'harassment' | 'misinformation' | 'nudity' | 'copyright' | 'other', reason: string) => Promise<void>;
  onSelectHashtag?: (tag: string) => void;
  onMentionClick?: (handle: string) => void;
  onOpenComments?: (post: Post) => void;
}

export function PublicProfileView({
  creator,
  currentUserId = '',
  loading = false,
  fullScreen = false,
  ownerBusinesses = [],
  loadingBusinesses = false,
  onOpenBusinessProfile,
  isFollowing,
  followersCount,
  followingCount,
  friendsCount,
  posts,
  likedPostIds,
  bookmarkedPostIds,
  commentsByPost,
  shareThreads = [],
  categories,
  backLabel = 'Back to Feed',
  onToggleFollow,
  onMessage,
  onStartCallWithUser,
  onOpenConnections,
  onBack,
  onToggleLike,
  onToggleBookmark,
  onAddComment,
  onUpdatePost,
  onDeletePost,
  onDeleteComment,
  onShareToStory,
  onShareToChat,
  callsEnabled = true,
  storiesEnabled = true,
  onReportPost,
  onReportUser,
  onSelectHashtag,
  onMentionClick,
  onOpenComments,
}: PublicProfileViewProps) {
  const [subTab, setSubTab] = useState<'posts' | 'media'>('posts');
  const [activeMediaPostId, setActiveMediaPostId] = useState<string | null>(null);
  const [reportUserOpen, setReportUserOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<'spam' | 'harassment' | 'misinformation' | 'nudity' | 'copyright' | 'other'>('harassment');
  const [reportReason, setReportReason] = useState('');
  const [reportingUser, setReportingUser] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const isSelf = Boolean(currentUserId) && creator.uid === currentUserId;
  const creatorPosts = posts.filter((p) => p.authorId === creator.uid);
  const creatorMediaEntries = useMemo(() => filterMediaPosts(creatorPosts), [creatorPosts]);
  const displayedFollowers =
    typeof followersCount === 'number'
      ? followersCount
      : creator.followersCount + (isFollowing ? 1 : 0);
  const displayedFollowing =
    typeof followingCount === 'number' ? followingCount : creator.followingCount;

  return (
    <section
      aria-label={`${creator.displayName} public profile`}
      data-testid={fullScreen ? 'public-profile-fullscreen' : undefined}
      className={fullScreen ? 'w-full max-w-6xl mx-auto space-y-6' : 'space-y-5'}
    >
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3 -ml-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>{backLabel}</span>
        </button>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-start justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <Avatar
              src={creator.avatarUrl}
              name={creator.displayName}
              size="xl"
            />
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-1.5 min-w-0">
                <span className="truncate">{creator.displayName}</span>
                {creator.isVerified && <VerifiedBadge size={16} />}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                @{creator.handle}
                {creator.location && (
                  <>
                    {' '}
                    <span aria-hidden="true">·</span>{' '}
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                      {creator.location}
                    </span>
                  </>
                )}
              </p>
              {creator.accountType === 'business' && (
                <p
                  data-testid="public-profile-unified-business-meta"
                  className="text-xs font-medium text-blue-700 dark:text-blue-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"
                >
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Business Profile</span>
                  </span>
                  {creator.businessCategory && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-600 dark:text-slate-300">
                        {creator.businessCategory}
                      </span>
                    </>
                  )}
                  {isSafeExternalHttpUrl(creator.businessWebsiteUrl) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <a
                        href={creator.businessWebsiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>Website</span>
                        <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                      </a>
                    </>
                  )}
                </p>
              )}

              {loading ? (
                <div className="space-y-2 mt-3 animate-pulse">
                  <div className="h-4 w-60 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3.5 w-36 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
              ) : (
                <>
                  {creator.bio && (
                    <div className="text-sm text-slate-700 dark:text-slate-300 mt-2.5 max-w-xl leading-relaxed">
                      <RichText
                        text={creator.bio}
                        onHashtagClick={onSelectHashtag}
                        onMentionClick={onMentionClick}
                      />
                    </div>
                  )}
                  {creator.interests.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5">
                      {creator.interests.join(' · ')}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenConnections('followers')}
              className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Users className="w-4 h-4" aria-hidden="true" />
              <span>Connections</span>
            </button>

            {!isSelf && (
              <>
                <button
                  type="button"
                  aria-pressed={isFollowing}
                  onClick={() => onToggleFollow(creator.uid)}
                  className={`min-h-[42px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isFollowing
                      ? 'border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                      : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white'
                  }`}
                >
                  {isFollowing ? (
                    <>
                      <UserCheck className="w-4 h-4" aria-hidden="true" />
                      <span>Following</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" aria-hidden="true" />
                      <span>Follow</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onMessage(creator)}
                  className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" aria-hidden="true" />
                  <span>Message</span>
                </button>

                {onStartCallWithUser && callsEnabled && (
                  <>
                    <button
                      type="button"
                      onClick={() => onStartCallWithUser(creator, true)}
                      aria-label={`Audio call with ${creator.displayName}`}
                      className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <span>Audio</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartCallWithUser(creator, false)}
                      aria-label={`Video call with ${creator.displayName}`}
                      className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Video className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <span>Video</span>
                    </button>
                  </>
                )}

                {onReportUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setReportError(null);
                      setReportSuccess(false);
                      setReportUserOpen(true);
                    }}
                    aria-label={`Report ${creator.displayName}`}
                    className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Flag className="w-4 h-4" aria-hidden="true" />
                    <span>Report</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm tabular-nums">
          <div>
            <span className="font-bold text-slate-900 dark:text-white">
              {creatorPosts.length}
            </span>{' '}
            <span className="text-slate-500 dark:text-slate-400">
              {creatorPosts.length === 1 ? 'Post' : 'Posts'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenConnections('followers')}
            aria-label={`View ${creator.displayName}'s followers (${displayedFollowers})`}
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
            aria-label={`View who ${creator.displayName} is following (${displayedFollowing})`}
            className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            <span className="font-bold text-slate-900 dark:text-white">
              {displayedFollowing}
            </span>{' '}
            <span className="text-slate-500 dark:text-slate-400">
              Following
            </span>
          </button>
          {typeof friendsCount === 'number' && (
            <button
              type="button"
              onClick={() => onOpenConnections('friends')}
              aria-label={`View ${creator.displayName}'s mutual friends (${friendsCount})`}
              className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              <span className="font-bold text-slate-900 dark:text-white">
                {friendsCount}
              </span>{' '}
              <span className="text-slate-500 dark:text-slate-400">
                Friends
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Business Information (for Unified Business Accounts or Creators with Business Storefronts) */}
      {(loadingBusinesses ||
        ownerBusinesses.length > 0 ||
        creator.accountType === 'business') && (
        <div
          data-testid="public-profile-business-info"
          className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Business Information
              </h2>
            </div>
            {!loadingBusinesses && ownerBusinesses.length > 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {ownerBusinesses.length}{' '}
                {ownerBusinesses.length === 1 ? 'Business' : 'Businesses'}
              </span>
            )}
          </div>

          {creator.accountType === 'business' && (
            <div
              data-testid="public-unified-business-card"
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {creator.displayName} · Business Account
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    @{creator.handle}
                    {creator.businessCategory ? ` · ${creator.businessCategory}` : ''}
                    {creator.location ? ` · ${creator.location}` : ''}
                  </p>
                </div>
                {isSafeExternalHttpUrl(creator.businessWebsiteUrl) && (
                  <a
                    href={creator.businessWebsiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate max-w-[220px]">
                      {creator.businessWebsiteUrl}
                    </span>
                    <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                  </a>
                )}
              </div>
              {creator.bio && (
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {creator.bio}
                </p>
              )}
            </div>
          )}

          {loadingBusinesses && ownerBusinesses.length === 0 ? (
            <div className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ) : ownerBusinesses.length > 0 ? (
            <div className="space-y-3">
              {ownerBusinesses.map((biz) => (
                <div
                  key={biz.id}
                  data-testid={`public-business-card-${biz.id}`}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Avatar src={biz.logoUrl} name={biz.displayName} size="md" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5 max-w-full">
                          <span className="truncate">{biz.displayName}</span>
                          {biz.verified && <VerifiedBadge size={14} />}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          /business/{biz.slug} · {biz.category}
                        </p>
                      </div>
                    </div>

                    {onOpenBusinessProfile && (
                      <button
                        type="button"
                        onClick={() => onOpenBusinessProfile(biz.slug)}
                        className="min-h-[36px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Store className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                        <span>View Business Profile</span>
                      </button>
                    )}
                  </div>

                  {biz.bio && (
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {biz.bio}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>{biz.followersCount} Followers</span>
                    <span>Currency: {biz.currency}</span>
                    {biz.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{biz.location}</span>
                      </span>
                    )}
                    {isSafeExternalHttpUrl(biz.websiteUrl) && (
                      <a
                        href={biz.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Website</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
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
              Posts ({creatorPosts.length})
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
              Media ({creatorMediaEntries.length})
            </button>
          </div>
        </div>

        {subTab === 'media' ? (
          <MediaGalleryGrid
            entries={creatorMediaEntries}
            emptyMessage={`${creator.displayName} has not shared any photos, videos, or audio yet.`}
            onSelectEntry={(postId) => setActiveMediaPostId(postId)}
          />
        ) : creatorPosts.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No public posts shared yet.
          </div>
        ) : (
          creatorPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={currentUserId}
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
              onSelectHashtag={onSelectHashtag}
              onMentionClick={onMentionClick}
              onOpenMedia={(clickedPost) => setActiveMediaPostId(clickedPost.id)}
              onOpenComments={onOpenComments}
            />
          ))
        )}
      </div>

      <MediaViewerModal
        open={Boolean(activeMediaPostId)}
        entries={creatorMediaEntries}
        activePostId={activeMediaPostId}
        currentUserId={currentUserId}
        likedPostIds={likedPostIds}
        bookmarkedPostIds={bookmarkedPostIds}
        onClose={() => setActiveMediaPostId(null)}
        onSelectPostId={(postId) => setActiveMediaPostId(postId)}
        onToggleLike={onToggleLike}
        onToggleBookmark={onToggleBookmark}
        onSelectHashtag={onSelectHashtag}
        onMentionClick={onMentionClick}
      />

      {reportUserOpen && onReportUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Report ${creator.displayName}`}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-red-600 dark:text-red-400" aria-hidden="true" />
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Report @{creator.handle}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setReportUserOpen(false)}
                aria-label="Close report modal"
                className="min-h-[36px] min-w-[36px] rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {reportSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Report submitted to the Looma Safety &amp; Trust queue.</span>
              </div>
            ) : (
              <form
                onSubmit={async (e: FormEvent) => {
                  e.preventDefault();
                  setReportError(null);
                  if (!reportReason.trim()) {
                    setReportError('Please enter a brief explanation for moderators.');
                    return;
                  }
                  setReportingUser(true);
                  try {
                    await onReportUser(creator, reportCategory, reportReason.trim());
                    setReportReason('');
                    setReportSuccess(true);
                  } catch (err) {
                    setReportError(err instanceof Error ? err.message : 'Unable to submit report.');
                  } finally {
                    setReportingUser(false);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label htmlFor="report-user-cat" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    id="report-user-cat"
                    value={reportCategory}
                    onChange={(e) => setReportCategory(e.target.value as typeof reportCategory)}
                    className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="harassment">Harassment or abuse</option>
                    <option value="spam">Spam or impersonation</option>
                    <option value="misinformation">Misinformation</option>
                    <option value="nudity">Inappropriate media</option>
                    <option value="copyright">Copyright infringement</option>
                    <option value="other">Other guideline violation</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="report-user-reason" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Details
                  </label>
                  <textarea
                    id="report-user-reason"
                    rows={3}
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    placeholder="Share context for platform moderators..."
                    maxLength={500}
                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                {reportError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {reportError}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReportUserOpen(false)}
                    className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={reportingUser}
                    className="min-h-[40px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {reportingUser ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

