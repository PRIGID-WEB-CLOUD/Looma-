import type { BusinessProfile } from '../types/business';
import type { MarketplaceProduct } from '../types/marketplace';
import type { Post, UserProfile } from '../types/social';
import { extractHashtags } from './socialLogic';

export type SearchResultTab =
  | 'all'
  | 'people'
  | 'businesses'
  | 'posts'
  | 'videos'
  | 'products'
  | 'hashtags'
  | 'places';

export interface SearchHashtagMatch {
  tag: string;
  count: number;
}

export interface SearchPlaceMatch {
  name: string;
  peopleCount: number;
  businessCount: number;
  productCount: number;
}

export interface UnifiedSearchResults {
  people: UserProfile[];
  businesses: BusinessProfile[];
  posts: Post[];
  videos: Post[];
  products: MarketplaceProduct[];
  hashtags: SearchHashtagMatch[];
  places: SearchPlaceMatch[];
}

export function runUnifiedSearch(input: {
  query: string;
  users: UserProfile[];
  businesses: BusinessProfile[];
  posts: Post[];
  products: MarketplaceProduct[];
  savedHashtags?: string[];
}): UnifiedSearchResults {
  const rawQ = (input.query || '').trim();
  const q = rawQ.toLowerCase();
  const qNoHash = q.replace(/^#/, '');
  const qNoAt = q.replace(/^@/, '');

  const people = (input.users || []).filter((u) => {
    if (!q) return true;
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.handle.toLowerCase().includes(qNoAt) ||
      (u.bio || '').toLowerCase().includes(q) ||
      (u.location || '').toLowerCase().includes(q)
    );
  });

  const businesses = (input.businesses || []).filter((b) => {
    if (b.status !== 'ACTIVE') return false;
    if (!q) return true;
    return (
      b.displayName.toLowerCase().includes(q) ||
      b.slug.toLowerCase().includes(qNoAt) ||
      b.category.toLowerCase().includes(q) ||
      (b.bio || '').toLowerCase().includes(q) ||
      (b.location || '').toLowerCase().includes(q)
    );
  });

  const posts = (input.posts || []).filter((p) => {
    if (!q) return true;
    return (
      p.caption.toLowerCase().includes(q) ||
      p.authorName.toLowerCase().includes(q) ||
      p.authorHandle.toLowerCase().includes(qNoAt) ||
      p.category.toLowerCase().includes(q)
    );
  });

  const videos = posts.filter((p) => {
    if (p.videoUrl) return true;
    if (p.linkUrl && /youtube\.com|youtu\.be|vimeo\.com/i.test(p.linkUrl)) {
      return true;
    }
    return false;
  });

  const products = (input.products || []).filter((prod) => {
    if (prod.status !== 'ACTIVE') return false;
    if (!q) return true;
    return (
      prod.title.toLowerCase().includes(q) ||
      prod.description.toLowerCase().includes(q) ||
      prod.category.toLowerCase().includes(q) ||
      prod.storeName.toLowerCase().includes(q) ||
      (prod.location || '').toLowerCase().includes(q)
    );
  });

  // Aggregate hashtags from saved list + all post captions
  const tagCounts = new Map<string, number>();
  for (const tag of input.savedHashtags || []) {
    const clean = tag.trim().replace(/^#/, '').toLowerCase();
    if (clean) tagCounts.set(clean, tagCounts.get(clean) || 0);
  }
  for (const post of input.posts || []) {
    for (const tag of extractHashtags(post.caption)) {
      const clean = tag.toLowerCase();
      tagCounts.set(clean, (tagCounts.get(clean) || 0) + 1);
    }
  }
  const hashtags: SearchHashtagMatch[] = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .filter((entry) => (!q ? true : entry.tag.includes(qNoHash)))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  // Aggregate places across users, businesses, products
  const placeMap = new Map<
    string,
    { name: string; peopleCount: number; businessCount: number; productCount: number }
  >();
  const ensurePlace = (rawLoc?: string) => {
    const clean = (rawLoc || '').trim();
    if (!clean) return null;
    const key = clean.toLowerCase();
    const existing = placeMap.get(key) || {
      name: clean,
      peopleCount: 0,
      businessCount: 0,
      productCount: 0,
    };
    placeMap.set(key, existing);
    return existing;
  };

  for (const u of input.users || []) {
    const entry = ensurePlace(u.location);
    if (entry) entry.peopleCount += 1;
  }
  for (const b of input.businesses || []) {
    if (b.status !== 'ACTIVE') continue;
    const entry = ensurePlace(b.location);
    if (entry) entry.businessCount += 1;
  }
  for (const prod of input.products || []) {
    if (prod.status !== 'ACTIVE') continue;
    const entry = ensurePlace(prod.location);
    if (entry) entry.productCount += 1;
  }

  const places: SearchPlaceMatch[] = Array.from(placeMap.values())
    .filter((pl) => (!q ? true : pl.name.toLowerCase().includes(q)))
    .sort(
      (a, b) =>
        b.peopleCount +
        b.businessCount +
        b.productCount -
        (a.peopleCount + a.businessCount + a.productCount)
    );

  return {
    people,
    businesses,
    posts,
    videos,
    products,
    hashtags,
    places,
  };
}
