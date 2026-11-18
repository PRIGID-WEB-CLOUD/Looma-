import type {
  MarketplaceInboxFilter,
  MarketplaceInboxRole,
  MarketplaceOrder,
  MarketplaceProduct,
  MarketplaceStore,
  OrderStatus,
  PaymentStatus,
  ProductCondition,
} from '../types/marketplace';
import type { ChatThread, UserProfile } from '../types/social';

export type CategoryIconKey =
  | 'car'
  | 'home'
  | 'women'
  | 'men'
  | 'furniture'
  | 'electronics'
  | 'watch'
  | 'bag'
  | 'ceramics'
  | 'antiques'
  | 'appliances'
  | 'arts'
  | 'autoparts'
  | 'baby'
  | 'books'
  | 'digital'
  | 'beauty'
  | 'garden'
  | 'jewelry'
  | 'music'
  | 'pet'
  | 'sports'
  | 'toys';

export interface MarketplaceCategoryEntry {
  name: string;
  iconKey: CategoryIconKey;
}

export const TOP_MARKETPLACE_CATEGORIES: MarketplaceCategoryEntry[] = [
  { name: 'Vehicles', iconKey: 'car' },
  { name: 'Rentals', iconKey: 'home' },
  { name: "Women's clothing & shoes", iconKey: 'women' },
  { name: "Men's clothing & shoes", iconKey: 'men' },
  { name: 'Furniture', iconKey: 'furniture' },
  { name: 'Electronics & computers', iconKey: 'electronics' },
  { name: 'Timepieces', iconKey: 'watch' },
  { name: 'Leather Goods', iconKey: 'bag' },
];

export const ALL_MARKETPLACE_CATEGORIES: MarketplaceCategoryEntry[] = [
  { name: 'Antiques & Collectibles', iconKey: 'antiques' },
  { name: 'Apparel', iconKey: 'men' },
  { name: 'Appliances', iconKey: 'appliances' },
  { name: 'Arts & Crafts', iconKey: 'arts' },
  { name: 'Auto parts', iconKey: 'autoparts' },
  { name: 'Baby & kids', iconKey: 'baby' },
  { name: 'Books, Movies & Music', iconKey: 'books' },
  { name: 'Digital & Studio', iconKey: 'digital' },
  { name: 'Electronics & computers', iconKey: 'electronics' },
  { name: 'Furniture', iconKey: 'furniture' },
  { name: 'Health & Beauty', iconKey: 'beauty' },
  { name: 'Home & Ceramics', iconKey: 'ceramics' },
  { name: 'Home & Garden', iconKey: 'garden' },
  { name: 'Jewelry & Accessories', iconKey: 'jewelry' },
  { name: 'Leather Goods', iconKey: 'bag' },
  { name: "Men's clothing & shoes", iconKey: 'men' },
  { name: 'Musical Instruments', iconKey: 'music' },
  { name: 'Pet Supplies', iconKey: 'pet' },
  { name: 'Rentals', iconKey: 'home' },
  { name: 'Sports & Outdoors', iconKey: 'sports' },
  { name: 'Timepieces', iconKey: 'watch' },
  { name: 'Toys & Games', iconKey: 'toys' },
  { name: 'Vehicles', iconKey: 'car' },
  { name: "Women's clothing & shoes", iconKey: 'women' },
];

export const PRODUCT_CONDITIONS: ProductCondition[] = [
  'New',
  'Used - Like New',
  'Used - Good',
  'Used - Fair',
];

export const CURRENCY_OPTIONS = ['USD', 'GHS', 'EUR', 'GBP', 'NGN'] as const;
export const RADIUS_OPTIONS_KM = [10, 25, 65, 100, 250] as const;

export function resolveListingImages(
  product: Pick<MarketplaceProduct, 'imageUrl' | 'galleryUrls'>
): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const push = (raw?: string) => {
    const clean = (raw || '').trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    urls.push(clean);
  };
  push(product.imageUrl);
  if (Array.isArray(product.galleryUrls)) {
    for (const u of product.galleryUrls) {
      push(u);
    }
  }
  return urls;
}

export function formatListingTimestamp(
  createdAtMs: number,
  nowMs: number = Date.now()
): string {
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) {
    return 'Listed recently';
  }
  const diffMs = Math.max(0, nowMs - createdAtMs);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 5) return 'Listed just now';
  if (mins < 60) return `Listed ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Listed ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Listed ${days}d ago`;
  return 'Listed over a week ago';
}

