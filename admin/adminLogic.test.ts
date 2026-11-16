import test from 'node:test';
import assert from 'node:assert/strict';
import type { Post, UserProfile } from '../src/types/social';
import {
  appendAuditEntry,
  assignAdminRole,
  computeCategoryBreakdown,
  computeExtendedWorkspaceMetrics,
  computeWorkspaceMetrics,
  countExpiredStories,
  createAutostartAdminSeed,
  filterAdminMembers,
  filterAdminPosts,
  filterAppeals,
  filterAuditLogs,
  filterReports,
  resolveAdminAuthorization,
  reviewAppealDecision,
  revokeAdminRole,
  setMemberModerationStatus,
  toggleHiddenPostId,
  toggleRestrictedMemberUid,
  updateAccessInquiryStatus,
  updateReportResolution,
  validateAnnouncementInput,
  validateGuidelinesInput,
} from './adminLogic';

test('resolveAdminAuthorization enforces authentication, verified email, and role checks', () => {
  assert.deepEqual(
    resolveAdminAuthorization({
      isAuthorized: false,
      email: 'prigidwebcloud@gmail.com',
      emailVerified: true,
      hasAdminDoc: true,
    }),
    { isAdmin: false, reason: 'unauthenticated' }
  );

  assert.deepEqual(
    resolveAdminAuthorization({
      isAuthorized: true,
      email: 'prigidwebcloud@gmail.com',
      emailVerified: false,
      hasAdminDoc: false,
    }),
    { isAdmin: false, reason: 'unverified' }
  );

  assert.deepEqual(
    resolveAdminAuthorization({
      isAuthorized: true,
      email: 'member@example.com',
      emailVerified: true,
      hasAdminDoc: false,
    }),
    { isAdmin: false, reason: 'forbidden' }
  );

  assert.deepEqual(
    resolveAdminAuthorization({
      isAuthorized: true,
      email: 'PRIGIDWEBCLOUD@gmail.com',
      emailVerified: true,
      hasAdminDoc: false,
    }),
    { isAdmin: true, reason: 'ok-allowlist' }
  );

  assert.deepEqual(
    resolveAdminAuthorization({
      isAuthorized: true,
      email: 'operator@looma.studio',
      emailVerified: true,
      hasAdminDoc: true,
    }),
    { isAdmin: true, reason: 'ok-admin-doc' }
  );

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

test('member suspension, restoration, and admin role RBAC prevent self-lockout and require justification', () => {
  const selfAttempt = setMemberModerationStatus({}, 'u_admin', 'suspended', 'Test', 'u_admin');
  assert.equal(selfAttempt.ok, false);

  const missingReason = setMemberModerationStatus({}, 'u_member', 'suspended', ' ', 'u_admin');
  assert.equal(missingReason.ok, false);

  const suspended = setMemberModerationStatus(
    {},
    'u_member',
    'suspended',
    'Repeated abuse after warnings.',
    'u_admin',
    9000
  );
  assert.equal(suspended.ok, true);
  if (!suspended.ok) return;
  assert.equal(suspended.records.u_member.status, 'suspended');

  const suspendedFilter = filterAdminMembers(
    SAMPLE_PROFILES,
    '',
    'suspended',
    [],
    [],
    ['u_member'],
    ['u_admin']
  );
  assert.equal(suspendedFilter.length, 1);
  assert.equal(suspendedFilter[0].uid, 'u_member');

  const granted = assignAdminRole(
    [],
    {
      uid: 'u_member',
      email: 'sophia@looma.studio',
      displayName: 'Sophia Chen',
      role: 'moderator',
    },
    'u_admin',
    9100
  );
  assert.equal(granted.ok, true);
  if (!granted.ok) return;
  assert.equal(granted.entry.role, 'moderator');
  assert.ok(granted.entry.permissions.includes('reports.resolve'));

  const selfRevoke = revokeAdminRole(granted.roles, 'u_admin', 'u_admin');
  assert.equal(selfRevoke.ok, false);

  const revoked = revokeAdminRole(granted.roles, 'u_member', 'u_admin');
  assert.equal(revoked.ok, true);
  if (revoked.ok) {
    assert.equal(revoked.roles.length, 0);
  }
});

test('reports queue sorting, appeal decisions, governance validation, audit trail, and category analytics work accurately', () => {
  const seed = createAutostartAdminSeed(1_700_000_000_000);

  const sortedOpen = filterReports(seed.reports, '', 'all', 'all');
  assert.equal(sortedOpen[0].status, 'open');
  assert.equal(sortedOpen[0].severity, 'high');

  const resolvedReports = updateReportResolution(
    seed.reports,
    'rep_spam_01',
    'resolved',
    'Removed post & restricted author',
    'admin_operator_1',
    1_700_000_005_000
  );
  const resolvedItem = resolvedReports.find((r) => r.id === 'rep_spam_01');
  assert.equal(resolvedItem?.status, 'resolved');
  assert.equal(resolvedItem?.resolutionAction, 'Removed post & restricted author');

  const appealMissingNote = reviewAppealDecision(
    seed.appeals,
    'app_01',
    'approved',
    '',
    'admin_operator_1'
  );
  assert.equal(appealMissingNote.ok, false);

  const appealApproved = reviewAppealDecision(
    seed.appeals,
    'app_01',
    'approved',
    'Spam links deleted; restoring standard posting access.',
    'admin_operator_1',
    1_700_000_010_000
  );
  assert.equal(appealApproved.ok, true);
  assert.equal(filterAppeals(seed.appeals, '', 'pending').length, 1);

  assert.equal(validateAnnouncementInput('ab', 'Too short').valid, false);
  assert.equal(
    validateAnnouncementInput('Scheduled Upgrade', 'Database index maintenance at 02:00 UTC.').valid,
    true
  );

  assert.equal(validateGuidelinesInput('', 'Summary too short', 'Rules').valid, false);
  assert.equal(
    validateGuidelinesInput(
      '2026.05',
      'Updated attribution and content safety policies.',
      'All members must credit original photography and refrain from spam or harassment.'
    ).valid,
    true
  );

  const logs = appendAuditEntry(seed.auditLogs, {
    actorUid: 'admin_operator_1',
    actorEmail: 'prigidholdings@gmail.com',
    action: 'report.resolve',
    targetType: 'report',
    targetId: 'rep_spam_01',
    summary: 'Resolved spam report rep_spam_01.',
    createdAtMs: 1_700_000_020_000,
  });
  assert.equal(filterAuditLogs(logs, 'rep_spam_01', 'report.resolve').length, 1);

  const breakdown = computeCategoryBreakdown(seed.posts);
  assert.equal(breakdown.length, 5);
  assert.equal(breakdown[0].totalLikes > 0, true);

  const expiredCount = countExpiredStories(seed.storyGroups, 1_700_000_000_000);
  assert.equal(expiredCount, 1);

  const extended = computeExtendedWorkspaceMetrics({
    currentProfile: seed.currentProfile,
    communityUsers: seed.communityUsers,
    posts: seed.posts,
    storyGroups: seed.storyGroups,
    onlineUserIds: seed.onlineUserIds,
    moderation: seed.moderation,
    memberModerationRecords: seed.memberModerationRecords,
    inquiries: seed.inquiries,
    reports: seed.reports,
    appeals: seed.appeals,
    announcements: seed.announcements,
    adminRoles: seed.adminRoles,
  });
  assert.equal(extended.openReports, 2);
  assert.equal(extended.pendingAppeals, 1);
  assert.equal(extended.activeAnnouncements, 1);
});
