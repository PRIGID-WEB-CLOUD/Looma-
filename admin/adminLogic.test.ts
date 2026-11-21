import test from 'node:test';
import assert from 'node:assert/strict';
import type { Post, StoryGroup, UserProfile } from '../src/types/social';
import {
  ADMIN_ROLE_PERMISSIONS,
  DEFAULT_COMMUNITY_GUIDELINES,
  DEFAULT_FEATURE_FLAGS,
  appendAuditEntry,
  assignAdminRole,
  computeCategoryBreakdown,
  computeExtendedWorkspaceMetrics,
  computeHashtagStats,
  computeWorkspaceMetrics,
  countExpiredStories,
  filterAdminComments,
  filterAdminMembers,
  filterAdminPosts,
  filterAppeals,
  filterAuditLogs,
  filterReports,
  formatStorageBytes,
  removeMemberFromChatIds,
  resolveAdminAuthorization,
  reviewAppealDecision,
  reviewVerificationRequestDecision,
  revokeAdminRole,
  setMemberModerationStatus,
  sortVerificationRequests,
  toggleHiddenPostId,
  toggleRestrictedMemberUid,
  updateAccessInquiryStatus,
  updateReportResolution,
  validateAnnouncementInput,
  validateCategoryInput,
  validateDirectWarningInput,
  validateGroupChatModerationTitle,
  validateGuidelinesInput,
  validateLegalConfigInput,
  validateProfileSanitizeInput,
  validateVerificationRequestInput,
  type AdminAccessInquiry,
  type AdminAuditEntry,
  type AdminCommentItem,
  type AdminRoleEntry,
  type ContentReport,
  type MemberModerationRecord,
  type ModerationAppeal,
  type PlatformAnnouncement,
  type VerificationRequest,
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
    displayName: 'Nora Halvorsen',
    handle: 'nora.studio',
    bio: 'Photographer',
    avatarUrl: '',
    location: 'Oslo',
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
    authorName: 'Nora Halvorsen',
    authorHandle: 'nora.studio',
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

function createTestFixture(nowMs: number) {
  const storyGroups: StoryGroup[] = [
    {
      authorId: 'u_member',
      authorName: 'Nora Halvorsen',
      authorHandle: 'nora.studio',
      authorAvatar: '',
      hasUnviewed: true,
      latestCreatedAtMs: nowMs - 2_000_000,
      items: [
        {
          id: 'story_live',
          authorId: 'u_member',
          authorName: 'Nora Halvorsen',
          authorHandle: 'nora.studio',
          authorAvatar: '',
          imageUrl: '',
          caption: 'Live frame',
          createdAtMs: nowMs - 2_000_000,
          expiresAtMs: nowMs + 84_000_000,
        },
        {
          id: 'story_expired',
          authorId: 'u_member',
          authorName: 'Nora Halvorsen',
          authorHandle: 'nora.studio',
          authorAvatar: '',
          imageUrl: '',
          caption: 'Expired frame',
          createdAtMs: nowMs - 90_000_000,
          expiresAtMs: nowMs - 10_000,
        },
      ],
    },
  ];

  const reports: ContentReport[] = [
    {
      id: 'rep_spam_01',
      targetType: 'post',
      targetId: 'p_1',
      targetAuthorUid: 'u_member',
      targetSummary: 'Spam link report',
      reporterUid: 'u_admin',
      reporterName: 'Alex Rivera',
      category: 'spam',
      severity: 'high',
      reason: 'Unsolicited promotional link.',
      status: 'open',
      resolutionAction: '',
      reviewedBy: '',
      reviewedAtMs: 0,
      createdAtMs: nowMs - 700_000,
      updatedAtMs: nowMs - 700_000,
    },
    {
      id: 'rep_attr_02',
      targetType: 'story',
      targetId: 'story_live',
      targetAuthorUid: 'u_member',
      targetSummary: 'Missing credit note',
      reporterUid: 'u_admin',
      reporterName: 'Alex Rivera',
      category: 'copyright',
      severity: 'low',
      reason: 'Missing architect credit.',
      status: 'reviewing',
      resolutionAction: 'Pending attribution note',
      reviewedBy: 'u_admin',
      reviewedAtMs: nowMs - 300_000,
      createdAtMs: nowMs - 3_200_000,
      updatedAtMs: nowMs - 300_000,
    },
  ];

  const appeals: ModerationAppeal[] = [
    {
      id: 'app_01',
      appellantUid: 'u_member',
      appellantName: 'Nora Halvorsen',
      appellantHandle: 'nora.studio',
      reportId: 'rep_spam_01',
      targetId: 'p_1',
      reason: 'Links removed; requesting restore.',
      status: 'pending',
      reviewerUid: '',
      reviewerNote: '',
      createdAtMs: nowMs - 400_000,
      updatedAtMs: nowMs - 400_000,
    },
  ];

  const announcements: PlatformAnnouncement[] = [
    {
      id: 'ann_1',
      title: 'Scheduled Maintenance',
      body: 'Storage maintenance window tonight.',
      severity: 'info',
      audience: 'all',
      active: true,
      authorUid: 'u_admin',
      authorName: 'Alex Rivera',
      createdAtMs: nowMs - 86_400_000,
      updatedAtMs: nowMs - 86_400_000,
    },
  ];

  const adminRoles: AdminRoleEntry[] = [
    {
      uid: 'u_admin',
      email: 'prigidholdings@gmail.com',
      displayName: 'Alex Rivera',
      role: 'super_admin',
      permissions: [...ADMIN_ROLE_PERMISSIONS.super_admin],
      grantedBy: 'system',
      createdAtMs: nowMs - 86_400_000,
      updatedAtMs: nowMs - 86_400_000,
    },
  ];

  const memberModerationRecords: Record<string, MemberModerationRecord> = {
    u_member: {
      uid: 'u_member',
      status: 'restricted',
      reason: 'Pending spam review.',
      updatedBy: 'u_admin',
      updatedAtMs: nowMs - 500_000,
    },
  };

  const auditLogs: AdminAuditEntry[] = [];
  const inquiries: AdminAccessInquiry[] = [];

  return {
    storyGroups,
    reports,
    appeals,
    announcements,
    adminRoles,
    memberModerationRecords,
    auditLogs,
    inquiries,
    guidelines: DEFAULT_COMMUNITY_GUIDELINES,
    featureFlags: DEFAULT_FEATURE_FLAGS,
  };
}

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
      email: 'nora@looma.studio',
      displayName: 'Nora Halvorsen',
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
  const fixture = createTestFixture(1_700_000_000_000);

  const sortedOpen = filterReports(fixture.reports, '', 'all', 'all');
  assert.equal(sortedOpen[0].status, 'open');
  assert.equal(sortedOpen[0].severity, 'high');

  const resolvedReports = updateReportResolution(
    fixture.reports,
    'rep_spam_01',
    'resolved',
    'Removed post & restricted author',
    'u_admin',
    1_700_000_005_000
  );
  const resolvedItem = resolvedReports.find((r) => r.id === 'rep_spam_01');
  assert.equal(resolvedItem?.status, 'resolved');
  assert.equal(resolvedItem?.resolutionAction, 'Removed post & restricted author');

  const appealMissingNote = reviewAppealDecision(
    fixture.appeals,
    'app_01',
    'approved',
    '',
    'u_admin'
  );
  assert.equal(appealMissingNote.ok, false);

  const appealApproved = reviewAppealDecision(
    fixture.appeals,
    'app_01',
    'approved',
    'Spam links deleted; restoring standard posting access.',
    'u_admin',
    1_700_000_010_000
  );
  assert.equal(appealApproved.ok, true);
  assert.equal(filterAppeals(fixture.appeals, '', 'pending').length, 1);

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

  const logs = appendAuditEntry(fixture.auditLogs, {
    actorUid: 'u_admin',
    actorEmail: 'prigidholdings@gmail.com',
    action: 'report.resolve',
    targetType: 'report',
    targetId: 'rep_spam_01',
    summary: 'Resolved spam report rep_spam_01.',
    createdAtMs: 1_700_000_020_000,
  });
  assert.equal(filterAuditLogs(logs, 'rep_spam_01', 'report.resolve').length, 1);

  const breakdown = computeCategoryBreakdown(SAMPLE_POSTS);
  assert.equal(breakdown.length, 5);
  assert.equal(breakdown[0].totalLikes > 0, true);

  const expiredCount = countExpiredStories(fixture.storyGroups, 1_700_000_000_000);
  assert.equal(expiredCount, 1);

  const extended = computeExtendedWorkspaceMetrics({
    currentProfile: SAMPLE_PROFILES[0],
    communityUsers: [SAMPLE_PROFILES[1]],
    posts: SAMPLE_POSTS,
    storyGroups: fixture.storyGroups,
    onlineUserIds: ['u_admin'],
    moderation: { hiddenPostIds: [], restrictedUids: ['u_member'] },
    memberModerationRecords: fixture.memberModerationRecords,
    inquiries: fixture.inquiries,
    reports: fixture.reports,
    appeals: fixture.appeals,
    announcements: fixture.announcements,
    adminRoles: fixture.adminRoles,
  });
  assert.equal(extended.openReports, 2);
  assert.equal(extended.pendingAppeals, 1);
  assert.equal(extended.activeAnnouncements, 1);
  assert.equal(extended.adminOperators, 1);
});