export interface ResolvedMarketplaceSeller {
  uid: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  bannerUrl: string;
  bio: string;
  location: string;
  joinedYear: number;
  followersCount: number;
  isVerified: boolean;
  store: MarketplaceStore | null;
}

export function resolveSellerSummary(params: {
  sellerUid: string;
  store?: MarketplaceStore | null;
  knownUsers: UserProfile[];
  currentUser: UserProfile;
}): ResolvedMarketplaceSeller {
  const { sellerUid, store = null, knownUsers, currentUser } = params;
  const matchedUser =
    currentUser.uid === sellerUid
      ? currentUser
      : knownUsers.find((u) => u.uid === sellerUid) || null;

  const createdMs = matchedUser?.createdAtMs || store?.createdAtMs || Date.now();
  const joinedYear = new Date(createdMs).getFullYear() || new Date().getFullYear();

  return {
    uid: sellerUid || store?.ownerUid || '',
    displayName:
      matchedUser?.displayName || store?.name || 'Marketplace Seller',
    handle: matchedUser?.handle || store?.ownerHandle || 'seller',
    avatarUrl: matchedUser?.avatarUrl || store?.logoUrl || '',
    bannerUrl: store?.bannerUrl || '',
    bio: matchedUser?.bio || store?.tagline || 'Independent seller on Looma Marketplace.',
    location: matchedUser?.location || 'Looma Community',
    joinedYear,
    followersCount: matchedUser?.followersCount || 0,
    isVerified: Boolean(matchedUser?.isVerified || store?.verified),
    store,
  };
}

