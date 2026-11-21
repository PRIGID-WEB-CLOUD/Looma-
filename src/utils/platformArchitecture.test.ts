import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateBusinessHandleFromName,
  suggestAlternativeBusinessHandles,
  validateBusinessProfileInput,
} from './businessProfileValidation';
import { buildScopedCacheKey } from './cacheIsolation';
import {
  buildIdentityMaps,
  buildNestedCommentTree,
  resolveCommentIdentity,
  resolvePostIdentity,
} from './identityResolver';
import { runUnifiedSearch } from './searchLogic';
import type { BusinessProfile } from '../types/business';
import type { MarketplaceProduct } from '../types/marketplace';
import type { Post, PostComment, UserProfile } from '../types/social';

test('automatic business @handle generation and conflict suggestions remain independent', () => {
  assert.equal(
    generateBusinessHandleFromName('Prigid Web Cloud'),
    'prigidwebcloud'
  );
  assert.equal(
    generateBusinessHandleFromName('  Atelier & Co. — 2026!  '),
    'atelierco2026'
  );

  const suggestions = suggestAlternativeBusinessHandles(
    'prigidwebcloud',
    new Set(['prigidwebcloud', 'prigidwebcloudhq'])
  );
  assert.ok(!suggestions.includes('prigidwebcloud'));
  assert.ok(!suggestions.includes('prigidwebcloudhq'));
  assert.ok(suggestions.includes('prigidwebcloudstudio'));

  const validBiz = validateBusinessProfileInput({
    displayName: 'Prigid Web Cloud',
    slug: '',
    category: 'Electronics & Tech',
    bio: 'Managed hosting infrastructure.',
    websiteUrl: 'https://prigid.example.com',
  });
  assert.equal(validBiz.valid, true);
  assert.equal(validBiz.clean.slug, 'prigidwebcloud');
});

test('platform & profile cache keys isolate Normal and Business state cleanly', () => {
  const normalSearchKey = buildScopedCacheKey('normal', 'u_1', 'search', 'recent_v1');
  const bizSearchKey = buildScopedCacheKey('business', 'bp_cloud', 'search', 'recent_v1');
  const otherBizKey = buildScopedCacheKey('business', 'bp_studio', 'search', 'recent_v1');

  assert.notEqual(normalSearchKey, bizSearchKey);
  assert.notEqual(bizSearchKey, otherBizKey);
  assert.equal(normalSearchKey, 'normal:u_1:search:recent_v1');
  assert.equal(bizSearchKey, 'business:bp_cloud:search:recent_v1');
});

test('nested comments, business comment attribution, and post author resolution preserve profile isolation', () => {
  const user: UserProfile = {
    uid: 'u_owner',
    displayName: 'Elena Ortiz',
    handle: 'elenaortiz',
    bio: 'Personal notes',
    avatarUrl: 'https://cdn.example.com/u.jpg',
    location: 'Austin',
    interests: [],
    followersCount: 12,
    followingCount: 4,
    isVerified: false,
    onboardingCompleted: true,
    createdAtMs: 1000,
    updatedAtMs: 1000,
  };
  const biz: BusinessProfile = {
    id: 'bp_cloud',
    slug: 'prigidwebcloud',
    displayName: 'Prigid Web Cloud',
    bio: 'Cloud studio',
    logoUrl: 'https://cdn.example.com/bp.jpg',
    bannerUrl: '',
    category: 'Electronics & Tech',
    currency: 'USD',
    ownerUid: 'u_owner',
    status: 'ACTIVE',
    verified: true,
    followersCount: 88,
    createdAtMs: 1000,
    updatedAtMs: 2000,
  };

  const maps = buildIdentityMaps([], user, [biz]);

  const rawPost: Post = {
    id: 'post_1',
    authorId: 'bp_cloud',
    authorType: 'business',
    businessProfileId: 'bp_cloud',
    authorName: 'Old Name',
    authorHandle: 'oldslug',
    authorAvatar: '',
    authorVerified: false,
    caption: 'Launching edge deploy #cloud #hosting',
    category: 'Work',
    imageUrl: '',
    likesCount: 5,
    commentsCount: 2,
    createdAtMs: 3000,
    updatedAtMs: 3000,
  };

  const resolvedPost = resolvePostIdentity(rawPost, maps);
  assert.equal(resolvedPost.authorName, 'Prigid Web Cloud');
  assert.equal(resolvedPost.authorHandle, 'prigidwebcloud');
  assert.equal(resolvedPost.authorVerified, true);

  const rootComment: PostComment = {
    id: 'c_root',
    postId: 'post_1',
    authorId: 'u_owner',
    authorType: 'personal',
    authorName: 'Old Elena',
    authorHandle: 'elenaortiz',
    authorAvatar: '',
    text: 'Congrats on the launch!',
    likesCount: 4,
    createdAtMs: 3100,
  };
  const replyFromBiz: PostComment = {
    id: 'c_reply',
    postId: 'post_1',
    parentCommentId: 'c_root',
    authorId: 'bp_cloud',
    authorType: 'business',
    businessProfileId: 'bp_cloud',
    actorUid: 'u_owner',
    authorName: 'Old Biz',
    authorHandle: 'oldslug',
    authorAvatar: '',
    text: 'Thank you from our engineering team!',
    likesCount: 1,
    createdAtMs: 3200,
  };

  const resolvedRoot = resolveCommentIdentity(rootComment, maps);
  const resolvedReply = resolveCommentIdentity(replyFromBiz, maps);
  assert.equal(resolvedRoot.authorName, 'Elena Ortiz');
  assert.equal(resolvedRoot.authorVerified, false);
  assert.equal(resolvedReply.authorName, 'Prigid Web Cloud');
  assert.equal(resolvedReply.authorVerified, true);

  const tree = buildNestedCommentTree([resolvedReply, resolvedRoot], 'top');
  assert.equal(tree.length, 1);
  assert.equal(tree[0].comment.id, 'c_root');
  assert.equal(tree[0].replies.length, 1);
  assert.equal(tree[0].replies[0].id, 'c_reply');
});