test('comment filtering, hashtag stats, direct warnings, profile sanitization, chat moderation, and storage helpers behave accurately', () => {
  const comments: AdminCommentItem[] = [
    {
      id: 'c_1',
      postId: 'p_1',
      postCaption: 'Concrete study',
      authorId: 'u_member',
      authorName: 'Nora Halvorsen',
      authorHandle: 'nora.studio',
      authorAvatar: '',
      text: 'Love the daylight shadows here!',
      createdAtMs: 1000,
    },
    {
      id: 'c_2',
      postId: 'p_2',
      postCaption: 'Film scans',
      authorId: 'u_spam',
      authorName: 'Spammer',
      authorHandle: 'spam_bot',
      authorAvatar: '',
      text: 'Check out cheap followers at spam.example',
      createdAtMs: 2000,
    },
  ];
  const spamMatches = filterAdminComments(comments, 'followers');
  assert.equal(spamMatches.length, 1);
  assert.equal(spamMatches[0].id, 'c_2');

  const taggedPosts: Post[] = [
    { ...SAMPLE_POSTS[0], caption: 'Morning study #architecture #brutalism' },
    { ...SAMPLE_POSTS[1], caption: 'Camera test #photography #architecture' },
  ];
  const stats = computeHashtagStats(
    ['architecture', 'design'],
    ['brutalism', 'photography'],
    taggedPosts
  );
  assert.equal(stats[0].tag, 'architecture');
  assert.equal(stats[0].postCount, 2);
  const brutalismStat = stats.find((s) => s.tag === 'brutalism');
  assert.equal(brutalismStat?.isDynamic, true);
  assert.equal(brutalismStat?.postCount, 1);

  assert.equal(validateDirectWarningInput('', 'Title', 'Message body').valid, false);
  assert.equal(validateDirectWarningInput('u_1', 'Hi', 'Message body').valid, false);
  assert.equal(
    validateDirectWarningInput('u_1', 'Policy Warning', 'Please remove spam links from your bio.').valid,
    true
  );

  assert.equal(
    validateProfileSanitizeInput({
      displayName: 'Valid Name',
      handle: 'invalid handle!',
      bio: 'Clean bio',
      location: 'Berlin',
      avatarUrl: '',
    }).valid,
    false
  );
  const sanitized = validateProfileSanitizeInput({
    displayName: 'Moderated Account',
    handle: '@Clean_User_1',
    bio: 'Updated bio',
    location: 'Studio',
    avatarUrl: '',
  });
  assert.equal(sanitized.valid, true);
  if (sanitized.valid) {
    assert.equal(sanitized.data.handle, 'clean_user_1');
  }

  assert.equal(validateGroupChatModerationTitle('').valid, false);
  assert.equal(validateGroupChatModerationTitle('Design Critiques').valid, true);
  assert.deepEqual(
    removeMemberFromChatIds(['u_1', 'u_2', 'u_3'], ['u_1'], 'u_1'),
    { memberIds: ['u_2', 'u_3'], adminIds: ['u_2'] }
  );
  assert.equal(removeMemberFromChatIds(['u_1'], ['u_1'], 'u_1'), null);

  assert.equal(validateLegalConfigInput('terms', '', 'short', 'short').valid, false);
  assert.equal(
    validateLegalConfigInput(
      'privacy',
      '2026-12-01',
      'Updated data isolation and Cloudflare R2 retention rules.',
      '1. Media Storage\nUploaded assets are stored in Cloudflare R2 with strict signature verification.'
    ).valid,
    true
  );

  assert.equal(formatStorageBytes(0), '0 B');
  assert.equal(formatStorageBytes(1536), '1.5 KB');
  assert.equal(formatStorageBytes(2 * 1024 * 1024), '2.00 MB');
});

