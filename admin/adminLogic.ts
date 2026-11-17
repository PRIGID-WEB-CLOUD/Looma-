import type { Post, PostCategory, StoryGroup, UserProfile } from '../src/types/social';
import { POST_CATEGORIES } from '../src/utils/socialLogic';

export interface AdminAccessInquiry {
  id: string;
  fullName: string;
  email: string;
  organization: string;
  note: string;
  status: 'pending' | 'approved' | 'archived';
  reviewedBy?: string;
  createdAtMs: number;
  updatedAtMs?: number;
}

export const ADMIN_EMAILS = [
  'prigidwebcloud@gmail.com',
  'prigidholdings@gmail.com',
] as const;

export interface AdminModerationState {
  hiddenPostIds: string[];
  restrictedUids: string[];
}

export type AdminRoleLevel = 'super_admin' | 'moderator' | 'analyst';

export type AdminPermissionKey =
  | 'users.manage'
  | 'roles.assign'
  | 'content.moderate'
  | 'reports.resolve'
  | 'appeals.review'
  | 'announcements.publish'
  | 'guidelines.edit'
  | 'flags.toggle'
  | 'system.ops';

export const ADMIN_ROLE_PERMISSIONS: Record<AdminRoleLevel, AdminPermissionKey[]> = {
  super_admin: [
    'users.manage',
    'roles.assign',
    'content.moderate',
    'reports.resolve',
    'appeals.review',
    'announcements.publish',
    'guidelines.edit',
    'flags.toggle',
    'system.ops',
  ],
  moderator: [
    'users.manage',
    'content.moderate',
    'reports.resolve',
    'appeals.review',
    'announcements.publish',
  ],
  analyst: ['system.ops'],
};