test('unified search resolves people, businesses, posts, videos, products, hashtags, and places', () => {
  const users: UserProfile[] = [
    {
      uid: 'u_1',
      displayName: 'Maya Chen',
      handle: 'mayachen',
      bio: 'Ceramicist in Kyoto',
      avatarUrl: '',
      location: 'Kyoto',
      interests: [],
      followersCount: 10,
      followingCount: 5,
      onboardingCompleted: true,
      createdAtMs: 1000,
      updatedAtMs: 1000,
    },
  ];
  const businesses: BusinessProfile[] = [
    {
      id: 'bp_1',
      slug: 'kyotokiln',
      displayName: 'Kyoto Kiln Works',
      bio: 'Small-batch stoneware',
      logoUrl: '',
      bannerUrl: '',
      category: 'Home & Living',
      location: 'Kyoto',
      currency: 'USD',
      ownerUid: 'u_1',
      status: 'ACTIVE',
      verified: true,
      followersCount: 30,
      createdAtMs: 1000,
      updatedAtMs: 1000,
    },
  ];
  const posts: Post[] = [
    {
      id: 'p_vid',
      authorId: 'bp_1',
      authorType: 'business',
      businessProfileId: 'bp_1',
      authorName: 'Kyoto Kiln Works',
      authorHandle: 'kyotokiln',
      authorAvatar: '',
      caption: 'Wood firing timelapse #ceramics #kyoto',
      category: 'Studio',
      imageUrl: '',
      videoUrl: 'https://cdn.example.com/kiln.mp4',
      likesCount: 9,
      commentsCount: 0,
      createdAtMs: 5000,
      updatedAtMs: 5000,
    },
  ];
  const products: MarketplaceProduct[] = [
    {
      id: 'prod_1',
      storeId: 'store_1',
      storeName: 'Kyoto Kiln Works',
      storeSlug: 'kyotokiln',
      ownerUid: 'u_1',
      businessProfileId: 'bp_1',
      title: 'Kyoto Matcha Bowl',
      description: 'Hand-glazed stoneware bowl',
      category: 'Home & Living',
      priceCents: 6500,
      currency: 'USD',
      imageUrl: '',
      location: 'Kyoto',
      stock: 5,
      status: 'ACTIVE',
      featured: true,
      createdAtMs: 1000,
      updatedAtMs: 1000,
    },
  ];

  const kyoto = runUnifiedSearch({
    query: 'kyoto',
    users,
    businesses,
    posts,
    products,
    savedHashtags: ['ceramics', 'photography'],
  });
  assert.equal(kyoto.people.length, 1);
  assert.equal(kyoto.businesses.length, 1);
  assert.equal(kyoto.posts.length, 1);
  assert.equal(kyoto.videos.length, 1);
  assert.equal(kyoto.products.length, 1);
  assert.deepEqual(
    kyoto.hashtags.map((h) => h.tag),
    ['kyoto']
  );
  assert.equal(kyoto.places[0]?.name, 'Kyoto');
});