test('verification request validation, queue sorting, and terminal review decisions enforce strict rules', () => {
  // Short / oversized reason
  assert.equal(
    validateVerificationRequestInput('too short', ['https://example.com']).valid,
    false
  );
  assert.equal(
    validateVerificationRequestInput('a'.repeat(501), ['https://example.com']).valid,
    false
  );

  // Links constraints: 1-2 valid http/https links
  assert.equal(
    validateVerificationRequestInput('Verified creative director at Studio Looma.', []).valid,
    false
  );
  assert.equal(
    validateVerificationRequestInput('Verified creative director at Studio Looma.', [
      'https://a.example.com',
      'https://b.example.com',
      'https://c.example.com',
    ]).valid,
    false
  );
  assert.equal(
    validateVerificationRequestInput('Verified creative director at Studio Looma.', [
      'ftp://example.com/profile',
    ]).valid,
    false
  );
  assert.equal(
    validateVerificationRequestInput('Verified creative director at Studio Looma.', [
      'not a valid url',
    ]).valid,
    false
  );
  assert.equal(
    validateVerificationRequestInput('Verified creative director at Studio Looma.', [
      `https://example.com/${'x'.repeat(490)}`,
    ]).valid,
    false
  );

  const validSingle = validateVerificationRequestInput(
    '  Architect publishing monographs and exhibition notes on Looma.  ',
    ['  https://portfolio.example.com/studio  ', '   ']
  );
  assert.equal(validSingle.valid, true);
  assert.equal(
    validSingle.cleanReason,
    'Architect publishing monographs and exhibition notes on Looma.'
  );
  assert.deepEqual(validSingle.cleanLinks, ['https://portfolio.example.com/studio']);

  const validTwo = validateVerificationRequestInput(
    'Photographer featured in Nordic Design Annual.',
    ['http://press.example.org/feature', 'https://github.com/creator']
  );
  assert.equal(validTwo.valid, true);
  assert.equal(validTwo.cleanLinks?.length, 2);

  // Sorting & reviewing
  const requests: VerificationRequest[] = [
    {
      id: 'vr_approved',
      uid: 'u_1',
      displayName: 'Approved Creator',
      handle: 'approved.creator',
      avatarUrl: '',
      reason: 'Portfolio verified.',
      links: ['https://example.com/1'],
      status: 'approved',
      reviewerUid: 'u_admin',
      reviewerNote: 'Confirmed.',
      createdAtMs: 5000,
      updatedAtMs: 5000,
    },
    {
      id: 'vr_pending_old',
      uid: 'u_2',
      displayName: 'Pending Old',
      handle: 'pending.old',
      avatarUrl: '',
      reason: 'Need badge for official studio channel.',
      links: ['https://example.com/2'],
      status: 'pending',
      createdAtMs: 1000,
      updatedAtMs: 1000,
    },
    {
      id: 'vr_pending_new',
      uid: 'u_3',
      displayName: 'Pending New',
      handle: 'pending.new',
      avatarUrl: '',
      reason: 'Official design publication account.',
      links: ['https://example.com/3', 'https://github.com/pub'],
      status: 'pending',
      createdAtMs: 3000,
      updatedAtMs: 3000,
    },
  ];

  const sorted = sortVerificationRequests(requests);
  assert.deepEqual(
    sorted.map((r) => r.id),
    ['vr_pending_new', 'vr_pending_old', 'vr_approved']
  );

  // Unknown id
  const notFound = reviewVerificationRequestDecision(
    requests,
    'vr_missing',
    'approved',
    'u_admin'
  );
  assert.equal(notFound.ok, false);

  // Terminal lock prevents re-reviewing an already approved/rejected request
  const alreadyReviewed = reviewVerificationRequestDecision(
    requests,
    'vr_approved',
    'rejected',
    'u_admin',
    'Trying to overwrite'
  );
  assert.equal(alreadyReviewed.ok, false);

  // Approve pending request
  const approved = reviewVerificationRequestDecision(
    requests,
    'vr_pending_new',
    'approved',
    'u_admin',
    '  Links match studio domain.  ',
    9000
  );
  assert.equal(approved.ok, true);
  if (approved.ok) {
    assert.equal(approved.updated.status, 'approved');
    assert.equal(approved.updated.reviewerUid, 'u_admin');
    assert.equal(approved.updated.reviewerNote, 'Links match studio domain.');
    assert.equal(approved.updated.updatedAtMs, 9000);
    // Once approved, cannot be reviewed again
    const doubleReview = reviewVerificationRequestDecision(
      approved.requests,
      'vr_pending_new',
      'rejected',
      'u_admin'
    );
    assert.equal(doubleReview.ok, false);
  }

  // Reject pending request
  const rejected = reviewVerificationRequestDecision(
    requests,
    'vr_pending_old',
    'rejected',
    'u_admin',
    'Could not confirm ownership of reference link.',
    9500
  );
  assert.equal(rejected.ok, true);
  if (rejected.ok) {
    assert.equal(rejected.updated.status, 'rejected');
    assert.equal(
      rejected.updated.reviewerNote,
      'Could not confirm ownership of reference link.'
    );
  }
});

