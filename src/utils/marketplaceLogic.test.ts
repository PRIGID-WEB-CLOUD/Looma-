import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  MarketplaceOrder,
  MarketplaceProduct,
  MarketplaceStore,
} from '../types/marketplace';
import type { ChatThread, UserProfile } from '../types/social';
import {
  ALL_MARKETPLACE_CATEGORIES,
  MARKETPLACE_INBOX_FILTERS,
  TOP_MARKETPLACE_CATEGORIES,
  filterMarketplaceProducts,
  formatListingTimestamp,
  getSuggestedStorefronts,
  removeRecentSearch,
  resolveListingImages,
  resolveMarketplaceInboxEntries,
  resolveSellerSummary,
  toggleStringListItem,
  upsertRecentSearch,
} from './marketplaceLogic';

const BASE_USER: UserProfile = {
  uid: 'user_1',
  displayName: 'Amos Gyegri',
  handle: 'amos.gyegri',
  bio: 'Jersey & gear collector in Eastern Region.',
  avatarUrl: 'https://cdn.example.com/amos.jpg',
  location: 'Asamankese, Eastern',
  interests: [],
  followersCount: 366,
  followingCount: 42,
  onboardingCompleted: true,
  isVerified: true,
  createdAtMs: new Date('2023-05-10T10:00:00Z').getTime(),
  updatedAtMs: Date.now(),
};

const STORE_A: MarketplaceStore = {
  id: 'store_a',
  slug: 'xtra-market',
  name: 'XTRA MARKET',
  tagline: 'Community electronics and jerseys',
  ownerUid: 'user_1',
  ownerHandle: 'amos.gyegri',
  logoUrl: '',
  bannerUrl: '',
  category: 'Apparel',
  currency: 'GHS',
  publishStatus: 'PUBLISHED',
  verified: true,
  featured: true,
  createdAtMs: new Date('2023-05-10T10:00:00Z').getTime(),
  updatedAtMs: Date.now(),
};

const STORE_B: MarketplaceStore = {
  id: 'store_b',
  slug: 'osofo-apple',
  name: 'Osofo Apple Ventures',
  tagline: 'Laptops & Studio hardware',
  ownerUid: 'user_2',
  ownerHandle: 'osofo',
  logoUrl: '',
  bannerUrl: '',
  category: 'Electronics & computers',
  currency: 'GHS',
  publishStatus: 'PUBLISHED',
  verified: false,
  featured: false,
  createdAtMs: Date.now(),
  updatedAtMs: Date.now(),
};

const PRODUCTS: MarketplaceProduct[] = [
  {
    id: 'p1',
    storeId: 'store_a',
    storeName: 'XTRA MARKET',
    storeSlug: 'xtra-market',
    ownerUid: 'user_1',
    title: 'Jerseys',
    description: 'Eastern region matchday kits',
    category: "Men's clothing & shoes",
    priceCents: 15000,
    currency: 'GHS',
    imageUrl: 'https://cdn.example.com/j1.jpg',
    galleryUrls: [
      'https://cdn.example.com/j1.jpg',
      'https://cdn.example.com/j2.jpg',
      'https://cdn.example.com/j3.jpg',
    ],
    location: 'West Akim, Eastern',
    condition: 'New',
    stock: 8,
    status: 'ACTIVE',
    featured: true,
    createdAtMs: Date.now() - 10 * 24 * 60 * 60 * 1000,
    updatedAtMs: Date.now(),
  },
  {
    id: 'p2',
    storeId: 'store_b',
    storeName: 'Osofo Apple Ventures',
    storeSlug: 'osofo-apple',
    ownerUid: 'user_2',
    title: 'UK Used Laptops Mini',
    description: 'Clean compact ultrabook',
    category: 'Electronics & computers',
    priceCents: 320000,
    currency: 'GHS',
    imageUrl: 'https://cdn.example.com/l1.jpg',
    location: 'Kade',
    stock: 3,
    status: 'ACTIVE',
    featured: false,
    createdAtMs: Date.now() - 3 * 60 * 60 * 1000,
    updatedAtMs: Date.now(),
  },
];

test('marketplaceLogic provides top and alphabetical all-category lists', () => {
  assert.ok(TOP_MARKETPLACE_CATEGORIES.length >= 6);
  const names = ALL_MARKETPLACE_CATEGORIES.map((c) => c.name);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names, sorted);
});

