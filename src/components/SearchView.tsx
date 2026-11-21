import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Building2,
  Clock,
  Film,
  Hash,
  MapPin,
  MessageCircle,
  Search,
  ShoppingBag,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useActiveIdentity } from '../contexts/ActiveIdentityContext';
import { subscribeActiveMarketplaceProducts } from '../services/commerce';
import { formatCurrencyCents } from '../services/marketplaceCatalogAssets';
import type { BusinessProfile } from '../types/business';
import type { MarketplaceProduct } from '../types/marketplace';
import type {
  ChatThread,
  Post,
  PostCategory,
  PostComment,
  UserProfile,
} from '../types/social';
import { runUnifiedSearch, type SearchResultTab } from '../utils/searchLogic';
import { Avatar } from './Avatar';
import { PostCard } from './PostCard';
import { VerifiedBadge } from './VerifiedBadge';

interface SearchViewProps {
  initialQuery?: string;
  users: UserProfile[];
  businesses: BusinessProfile[];
  posts: Post[];
  savedHashtags: string[];
  likedPostIds: string[];
  bookmarkedPostIds: string[];
  commentsByPost: Record<string, PostComment[]>;
  shareThreads: ChatThread[];
  categories: string[];
  currentUserId: string;
  onBack: () => void;
  onQueryChange?: (q: string) => void;
  onOpenPublicProfile: (uid: string) => void;
  onOpenBusinessProfile: (slug: string) => void;
  onOpenProduct: (productId: string) => void;
  onOpenComments: (post: Post) => void;
  onSelectHashtag: (tag: string) => void;
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
  onMentionClick: (handle: string) => void;
}

const SEARCH_TABS: Array<{ id: SearchResultTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'people', label: 'People' },
  { id: 'businesses', label: 'Businesses' },
  { id: 'posts', label: 'Posts' },
  { id: 'videos', label: 'Videos' },
  { id: 'products', label: 'Products' },
  { id: 'hashtags', label: 'Hashtags' },
  { id: 'places', label: 'Places' },
];