export interface AdminRoleEntry {
  uid: string;
  email: string;
  displayName: string;
  role: AdminRoleLevel;
  permissions: AdminPermissionKey[];
  grantedBy: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type MemberAccountStatus = 'active' | 'restricted' | 'suspended';

export interface MemberModerationRecord {
  uid: string;
  status: MemberAccountStatus;
  reason: string;
  updatedBy: string;
  updatedAtMs: number;
}

export type ReportTargetType = 'post' | 'story' | 'comment' | 'user';
export type ReportCategory =
  | 'spam'
  | 'harassment'
  | 'misinformation'
  | 'nudity'
  | 'copyright'
  | 'other';
export type ReportSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export interface ContentReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  targetAuthorUid: string;
  targetSummary: string;
  reporterUid: string;
  reporterName: string;
  category: ReportCategory;
  severity: ReportSeverity;
  reason: string;
  status: ReportStatus;
  resolutionAction: string;
  reviewedBy: string;
  reviewedAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export type AppealStatus = 'pending' | 'approved' | 'rejected';

export interface ModerationAppeal {
  id: string;
  appellantUid: string;
  appellantName: string;
  appellantHandle: string;
  reportId: string;
  targetId: string;
  reason: string;
  status: AppealStatus;
  reviewerUid: string;
  reviewerNote: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type AnnouncementSeverity = 'info' | 'warning' | 'maintenance';
export type AnnouncementAudience = 'all' | 'verified' | 'admins';

export interface PlatformAnnouncement {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  audience: AnnouncementAudience;
  active: boolean;
  authorUid: string;
  authorName: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CommunityGuidelinesConfig {
  version: string;
  summary: string;
  rulesText: string;
  updatedBy: string;
  updatedAtMs: number;
}

export interface AdminFeatureFlags {
  storiesEnabled: boolean;
  voiceNotesEnabled: boolean;
  callsEnabled: boolean;
  maintenanceMode: boolean;
  registrationsOpen: boolean;
  strictModerationQueue: boolean;
  updatedBy: string;
  updatedAtMs: number;
}

export interface AdminAuditEntry {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAtMs: number;
}

export interface SystemHealthProbe {
  id: string;
  service: string;
  status: 'healthy' | 'degraded' | 'offline';
  detail: string;
  checkedAtMs: number;
  latencyMs: number | null;
}

export interface BackgroundJobItem {
  id: string;
  name: string;
  description: string;
  cadence: string;
  lastRunAtMs: number | null;
  lastStatus: 'idle' | 'running' | 'completed' | 'failed';
  lastSummary: string;
}

export const DEFAULT_FEATURE_FLAGS: AdminFeatureFlags = {
  storiesEnabled: true,
  voiceNotesEnabled: true,
  callsEnabled: true,
  maintenanceMode: false,
  registrationsOpen: true,
  strictModerationQueue: false,
  updatedBy: 'system',
  updatedAtMs: 0,
};

export const DEFAULT_COMMUNITY_GUIDELINES: CommunityGuidelinesConfig = {
  version: '2026.04',
  summary:
    'Respectful visual collaboration, zero tolerance for harassment or impersonation, and transparent content attribution.',
  rulesText: [
    '1. Authentic Identity & Attribution: Credit original photography, architectural studies, and external media links.',
    '2. Harassment & Safety: Targeted harassment, doxxing, non-consensual imagery, or hate speech leads to immediate suspension.',
    '3. Spam & Automated Manipulation: Bulk solicitations, deceptive links, and coordinated manipulation are removed.',
    '4. Appeals & Due Process: Suspended or restricted accounts may submit an appeal with context for administrator review.',
  ].join('\n\n'),
  updatedBy: 'system',
  updatedAtMs: 0,
};

export interface AdminAuthorizationInput {
  isAuthorized: boolean;
  email: string | null | undefined;
  emailVerified: boolean;
  hasAdminDoc?: boolean;
}

export interface AdminAuthorizationResult {
  isAdmin: boolean;
  reason:
    | 'ok-admin-doc'
    | 'ok-allowlist'
    | 'unauthenticated'
    | 'unverified'
    | 'forbidden';
}

export interface WorkspaceAdminMetrics {
  totalMembers: number;
  onboardedMembers: number;
  restrictedMembers: number;
  onlineMembers: number;
  totalPosts: number;
  hiddenPosts: number;
  activeStoryAuthors: number;
  pendingInquiries: number;
}

export interface ExtendedWorkspaceMetrics extends WorkspaceAdminMetrics {
  suspendedMembers: number;
  openReports: number;
  criticalReports: number;
  pendingAppeals: number;
  activeAnnouncements: number;
  totalEngagement: number;
  adminOperators: number;
}

export interface CategoryMetric {
  category: PostCategory;
  count: number;
  totalLikes: number;
  totalComments: number;
  sharePct: number;
}

export function isAllowlistedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (ADMIN_EMAILS as readonly string[]).includes(normalized);
}

export function resolveAdminAuthorization(
  input: AdminAuthorizationInput
): AdminAuthorizationResult {
  if (!input.isAuthorized) {
    return { isAdmin: false, reason: 'unauthenticated' };
  }
  if (!input.emailVerified) {
    return { isAdmin: false, reason: 'unverified' };
  }
  if (input.hasAdminDoc) {
    return { isAdmin: true, reason: 'ok-admin-doc' };
  }
  if (isAllowlistedAdminEmail(input.email)) {
    return { isAdmin: true, reason: 'ok-allowlist' };
  }
  return { isAdmin: false, reason: 'forbidden' };
}

export function toggleHiddenPostId(
  hiddenPostIds: string[],
  postId: string
): string[] {
  if (!postId) return hiddenPostIds;
  return hiddenPostIds.includes(postId)
    ? hiddenPostIds.filter((id) => id !== postId)
    : [...hiddenPostIds, postId];
}

export function toggleRestrictedMemberUid(
  restrictedUids: string[],
  targetUid: string,
  currentAdminUid: string
): string[] {
  if (!targetUid || targetUid === currentAdminUid) {
    return restrictedUids;
  }
  return restrictedUids.includes(targetUid)
    ? restrictedUids.filter((id) => id !== targetUid)
    : [...restrictedUids, targetUid];
}

export function updateAccessInquiryStatus(
  inquiries: AdminAccessInquiry[],
  inquiryId: string,
  status: AdminAccessInquiry['status']
): AdminAccessInquiry[] {
  return inquiries.map((item) =>
    item.id === inquiryId ? { ...item, status, updatedAtMs: Date.now() } : item
  );
}

export function computeWorkspaceMetrics(input: {
  currentProfile: UserProfile;
  communityUsers: UserProfile[];
  posts: Post[];
  storyGroups: StoryGroup[];
  onlineUserIds: string[];
  moderation: AdminModerationState;
  inquiries: AdminAccessInquiry[];
}): WorkspaceAdminMetrics {
  const uniqueMembers = new Map<string, UserProfile>();
  if (input.currentProfile.uid) {
    uniqueMembers.set(input.currentProfile.uid, input.currentProfile);
  }
  for (const user of input.communityUsers) {
    if (user.uid) {
      uniqueMembers.set(user.uid, user);
    }
  }
  const allMembers = Array.from(uniqueMembers.values());
  const onlineSet = new Set(input.onlineUserIds);
  const restrictedSet = new Set(input.moderation.restrictedUids);
  const hiddenSet = new Set(input.moderation.hiddenPostIds);

  return {
    totalMembers: allMembers.length,
    onboardedMembers: allMembers.filter((m) => m.onboardingCompleted).length,
    restrictedMembers: allMembers.filter((m) => restrictedSet.has(m.uid)).length,
    onlineMembers: allMembers.filter((m) => onlineSet.has(m.uid)).length,
    totalPosts: input.posts.length,
    hiddenPosts: input.posts.filter((p) => hiddenSet.has(p.id)).length,
    activeStoryAuthors: input.storyGroups.length,
    pendingInquiries: input.inquiries.filter((i) => i.status === 'pending').length,
  };
}

export function computeExtendedWorkspaceMetrics(input: {
  currentProfile: UserProfile;
  communityUsers: UserProfile[];
  posts: Post[];
  storyGroups: StoryGroup[];
  onlineUserIds: string[];
  moderation: AdminModerationState;
  memberModerationRecords: Record<string, MemberModerationRecord>;
  inquiries: AdminAccessInquiry[];
  reports: ContentReport[];
  appeals: ModerationAppeal[];
  announcements: PlatformAnnouncement[];
  adminRoles: AdminRoleEntry[];
}): ExtendedWorkspaceMetrics {
  const base = computeWorkspaceMetrics(input);
  const modValues = Object.values(input.memberModerationRecords);
  const suspendedCount = modValues.filter((r) => r.status === 'suspended').length;
  const restrictedRecordCount = modValues.filter((r) => r.status === 'restricted').length;
  const restrictedUidsUnion = new Set([
    ...input.moderation.restrictedUids,
    ...modValues.filter((r) => r.status === 'restricted').map((r) => r.uid),
  ]);

  const openReportsList = input.reports.filter(
    (r) => r.status === 'open' || r.status === 'reviewing'
  );
  const totalEngagement = input.posts.reduce(
    (sum, p) => sum + (p.likesCount || 0) + (p.commentsCount || 0),
    0
  );

  return {
    ...base,
    restrictedMembers: Math.max(restrictedUidsUnion.size, restrictedRecordCount),
    suspendedMembers: suspendedCount,
    openReports: openReportsList.length,
    criticalReports: openReportsList.filter(
      (r) => r.severity === 'critical' || r.severity === 'high'
    ).length,
    pendingAppeals: input.appeals.filter((a) => a.status === 'pending').length,
    activeAnnouncements: input.announcements.filter((a) => a.active).length,
    totalEngagement,
    adminOperators: input.adminRoles.length,
  };
}

export type AdminMemberFilter =
  | 'all'
  | 'online'
  | 'onboarded'
  | 'restricted'
  | 'suspended'
  | 'admins';

export function filterAdminMembers(
  members: UserProfile[],
  searchQuery: string,
  filterMode: AdminMemberFilter,
  onlineUserIds: string[],
  restrictedUids: string[],
  suspendedUids: string[] = [],
  adminUids: string[] = []
): UserProfile[] {
  const q = searchQuery.trim().toLowerCase();
  const onlineSet = new Set(onlineUserIds);
  const restrictedSet = new Set(restrictedUids);
  const suspendedSet = new Set(suspendedUids);
  const adminSet = new Set(adminUids);

  return members
    .filter((member) => {
      if (filterMode === 'online' && !onlineSet.has(member.uid)) return false;
      if (filterMode === 'onboarded' && !member.onboardingCompleted) return false;
      if (filterMode === 'restricted' && !restrictedSet.has(member.uid)) return false;
      if (filterMode === 'suspended' && !suspendedSet.has(member.uid)) return false;
      if (filterMode === 'admins' && !adminSet.has(member.uid)) return false;
      if (!q) return true;
      return (
        member.displayName.toLowerCase().includes(q) ||
        member.handle.toLowerCase().includes(q) ||
        (member.location || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export function filterAdminPosts(
  posts: Post[],
  searchQuery: string,
  category: 'All' | PostCategory | 'Hidden',
  hiddenPostIds: string[]
): Post[] {
  const q = searchQuery.trim().toLowerCase();
  const hiddenSet = new Set(hiddenPostIds);

  return posts
    .filter((post) => {
      if (category === 'Hidden' && !hiddenSet.has(post.id)) return false;
      if (category !== 'All' && category !== 'Hidden' && post.category !== category) {
        return false;
      }
      if (!q) return true;
      return (
        post.caption.toLowerCase().includes(q) ||
        post.authorName.toLowerCase().includes(q) ||
        post.authorHandle.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function setMemberModerationStatus(
  records: Record<string, MemberModerationRecord>,
  targetUid: string,
  status: MemberAccountStatus,
  reason: string,
  currentAdminUid: string,
  nowMs: number = Date.now()
): { ok: true; records: Record<string, MemberModerationRecord> } | { ok: false; error: string } {
  if (!targetUid) {
    return { ok: false, error: 'Target member ID is required.' };
  }
  if (targetUid === currentAdminUid) {
    return { ok: false, error: 'Administrators cannot restrict or suspend their own account.' };
  }
  const cleanReason = reason.trim();
  if (status === 'suspended' && cleanReason.length < 3) {
    return { ok: false, error: 'Please provide a brief reason before suspending an account.' };
  }

  return {
    ok: true,
    records: {
      ...records,
      [targetUid]: {
        uid: targetUid,
        status,
        reason: cleanReason || (status === 'active' ? 'Restored by administrator' : 'Moderated by administrator'),
        updatedBy: currentAdminUid,
        updatedAtMs: nowMs,
      },
    },
  };
}

export function assignAdminRole(
  roles: AdminRoleEntry[],
  input: {
    uid: string;
    email: string;
    displayName: string;
    role: AdminRoleLevel;
  },
  currentAdminUid: string,
  nowMs: number = Date.now()
): { ok: true; roles: AdminRoleEntry[]; entry: AdminRoleEntry } | { ok: false; error: string } {
  if (!input.uid.trim() || !input.email.trim()) {
    return { ok: false, error: 'Member UID and verified email are required to assign a role.' };
  }
  const existing = roles.find((r) => r.uid === input.uid);
  const entry: AdminRoleEntry = {
    uid: input.uid.trim(),
    email: input.email.trim().toLowerCase(),
    displayName: input.displayName.trim() || input.email.trim(),
    role: input.role,
    permissions: [...ADMIN_ROLE_PERMISSIONS[input.role]],
    grantedBy: currentAdminUid,
    createdAtMs: existing?.createdAtMs ?? nowMs,
    updatedAtMs: nowMs,
  };
  const next = existing
    ? roles.map((r) => (r.uid === entry.uid ? entry : r))
    : [entry, ...roles];
  return { ok: true, roles: next, entry };
}

export function revokeAdminRole(
  roles: AdminRoleEntry[],
  targetUid: string,
  currentAdminUid: string
): { ok: true; roles: AdminRoleEntry[] } | { ok: false; error: string } {
  if (!targetUid) {
    return { ok: false, error: 'Target admin UID is required.' };
  }
  if (targetUid === currentAdminUid) {
    return { ok: false, error: 'Administrators cannot revoke their own active access.' };
  }
  return {
    ok: true,
    roles: roles.filter((r) => r.uid !== targetUid),
  };
}

const SEVERITY_WEIGHT: Record<ReportSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const STATUS_WEIGHT: Record<ReportStatus, number> = {
  open: 4,
  reviewing: 3,
  resolved: 2,
  dismissed: 1,
};

export function filterReports(
  reports: ContentReport[],
  searchQuery: string,
  statusFilter: 'all' | ReportStatus,
  severityFilter: 'all' | ReportSeverity
): ContentReport[] {
  const q = searchQuery.trim().toLowerCase();
  return reports
    .filter((report) => {
      if (statusFilter !== 'all' && report.status !== statusFilter) return false;
      if (severityFilter !== 'all' && report.severity !== severityFilter) return false;
      if (!q) return true;
      return (
        report.reason.toLowerCase().includes(q) ||
        report.targetSummary.toLowerCase().includes(q) ||
        report.reporterName.toLowerCase().includes(q) ||
        report.category.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const statusDiff = STATUS_WEIGHT[b.status] - STATUS_WEIGHT[a.status];
      if (statusDiff !== 0) return statusDiff;
      const sevDiff = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
      if (sevDiff !== 0) return sevDiff;
      return b.createdAtMs - a.createdAtMs;
    });
}

export function updateReportResolution(
  reports: ContentReport[],
  reportId: string,
  status: ReportStatus,
  resolutionAction: string,
  adminUid: string,
  nowMs: number = Date.now()
): ContentReport[] {
  return reports.map((r) =>
    r.id === reportId
      ? {
          ...r,
          status,
          resolutionAction: resolutionAction.trim() || r.resolutionAction,
          reviewedBy: adminUid,
          reviewedAtMs: status === 'open' ? 0 : nowMs,
          updatedAtMs: nowMs,
        }
      : r
  );
}

export function filterAppeals(
  appeals: ModerationAppeal[],
  searchQuery: string,
  statusFilter: 'all' | AppealStatus
): ModerationAppeal[] {
  const q = searchQuery.trim().toLowerCase();
  return appeals
    .filter((appeal) => {
      if (statusFilter !== 'all' && appeal.status !== statusFilter) return false;
      if (!q) return true;
      return (
        appeal.appellantName.toLowerCase().includes(q) ||
        appeal.appellantHandle.toLowerCase().includes(q) ||
        appeal.reason.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return b.createdAtMs - a.createdAtMs;
    });
}

export function reviewAppealDecision(
  appeals: ModerationAppeal[],
  appealId: string,
  decision: 'approved' | 'rejected',
  reviewerNote: string,
  adminUid: string,
  nowMs: number = Date.now()
): { ok: true; appeals: ModerationAppeal[]; updated?: ModerationAppeal } | { ok: false; error: string } {
  const note = reviewerNote.trim();
  if (note.length < 3) {
    return { ok: false, error: 'Please enter a short review note before completing the appeal.' };
  }
  let updated: ModerationAppeal | undefined;
  const next = appeals.map((a) => {
    if (a.id !== appealId) return a;
    updated = {
      ...a,
      status: decision,
      reviewerUid: adminUid,
      reviewerNote: note,
      updatedAtMs: nowMs,
    };
    return updated;
  });
  return { ok: true, appeals: next, updated };
}

export function validateAnnouncementInput(
  title: string,
  body: string
): { valid: true; title: string; body: string } | { valid: false; error: string } {
  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (cleanTitle.length < 3 || cleanTitle.length > 120) {
    return { valid: false, error: 'Announcement title must be between 3 and 120 characters.' };
  }
  if (cleanBody.length < 10 || cleanBody.length > 600) {
    return { valid: false, error: 'Announcement message must be between 10 and 600 characters.' };
  }
  return { valid: true, title: cleanTitle, body: cleanBody };
}

export function validateGuidelinesInput(
  version: string,
  summary: string,
  rulesText: string
): { valid: true; version: string; summary: string; rulesText: string } | { valid: false; error: string } {
  const cleanVersion = version.trim();
  const cleanSummary = summary.trim();
  const cleanRules = rulesText.trim();
  if (!cleanVersion || cleanVersion.length > 32) {
    return { valid: false, error: 'Guidelines version label is required (max 32 characters).' };
  }
  if (cleanSummary.length < 10 || cleanSummary.length > 300) {
    return { valid: false, error: 'Guidelines summary must be 10–300 characters.' };
  }
  if (cleanRules.length < 20 || cleanRules.length > 5000) {
    return { valid: false, error: 'Community guidelines body must be 20–5000 characters.' };
  }
  return {
    valid: true,
    version: cleanVersion,
    summary: cleanSummary,
    rulesText: cleanRules,
  };
}

export function appendAuditEntry(
  logs: AdminAuditEntry[],
  input: Omit<AdminAuditEntry, 'id' | 'createdAtMs'> & { id?: string; createdAtMs?: number }
): AdminAuditEntry[] {
  const createdAtMs = input.createdAtMs ?? Date.now();
  const entry: AdminAuditEntry = {
    id: input.id || `audit_${createdAtMs}_${Math.random().toString(36).slice(2, 8)}`,
    actorUid: input.actorUid,
    actorEmail: input.actorEmail,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: input.summary,
    createdAtMs,
  };
  return [entry, ...logs].slice(0, 250);
}

export function filterAuditLogs(
  logs: AdminAuditEntry[],
  searchQuery: string,
  actionFilter: string
): AdminAuditEntry[] {
  const q = searchQuery.trim().toLowerCase();
  return logs
    .filter((entry) => {
      if (actionFilter !== 'all' && entry.action !== actionFilter) return false;
      if (!q) return true;
      return (
        entry.summary.toLowerCase().includes(q) ||
        entry.actorEmail.toLowerCase().includes(q) ||
        entry.targetId.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function computeCategoryBreakdown(posts: Post[]): CategoryMetric[] {
  const total = posts.length;
  return POST_CATEGORIES.map((category) => {
    const bucket = posts.filter((p) => p.category === category);
    const totalLikes = bucket.reduce((sum, p) => sum + (p.likesCount || 0), 0);
    const totalComments = bucket.reduce((sum, p) => sum + (p.commentsCount || 0), 0);
    const sharePct = total > 0 ? Math.round((bucket.length / total) * 100) : 0;
    return {
      category,
      count: bucket.length,
      totalLikes,
      totalComments,
      sharePct,
    };
  }).sort((a, b) => b.count - a.count);
}

export function countExpiredStories(
  storyGroups: StoryGroup[],
  nowMs: number = Date.now()
): number {
  let expired = 0;
  for (const group of storyGroups) {
    for (const story of group.items) {
      if (story.expiresAtMs <= nowMs) {
        expired += 1;
      }
    }
  }
  return expired;
}