test('resolveListingImages deduplicates preserving primary photo first', () => {
  assert.deepEqual(resolveListingImages(PRODUCTS[0]), [
    'https://cdn.example.com/j1.jpg',
    'https://cdn.example.com/j2.jpg',
    'https://cdn.example.com/j3.jpg',
  ]);
});

test('formatListingTimestamp formats listing relative age labels cleanly', () => {
  const now = Date.now();
  assert.equal(formatListingTimestamp(now - 60_000, now), 'Listed just now');
  assert.equal(formatListingTimestamp(now - 3 * 3600_000, now), 'Listed 3h ago');
  assert.equal(formatListingTimestamp(now - 2 * 86400_000, now), 'Listed 2d ago');
  assert.equal(
    formatListingTimestamp(now - 9 * 86400_000, now),
    'Listed over a week ago'
  );
});

test('resolveSellerSummary combines profile and storefront metadata cleanly', () => {
  const seller = resolveSellerSummary({
    sellerUid: 'user_1',
    store: STORE_A,
    knownUsers: [BASE_USER],
    currentUser: { ...BASE_USER, uid: 'viewer_1' },
  });
  assert.equal(seller.displayName, 'Amos Gyegri');
  assert.equal(seller.joinedYear, 2023);
  assert.equal(seller.followersCount, 366);
  assert.equal(seller.isVerified, true);
});

test('filterMarketplaceProducts filters by category, query, and local location', () => {
  assert.equal(
    filterMarketplaceProducts(PRODUCTS, { category: 'Electronics & computers' })
      .length,
    1
  );
  assert.equal(
    filterMarketplaceProducts(PRODUCTS, { query: 'laptops' })[0]?.id,
    'p2'
  );
  assert.equal(
    filterMarketplaceProducts(PRODUCTS, {
      localOnly: true,
      locationQuery: 'Kade',
    })[0]?.id,
    'p2'
  );
});

test('recent searches, saved listings, and suggested storefronts helpers work cleanly', () => {
  let recent = upsertRecentSearch([], 'uk used laptops');
  recent = upsertRecentSearch(recent, 'uk used laptops mini');
  recent = upsertRecentSearch(recent, 'UK Used Laptops');
  assert.deepEqual(recent, ['UK Used Laptops', 'uk used laptops mini']);
  assert.deepEqual(removeRecentSearch(recent, 'uk used laptops'), [
    'uk used laptops mini',
  ]);

  assert.deepEqual(toggleStringListItem(['p1'], 'p2'), ['p2', 'p1']);
  assert.deepEqual(toggleStringListItem(['p2', 'p1'], 'p2'), ['p1']);

  const suggested = getSuggestedStorefronts([STORE_A, STORE_B], PRODUCTS, 'store_a');
  assert.equal(suggested.length, 1);
  assert.equal(suggested[0].store.id, 'store_b');
  assert.equal(suggested[0].activeCount, 1);
});