export function SearchView({
  initialQuery = '',
  users,
  businesses,
  posts,
  savedHashtags,
  likedPostIds,
  bookmarkedPostIds,
  commentsByPost,
  shareThreads,
  categories,
  currentUserId,
  onBack,
  onQueryChange,
  onOpenPublicProfile,
  onOpenBusinessProfile,
  onOpenProduct,
  onOpenComments,
  onSelectHashtag,
  onToggleLike,
  onToggleBookmark,
  onAddComment,
  onUpdatePost,
  onDeletePost,
  onDeleteComment,
  onShareToStory,
  onShareToChat,
  onMentionClick,
}: SearchViewProps) {
  const { getScopedCacheKey } = useActiveIdentity();
  const historyStorageKey = getScopedCacheKey('search', 'recent_v1');

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchResultTab>('all');
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(historyStorageKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      setRecentSearches(
        Array.isArray(parsed)
          ? parsed.filter((s): s is string => typeof s === 'string').slice(0, 8)
          : []
      );
    } catch {
      setRecentSearches([]);
    }
  }, [historyStorageKey]);

  useEffect(() => {
    return subscribeActiveMarketplaceProducts(setProducts, () => setProducts([]));
  }, []);

  const persistRecentQuery = (rawTerm: string) => {
    const clean = rawTerm.trim();
    if (!clean) return;
    setRecentSearches((prev) => {
      const next = [clean, ...prev.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(
        0,
        8
      );
      try {
        window.localStorage.setItem(historyStorageKey, JSON.stringify(next));
      } catch {
        // Ignore quota errors
      }
      return next;
    });
  };

  const clearHistory = () => {
    setRecentSearches([]);
    try {
      window.localStorage.removeItem(historyStorageKey);
    } catch {
      // Ignore storage errors
    }
  };

  const results = useMemo(
    () =>
      runUnifiedSearch({
        query,
        users,
        businesses,
        posts,
        products,
        savedHashtags,
      }),
    [businesses, posts, products, query, savedHashtags, users]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    persistRecentQuery(query);
    onQueryChange?.(query);
  };

  const handleSelectQuery = (nextQ: string) => {
    setQuery(nextQ);
    persistRecentQuery(nextQ);
    onQueryChange?.(nextQ);
  };

  const totalMatches =
    results.people.length +
    results.businesses.length +
    results.posts.length +
    results.products.length +
    results.hashtags.length +
    results.places.length;

  return (
    <section aria-label="Search Looma" className="max-w-4xl mx-auto space-y-5">
      {/* Top Search Header */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <form onSubmit={handleSubmit} className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                onQueryChange?.(e.target.value);
              }}
              placeholder="Search people, businesses, posts, videos, products, #hashtags, places..."
              aria-label="Search Looma directory"
              className="w-full min-h-[44px] pl-10 pr-9 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  onQueryChange?.('');
                }}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 min-h-[30px] min-w-[30px] rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </form>
        </div>

        {/* 8 Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {SEARCH_TABS.map((tab) => {
            const countMap: Record<SearchResultTab, number> = {
              all: totalMatches,
              people: results.people.length,
              businesses: results.businesses.length,
              posts: results.posts.length,
              videos: results.videos.length,
              products: results.products.length,
              hashtags: results.hashtags.length,
              places: results.places.length,
            };
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[36px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer tabular-nums transition-colors ${
                  activeTab === tab.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label} ({countMap[tab.id]})
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Searches & Trending Hashtags (shown when query is empty) */}
      {!query.trim() && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recentSearches.length > 0 && (
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Recent Searches</span>
                </h2>
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" aria-hidden="true" />
                  <span>Clear</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => handleSelectQuery(term)}
                    className="min-h-[34px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {results.hashtags.length > 0 && (
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <h2 className="font-display text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Trending Topics</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {results.hashtags.slice(0, 10).map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => onSelectHashtag(item.tag)}
                    className="min-h-[34px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer tabular-nums"
                  >
                    #{item.tag} ({item.count})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results: People */}
      {(activeTab === 'all' || activeTab === 'people') && results.people.length > 0 && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>People ({results.people.length})</span>
            </h2>
            {activeTab === 'all' && results.people.length > 4 && (
              <button
                type="button"
                onClick={() => setActiveTab('people')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                View all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(activeTab === 'all' ? results.people.slice(0, 4) : results.people).map(
              (person) => (
                <button
                  key={person.uid}
                  type="button"
                  onClick={() => {
                    persistRecentQuery(query);
                    onOpenPublicProfile(person.uid);
                  }}
                  className="text-left flex items-center gap-3 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
                >
                  <Avatar
                    src={person.avatarUrl}
                    name={person.displayName}
                    size="md"
                  />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-bold text-slate-900 dark:text-white inline-flex items-center gap-1 truncate max-w-full">
                      <span className="truncate">{person.displayName}</span>
                      {person.isVerified && <VerifiedBadge size={13} />}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 truncate">
                      @{person.handle}
                      {person.location ? ` · ${person.location}` : ''}
                    </p>
                  </div>
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Results: Businesses */}
      {(activeTab === 'all' || activeTab === 'businesses') &&
        results.businesses.length > 0 && (
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <span>Businesses ({results.businesses.length})</span>
              </h2>
              {activeTab === 'all' && results.businesses.length > 4 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('businesses')}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  View all
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(activeTab === 'all'
                ? results.businesses.slice(0, 4)
                : results.businesses
              ).map((biz) => (
                <button
                  key={biz.id}
                  type="button"
                  onClick={() => {
                    persistRecentQuery(query);
                    onOpenBusinessProfile(biz.slug);
                  }}
                  className="text-left flex items-center gap-3 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
                >
                  <Avatar src={biz.logoUrl} name={biz.displayName} size="md" />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-bold text-slate-900 dark:text-white inline-flex items-center gap-1 truncate max-w-full">
                      <span className="truncate">{biz.displayName}</span>
                      {biz.verified && <VerifiedBadge size={13} />}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 truncate">
                      @{biz.slug} · {biz.category}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Results: Products */}
      {(activeTab === 'all' || activeTab === 'products') &&
        results.products.length > 0 && (
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <span>Products ({results.products.length})</span>
              </h2>
              {activeTab === 'all' && results.products.length > 3 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('products')}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  View all
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(activeTab === 'all'
                ? results.products.slice(0, 3)
                : results.products
              ).map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => {
                    persistRecentQuery(query);
                    onOpenProduct(prod.id);
                  }}
                  className="text-left rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden hover:border-blue-300 dark:hover:border-blue-800 transition-colors cursor-pointer"
                >
                  {prod.imageUrl ? (
                    <img
                      src={prod.imageUrl}
                      alt={prod.title}
                      className="w-full h-32 object-cover block"
                    />
                  ) : (
                    <div className="w-full h-32 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <ShoppingBag className="w-6 h-6 text-slate-400" aria-hidden="true" />
                    </div>
                  )}
                  <div className="p-3 text-xs">
                    <p className="font-bold text-slate-900 dark:text-white line-clamp-1">
                      {prod.title}
                    </p>
                    <p className="text-blue-600 dark:text-blue-400 font-bold mt-1 tabular-nums">
                      {formatCurrencyCents(prod.priceCents, prod.currency)}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {prod.storeName}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Results: Hashtags */}
      {(activeTab === 'all' || activeTab === 'hashtags') &&
        results.hashtags.length > 0 &&
        (activeTab === 'hashtags' || Boolean(query.trim())) && (
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
              <Hash className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Hashtags ({results.hashtags.length})</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {results.hashtags.map((h) => (
                <button
                  key={h.tag}
                  type="button"
                  onClick={() => onSelectHashtag(h.tag)}
                  className="min-h-[36px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer tabular-nums"
                >
                  #{h.tag} · {h.count} {h.count === 1 ? 'post' : 'posts'}
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Results: Places */}
      {(activeTab === 'all' || activeTab === 'places') &&
        results.places.length > 0 && (
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Places ({results.places.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(activeTab === 'all'
                ? results.places.slice(0, 4)
                : results.places
              ).map((pl) => (
                <button
                  key={pl.name}
                  type="button"
                  onClick={() => handleSelectQuery(pl.name)}
                  className="text-left p-3 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 flex items-center justify-between gap-2 text-xs cursor-pointer"
                >
                  <span className="font-semibold text-slate-900 dark:text-white truncate">
                    {pl.name}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                    {pl.peopleCount} people · {pl.businessCount} biz · {pl.productCount} items
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Results: Videos */}
      {(activeTab === 'all' || activeTab === 'videos') &&
        results.videos.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2 px-1">
              <Film className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Videos ({results.videos.length})</span>
            </h2>
            <div className="space-y-4">
              {(activeTab === 'all'
                ? results.videos.slice(0, 3)
                : results.videos
              ).map((post) => (
                <PostCard
                  key={`vid_${post.id}`}
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
                  onShareToStory={onShareToStory}
                  onShareToChat={onShareToChat}
                  onSelectHashtag={onSelectHashtag}
                  onMentionClick={onMentionClick}
                  onOpenComments={onOpenComments}
                />
              ))}
            </div>
          </div>
        )}

      {/* Results: Posts */}
      {(activeTab === 'all' || activeTab === 'posts') &&
        results.posts.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2 px-1">
              <MessageCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Posts ({results.posts.length})</span>
            </h2>
            <div className="space-y-4">
              {results.posts.map((post) => (
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
                  onShareToStory={onShareToStory}
                  onShareToChat={onShareToChat}
                  onSelectHashtag={onSelectHashtag}
                  onMentionClick={onMentionClick}
                  onOpenComments={onOpenComments}
                />
              ))}
            </div>
          </div>
        )}

      {totalMatches === 0 && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-12 text-center space-y-2">
          <Search className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            No results found for “{query}”
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Try a different handle, product title, location, or hashtag.
          </p>
        </div>
      )}
    </section>
  );
}