test('five-status verification workflow supports under_review, more_info_required, business targetType, and terminal locks', () => {
  const queue: VerificationRequest[] = [
    {
      id: 'vr_rejected',
      uid: 'u_1',
      targetType: 'personal',
      displayName: 'Personal User',
      handle: 'personaluser',
      avatarUrl: '',
      reason: 'Personal profile verification.',
      links: ['https://personal.example.com'],
      status: 'rejected',
      createdAtMs: 9000,
      updatedAtMs: 9000,
    },
    {
      id: 'vr_more_info',
      uid: 'u_2',
      targetType: 'business',
      businessProfileId: 'bp_cloud',
      displayName: 'Prigid Web Cloud',
      handle: 'prigidwebcloud',
      avatarUrl: '',
      reason: 'Official company storefront and engineering cloud.',
      links: ['https://prigid.example.com'],
      documentUrls: ['https://cdn.example.com/incorporation.pdf'],
      status: 'more_info_required',
      createdAtMs: 8000,
      updatedAtMs: 8000,
    },
    {
      id: 'vr_under_review',
      uid: 'u_3',
      targetType: 'business',
      businessProfileId: 'bp_atelier',
      displayName: 'Luxe Atelier',
      handle: 'luxeatelier',
      avatarUrl: '',
      reason: 'Registered studio storefront with catalog items.',
      links: ['https://atelier.example.com'],
      status: 'under_review',
      createdAtMs: 6000,
      updatedAtMs: 6000,
    },
  ];

  // under_review sorts with active pending tier, ahead of more_info_required, ahead of terminal rejected
  const sorted = sortVerificationRequests(queue);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['vr_under_review', 'vr_more_info', 'vr_rejected']
  );

  // Move more_info_required -> under_review -> approved
  const step1 = reviewVerificationRequestDecision(
    queue,
    'vr_more_info',
    'under_review',
    'u_admin',
    'Inspecting incorporation PDF.',
    10000
  );
  assert.equal(step1.ok, true);
  if (step1.ok) {
    assert.equal(step1.updated.status, 'under_review');
    assert.equal(step1.updated.targetType, 'business');
    assert.equal(step1.updated.businessProfileId, 'bp_cloud');

    const step2 = reviewVerificationRequestDecision(
      step1.requests,
      'vr_more_info',
      'approved',
      'u_admin',
      'Business documents verified.',
      11000
    );
    assert.equal(step2.ok, true);
    if (step2.ok) {
      assert.equal(step2.updated.status, 'approved');
      // Approved becomes terminal
      const locked = reviewVerificationRequestDecision(
        step2.requests,
        'vr_more_info',
        'more_info_required',
        'u_admin'
      );
      assert.equal(locked.ok, false);
    }
  }
});