test('resolveMarketplaceInboxEntries separates Selling vs Buying chats & orders and filters by payment/shipping state', () => {
  const buyerProfile: UserProfile = {
    ...BASE_USER,
    uid: 'buyer_9',
    displayName: 'Kwame Boateng',
    handle: 'kwame.b',
    isVerified: false,
  };
  const sellerOrders: MarketplaceOrder[] = [
    {
      id: 'ord_pending',
      buyerUid: 'buyer_9',
      buyerName: 'Kwame Boateng',
      buyerEmail: 'kwame@example.com',
      storeId: 'store_a',
      storeName: 'XTRA MARKET',
      storeOwnerUid: 'user_1',
      items: [
        {
          productId: 'p1',
          title: 'Jerseys',
          priceCents: 15000,
          quantity: 1,
          imageUrl: 'https://cdn.example.com/j1.jpg',
        },
      ],
      subtotalCents: 15000,
      shippingCents: 0,
      totalCents: 15000,
      currency: 'GHS',
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      status: 'PENDING',
      shippingName: 'Kwame Boateng',
      shippingPhone: '0240000000',
      shippingAddress: 'High St',
      shippingCity: 'Kade',
      note: '',
      createdAtMs: 1000,
      updatedAtMs: 2000,
    },
    {
      id: 'ord_paid_shipped',
      buyerUid: 'buyer_10',
      buyerName: 'Ama Mensah',
      buyerEmail: 'ama@example.com',
      storeId: 'store_a',
      storeName: 'XTRA MARKET',
      storeOwnerUid: 'user_1',
      items: [
        {
          productId: 'p1',
          title: 'Jerseys',
          priceCents: 15000,
          quantity: 2,
          imageUrl: 'https://cdn.example.com/j1.jpg',
        },
      ],
      subtotalCents: 30000,
      shippingCents: 0,
      totalCents: 30000,
      currency: 'GHS',
      paymentMethod: 'card',
      paymentStatus: 'paid',
      status: 'SHIPPED',
      shippingName: 'Ama Mensah',
      shippingPhone: '0241111111',
      shippingAddress: 'Market Rd',
      shippingCity: 'Accra',
      note: '',
      createdAtMs: 1500,
      updatedAtMs: 2500,
    },
  ];
  const threads: ChatThread[] = [
    {
      id: 'dm_user_1_user_2',
      title: 'Osofo Apple Ventures',
      isGroup: false,
      memberIds: ['user_1', 'user_2'],
      partnerUid: 'user_2',
      partnerAvatar: '',
      partnerHandle: 'osofo',
      lastMessageText: 'Is this still available?\n[UK Used Laptops Mini · GHS3,200]',
      lastMessageSenderId: 'user_1',
      createdAtMs: 3000,
      updatedAtMs: 3500,
    },
    {
      id: 'dm_regular_friend',
      title: 'Regular Friend',
      isGroup: false,
      memberIds: ['user_1', 'friend_1'],
      partnerUid: 'friend_1',
      partnerAvatar: '',
      partnerHandle: 'friend',
      lastMessageText: 'See you tonight!',
      lastMessageSenderId: 'friend_1',
      createdAtMs: 4000,
      updatedAtMs: 4000,
    },
  ];

  assert.deepEqual(
    MARKETPLACE_INBOX_FILTERS.map((f) => f.label),
    ['All', 'Pending payment', 'Paid', 'To be shipped']
  );

  // Selling view: shows both seller orders, excludes non-marketplace regular chat
  const sellingAll = resolveMarketplaceInboxEntries({
    currentUid: 'user_1',
    role: 'selling',
    filter: 'all',
    buyerOrders: [],
    sellerOrders,
    threads,
    products: PRODUCTS,
    stores: [STORE_A, STORE_B],
    knownUsers: [BASE_USER, buyerProfile],
  });
  assert.equal(sellingAll.length, 2);

  const sellingPendingPayment = resolveMarketplaceInboxEntries({
    currentUid: 'user_1',
    role: 'selling',
    filter: 'pending_payment',
    buyerOrders: [],
    sellerOrders,
    threads,
    products: PRODUCTS,
    stores: [STORE_A, STORE_B],
    knownUsers: [BASE_USER, buyerProfile],
  });
  assert.equal(sellingPendingPayment.length, 1);
  assert.equal(sellingPendingPayment[0].order?.id, 'ord_pending');

  const sellingPaid = resolveMarketplaceInboxEntries({
    currentUid: 'user_1',
    role: 'selling',
    filter: 'paid',
    buyerOrders: [],
    sellerOrders,
    threads,
    products: PRODUCTS,
    stores: [STORE_A, STORE_B],
    knownUsers: [BASE_USER, buyerProfile],
  });
  assert.equal(sellingPaid.length, 1);
  assert.equal(sellingPaid[0].order?.id, 'ord_paid_shipped');

  const sellingToBeShipped = resolveMarketplaceInboxEntries({
    currentUid: 'user_1',
    role: 'selling',
    filter: 'to_be_shipped',
    buyerOrders: [],
    sellerOrders,
    threads,
    products: PRODUCTS,
    stores: [STORE_A, STORE_B],
    knownUsers: [BASE_USER, buyerProfile],
  });
  assert.equal(sellingToBeShipped.length, 1);
  assert.equal(sellingToBeShipped[0].order?.id, 'ord_pending');

  // Buying view: shows the listing inquiry sent to seller user_2, excludes friend chat
  const buyingAll = resolveMarketplaceInboxEntries({
    currentUid: 'user_1',
    role: 'buying',
    filter: 'all',
    buyerOrders: [],
    sellerOrders,
    threads,
    products: PRODUCTS,
    stores: [STORE_A, STORE_B],
    knownUsers: [BASE_USER, buyerProfile],
  });
  assert.equal(buyingAll.length, 1);
  assert.equal(buyingAll[0].thread?.id, 'dm_user_1_user_2');
  assert.equal(buyingAll[0].listingTitle, 'UK Used Laptops Mini · GHS3,200');
});