export function filterMarketplaceProducts(
  products: MarketplaceProduct[],
  options: {
    storeId?: string;
    category?: string;
    query?: string;
    locationQuery?: string;
    localOnly?: boolean;
  }
): MarketplaceProduct[] {
  const storeId = options.storeId || 'all';
  const category = options.category || 'All';
  const q = (options.query || '').trim().toLowerCase();
  const loc = (options.locationQuery || '').trim().toLowerCase();

  const filtered = products.filter((prod) => {
    if (storeId !== 'all' && prod.storeId !== storeId) return false;
    if (category !== 'All' && prod.category !== category) return false;
    if (options.localOnly && loc) {
      const prodLoc = (prod.location || '').toLowerCase();
      if (prodLoc && !prodLoc.includes(loc) && !loc.includes(prodLoc)) {
        return false;
      }
    }
    if (q) {
      const hay = `${prod.title} ${prod.description} ${prod.storeName} ${prod.category} ${prod.location || ''} ${prod.tag || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return filtered;
}

export function upsertRecentSearch(
  prev: string[],
  rawTerm: string,
  maxItems: number = 8
): string[] {
  const term = rawTerm.trim();
  if (!term) return prev;
  const lower = term.toLowerCase();
  const next = [term, ...prev.filter((item) => item.toLowerCase() !== lower)];
  return next.slice(0, Math.max(1, maxItems));
}

export function removeRecentSearch(prev: string[], term: string): string[] {
  const lower = term.trim().toLowerCase();
  return prev.filter((item) => item.toLowerCase() !== lower);
}

export function toggleStringListItem(prev: string[], value: string): string[] {
  const clean = value.trim();
  if (!clean) return prev;
  if (prev.includes(clean)) {
    return prev.filter((item) => item !== clean);
  }
  return [clean, ...prev];
}

export interface SuggestedStorefront {
  store: MarketplaceStore;
  activeCount: number;
}

export function getSuggestedStorefronts(
  stores: MarketplaceStore[],
  products: MarketplaceProduct[],
  excludeStoreId?: string,
  limit: number = 4
): SuggestedStorefront[] {
  const counts = new Map<string, number>();
  for (const prod of products) {
    if (prod.status === 'ACTIVE') {
      counts.set(prod.storeId, (counts.get(prod.storeId) || 0) + 1);
    }
  }
  return stores
    .filter((s) => s.id !== excludeStoreId && s.publishStatus === 'PUBLISHED')
    .map((store) => ({
      store,
      activeCount: counts.get(store.id) || 0,
    }))
    .sort((a, b) => Number(b.store.featured) - Number(a.store.featured) || b.activeCount - a.activeCount)
    .slice(0, Math.max(1, limit));
}

export interface MarketplaceInboxFilterOption {
  id: MarketplaceInboxFilter;
  label: string;
}

export const MARKETPLACE_INBOX_FILTERS: MarketplaceInboxFilterOption[] = [
  { id: 'all', label: 'All' },
  { id: 'pending_payment', label: 'Pending payment' },
  { id: 'paid', label: 'Paid' },
  { id: 'to_be_shipped', label: 'To be shipped' },
];

export interface TrackedMarketplaceThreadHint {
  threadId?: string;
  partnerUid: string;
  role: MarketplaceInboxRole;
  listingId?: string;
  listingTitle?: string;
  priceFormatted?: string;
  updatedAtMs: number;
}

export interface MarketplaceInboxEntry {
  key: string;
  role: MarketplaceInboxRole;
  partnerUid: string;
  partnerName: string;
  partnerAvatar: string;
  partnerVerified: boolean;
  thread: ChatThread | null;
  order: MarketplaceOrder | null;
  listingTitle: string;
  subtitle: string;
  paymentStatus: PaymentStatus | null;
  orderStatus: OrderStatus | null;
  updatedAtMs: number;
}

function resolveThreadPartnerUid(thread: ChatThread, currentUid: string): string {
  if (thread.partnerUid && thread.partnerUid !== currentUid) {
    return thread.partnerUid;
  }
  return thread.memberIds.find((id) => id !== currentUid) || '';
}

function extractListingBracketInfo(text: string): string | null {
  const match = text.match(/\[([^\[\]]+)\]/);
  return match ? match[1].trim() : null;
}

function matchesInboxStatusFilter(
  entry: Pick<MarketplaceInboxEntry, 'paymentStatus' | 'orderStatus'>,
  filter: MarketplaceInboxFilter
): boolean {
  if (filter === 'all') return true;
  if (!entry.orderStatus || !entry.paymentStatus) {
    // Plain inquiry chats only show under 'all'
    return false;
  }
  if (filter === 'pending_payment') {
    return entry.paymentStatus === 'pending' && entry.orderStatus !== 'CANCELLED';
  }
  if (filter === 'paid') {
    return entry.paymentStatus === 'paid';
  }
  if (filter === 'to_be_shipped') {
    return (
      entry.orderStatus === 'PENDING' || entry.orderStatus === 'CONFIRMED'
    );
  }
  return true;
}

export function resolveMarketplaceInboxEntries(params: {
  currentUid: string;
  role: MarketplaceInboxRole;
  filter: MarketplaceInboxFilter;
  buyerOrders: MarketplaceOrder[];
  sellerOrders: MarketplaceOrder[];
  threads: ChatThread[];
  products: MarketplaceProduct[];
  stores: MarketplaceStore[];
  knownUsers: UserProfile[];
  threadHints?: TrackedMarketplaceThreadHint[];
}): MarketplaceInboxEntry[] {
  const {
    currentUid,
    role,
    filter,
    buyerOrders,
    sellerOrders,
    threads,
    products,
    stores,
    knownUsers,
    threadHints = [],
  } = params;

  const entries: MarketplaceInboxEntry[] = [];
  const usedThreadIds = new Set<string>();

  const ownedStoreIds = new Set(
    stores.filter((s) => s.ownerUid === currentUid).map((s) => s.id)
  );
  const ownedProductTitles = products
    .filter((p) => p.ownerUid === currentUid || ownedStoreIds.has(p.storeId))
    .map((p) => p.title.trim().toLowerCase())
    .filter((t) => t.length >= 3);

  const otherSellerUids = new Set(
    products
      .filter((p) => p.ownerUid && p.ownerUid !== currentUid)
      .map((p) => p.ownerUid)
  );
  for (const s of stores) {
    if (s.ownerUid && s.ownerUid !== currentUid) {
      otherSellerUids.add(s.ownerUid);
    }
  }

  const findDirectThreadWith = (partnerUid: string): ChatThread | null => {
    if (!partnerUid) return null;
    return (
      threads.find(
        (t) =>
          !t.isGroup &&
          resolveThreadPartnerUid(t, currentUid) === partnerUid
      ) || null
    );
  };

  const findUserMeta = (uid: string) =>
    knownUsers.find((u) => u.uid === uid) || null;

  // 1. Order-backed entries (both Buyer and Seller views)
  const scopedOrders =
    role === 'buying'
      ? buyerOrders
      : sellerOrders.filter(
          (o) => o.storeOwnerUid === currentUid || ownedStoreIds.has(o.storeId)
        );

  for (const order of scopedOrders) {
    const partnerUid =
      role === 'buying' ? order.storeOwnerUid || '' : order.buyerUid;
    const store = stores.find((s) => s.id === order.storeId) || null;
    const userMeta = findUserMeta(partnerUid);
    const matchedThread = findDirectThreadWith(partnerUid);
    if (matchedThread) {
      usedThreadIds.add(matchedThread.id);
    }

    const firstItemTitle = order.items[0]?.title || 'Marketplace order';
    const itemCount = order.items.reduce((sum, i) => sum + Math.max(1, i.quantity), 0);
    const listingTitle =
      itemCount > 1
        ? `${firstItemTitle} + ${itemCount - 1} more`
        : firstItemTitle;

    const partnerName =
      role === 'buying'
        ? store?.name || order.storeName || userMeta?.displayName || 'Marketplace Seller'
        : order.buyerName || userMeta?.displayName || 'Buyer';

    const partnerAvatar =
      role === 'buying'
        ? order.items[0]?.imageUrl || store?.logoUrl || userMeta?.avatarUrl || ''
        : userMeta?.avatarUrl || order.items[0]?.imageUrl || '';

    entries.push({
      key: `order_${order.id}`,
      role,
      partnerUid,
      partnerName,
      partnerAvatar,
      partnerVerified:
        role === 'buying'
          ? Boolean(store?.verified || userMeta?.isVerified)
          : Boolean(userMeta?.isVerified),
      thread: matchedThread,
      order,
      listingTitle,
      subtitle:
        matchedThread?.lastMessageText ||
        `Order #${order.id.slice(-6).toUpperCase()}`,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
      updatedAtMs: Math.max(order.updatedAtMs, matchedThread?.updatedAtMs || 0),
    });
  }

  // 2. Marketplace inquiry threads without a matching order yet
  for (const thread of threads) {
    if (thread.isGroup || usedThreadIds.has(thread.id)) continue;
    const partnerUid = resolveThreadPartnerUid(thread, currentUid);
    if (!partnerUid || partnerUid === currentUid) continue;

    const text = (thread.lastMessageText || '').trim();
    const bracketInfo = extractListingBracketInfo(text);
    const hint = threadHints.find(
      (h) =>
        (h.threadId && h.threadId === thread.id) ||
        (h.partnerUid === partnerUid && h.role === role)
    );

    const hasMarketplacePhrase =
      Boolean(bracketInfo) || /is this still available/i.test(text);
    const mentionsOwnedListing = ownedProductTitles.some((title) =>
      text.toLowerCase().includes(title)
    );

    let belongsToRole = false;
    if (role === 'buying') {
      if (hint && hint.role === 'buying') {
        belongsToRole = true;
      } else if (
        thread.lastMessageSenderId === currentUid &&
        hasMarketplacePhrase &&
        otherSellerUids.has(partnerUid)
      ) {
        belongsToRole = true;
      }
    } else {
      if (hint && hint.role === 'selling') {
        belongsToRole = true;
      } else if (
        (ownedStoreIds.size > 0 || ownedProductTitles.length > 0) &&
        ((thread.lastMessageSenderId !== currentUid && hasMarketplacePhrase) ||
          mentionsOwnedListing)
      ) {
        belongsToRole = true;
      }
    }

    if (!belongsToRole) continue;

    const userMeta = findUserMeta(partnerUid);
    const partnerStore =
      role === 'buying'
        ? stores.find((s) => s.ownerUid === partnerUid) || null
        : null;

    entries.push({
      key: `thread_${thread.id}`,
      role,
      partnerUid,
      partnerName:
        userMeta?.displayName ||
        thread.title ||
        partnerStore?.name ||
        'Marketplace Member',
      partnerAvatar:
        userMeta?.avatarUrl ||
        thread.partnerAvatar ||
        partnerStore?.logoUrl ||
        '',
      partnerVerified: Boolean(userMeta?.isVerified || partnerStore?.verified),
      thread,
      order: null,
      listingTitle:
        hint?.listingTitle || bracketInfo || 'Marketplace inquiry',
      subtitle: text || 'Tap to view conversation',
      paymentStatus: null,
      orderStatus: null,
      updatedAtMs: Math.max(thread.updatedAtMs, hint?.updatedAtMs || 0),
    });
  }

  return entries
    .filter((entry) => matchesInboxStatusFilter(entry, filter))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}
