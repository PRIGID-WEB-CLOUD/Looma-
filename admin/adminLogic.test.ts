import test from 'node:test';
import assert from 'node:assert/strict';
import type { Post, UserProfile } from '../src/types/social';
import {
  computeWorkspaceMetrics,
  filterAdminMembers,
  filterAdminPosts,
  resolveAdminAuthorization,
  toggleHiddenPostId,
  toggleRestrictedMemberUid,
  updateAccessInquiryStatus,
} from './adminLogic';

test('resolveAdminAuthorization enforces authentication, verified email, and role checks', () => {
  // Unauthenticated even with admin email must fail
  assert.deepEqual(
    resolveAdminAuthorization({
      isAuthorized: false,
      email: 'prigidwebcloud@gmail.com',
      emailVerified: true,
      hasAdminDoc: true,
    }),
    { isAdmin: false, reason: 'unauthenticated' }
  );

  // Spoofed/unverified email matching allowlist must fail
  assert.deepEqual(
    resolveAdminAuthorization({
      isAuthorized: true,
      email: 'prigidwebcloud@gmail.com',
      emailVerified: false,
      hasAdminDoc: false,
    }),
    { isAdmin: false, reason: 'unverified' }
  );

  // Standard verified member without admin doc or allowlisted email is forbidden
  assert.deepEqual(
    resolveAdminAuthorization({
      isAuthorized: true,
      email: 'member@example.com',
      emailVerified: true,
      hasAdminDoc: false,
    }),
    { isAdmin: false, reason: 'forbidden' }
  );

  // Verified allowlisted admin succeeds
  assert.deepEqual(
    resolveAdminAuthorization({
      isAuthorized: true,
      email: 'PRIGIDWEBCLOUD@gmail.com',
      emailVerified: true,
      hasAdminDoc: false,
    }),
    { isAdmin: true, reason: 'ok-allowlist' }
  );

  // Verified user with Firestore /admins/{uid} doc succeeds
  assert.deepEqual(
    resolveAdminAuthorization({
      isAuthorized: true,
      email: 'operator@looma.studio',
      emailVerified: true,
      hasAdminDoc: true,
    }),
    { isAdmin: true, reason: 'ok-admin-doc' }
  );

  // Local autostart preview succeeds on localhost
  assert.deepEqual(
    resolveAdminAuthorization({
      isAuthorized: true,
      email: null,
      emailVerified: false,
      isLocalAutostart: true,
    }),
    { isAdmin: true, reason: 'ok-local-preview' }
  );
});

const SAMPLE_PROFILES: UserProfile[] = [
  {
    uid: 'u_admin',
    displayName: 'Alex Rivera',
    handle: 'alex.rivera',
    bio: 'Workspace admin',
    avatarUrl: '',
    location: 'London',
    interests: ['Architecture'],
    followersCount: 12,
    followingCount: 4,
    onboardingCompleted: true,
    createdAtMs: 1000,
    updatedAtMs: 5000,
  },
  {
    uid: 'u_member',
    displayName: 'Sophia Chen',
    handle: 'sophia.studio',
    bio: 'Photographer',
    avatarUrl: '',
    location: 'San Francisco',
    interests: ['Photography'],
    followersCount: 42,
    followingCount: 19,
    onboardingCompleted: true,
    createdAtMs: 1000,
    updatedAtMs: 4000,
  },
];

const SAMPLE_POSTS: Post[] = [
  {
    id: 'p_1',
    authorId: 'u_member',
    authorName: 'Sophia Chen',
    authorHandle: 'sophia.studio',
    authorAvatar: '',
    caption: 'Concrete study in morning light.',
    imageUrl: '',
    category: 'Architecture',
    likesCount: 4,
    commentsCount: 1,
    createdAtMs: 4000,
    updatedAtMs: 4000,
  },
  {
    id: 'p_2',
    authorId: 'u_admin',
    authorName: 'Alex Rivera',
    authorHandle: 'alex.rivera',
    authorAvatar: '',
    caption: 'Film scans from the studio trip.',
    imageUrl: '',
    category: 'Photography',
    likesCount: 9,
    commentsCount: 2,
    createdAtMs: 3000,
    updatedAtMs: 3000,
  },
];

test('moderation toggles prevent self-restriction and filter hidden posts + members accurately', () => {
  const afterSelfRestrict = toggleRestrictedMemberUid([], 'u_admin', 'u_admin');
  assert.deepEqual(afterSelfRestrict, []);

  const afterRestrict = toggleRestrictedMemberUid([], 'u_member', 'u_admin');
  assert.deepEqual(afterRestrict, ['u_member']);

  const restrictedList = filterAdminMembers(
    SAMPLE_PROFILES,
    '',
    'restricted',
    ['u_admin'],
    afterRestrict
  );
  assert.equal(restrictedList.length, 1);
  assert.equal(restrictedList[0].uid, 'u_member');

  const hidden = toggleHiddenPostId([], 'p_1');
  assert.deepEqual(hidden, ['p_1']);
  assert.equal(filterAdminPosts(SAMPLE_POSTS, '', 'Hidden', hidden).length, 1);
  assert.equal(filterAdminPosts(SAMPLE_POSTS, 'morning', 'All', hidden).length, 1);

  const restored = toggleHiddenPostId(hidden, 'p_1');
  assert.deepEqual(restored, []);
});

test('computeWorkspaceMetrics and updateAccessInquiryStatus calculate live counts', () => {
  const updatedInquiries = updateAccessInquiryStatus(
    [
      {
        id: 'inq_1',
        fullName: 'Maya Lin',
        email: 'maya@studio.com',
        organization: 'Lin Studio',
        note: 'Joining the studio feed.',
        status: 'pending',
        createdAtMs: 1000,
      },
      {
        id: 'inq_2',
        fullName: 'Kenji Sato',
        email: 'kenji@studio.com',
        organization: 'Sato Lab',
        note: 'Need messaging workspace.',
        status: 'pending',
        createdAtMs: 2000,
      },
    ],
    'inq_1',
    'approved'
  );

  const metrics = computeWorkspaceMetrics({
    currentProfile: SAMPLE_PROFILES[0],
    communityUsers: [SAMPLE_PROFILES[1]],
    posts: SAMPLE_POSTS,
    storyGroups: [],
    onlineUserIds: ['u_member'],
    moderation: { hiddenPostIds: ['p_2'], restrictedUids: ['u_member'] },
    inquiries: updatedInquiries,
  });

  assert.equal(metrics.totalMembers, 2);
  assert.equal(metrics.onboardedMembers, 2);
  assert.equal(metrics.restrictedMembers, 1);
  assert.equal(metrics.onlineMembers, 1);
  assert.equal(metrics.totalPosts, 2);
  assert.equal(metrics.hiddenPosts, 1);
  assert.equal(metrics.pendingInquiries, 1);
});
