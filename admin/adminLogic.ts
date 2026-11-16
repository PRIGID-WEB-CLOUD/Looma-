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

export const ADMIN_MODERATION_STORAGE_KEY = 'looma_admin_moderation_v1';
export const ADMIN_INQUIRIES_STORAGE_KEY = 'looma_admin_inquiries_v1';
export const ADMIN_PREVIEW_STATE_STORAGE_KEY = 'looma_admin_preview_state_v1';

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
  status: 'healthy' | 'degraded' | 'offline' | 'preview';
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
  isLocalAutostart?: boolean;
}

export interface AdminAuthorizationResult {
  isAdmin: boolean;
  reason:
    | 'ok-admin-doc'
    | 'ok-allowlist'
    | 'ok-local-preview'
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
  if (input.isLocalAutostart) {
    return { isAdmin: true, reason: 'ok-local-preview' };
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

export function readAdminModerationState(): AdminModerationState {
  if (typeof window === 'undefined') {
    return { hiddenPostIds: [], restrictedUids: [] };
  }
  try {
    const raw = window.localStorage.getItem(ADMIN_MODERATION_STORAGE_KEY);
    if (!raw) return { hiddenPostIds: [], restrictedUids: [] };
    const parsed = JSON.parse(raw) as Partial<AdminModerationState>;
    return {
      hiddenPostIds: Array.isArray(parsed.hiddenPostIds) ? parsed.hiddenPostIds : [],
      restrictedUids: Array.isArray(parsed.restrictedUids) ? parsed.restrictedUids : [],
    };
  } catch {
    return { hiddenPostIds: [], restrictedUids: [] };
  }
}

export function saveAdminModerationState(state: AdminModerationState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADMIN_MODERATION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues cleanly
  }
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

export function readAdminAccessInquiries(): AdminAccessInquiry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ADMIN_INQUIRIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AdminAccessInquiry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAdminAccessInquiries(inquiries: AdminAccessInquiry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADMIN_INQUIRIES_STORAGE_KEY, JSON.stringify(inquiries));
  } catch {
    // Ignore storage quota issues cleanly
  }
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
    adminOperators: Math.max(input.adminRoles.length, ADMIN_EMAILS.length),
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

export interface AutostartAdminSeed {
  currentProfile: UserProfile;
  communityUsers: UserProfile[];
  posts: Post[];
  storyGroups: StoryGroup[];
  onlineUserIds: string[];
  moderation: AdminModerationState;
  memberModerationRecords: Record<string, MemberModerationRecord>;
  adminRoles: AdminRoleEntry[];
  reports: ContentReport[];
  appeals: ModerationAppeal[];
  announcements: PlatformAnnouncement[];
  guidelines: CommunityGuidelinesConfig;
  featureFlags: AdminFeatureFlags;
  auditLogs: AdminAuditEntry[];
  inquiries: AdminAccessInquiry[];
}

export function createAutostartAdminSeed(nowMs: number = Date.now()): AutostartAdminSeed {
  const currentProfile: UserProfile = {
    uid: 'admin_operator_1',
    displayName: 'Elena Vance',
    handle: 'elena.ops',
    bio: 'Trust & Safety Lead at Looma',
    avatarUrl: '',
    location: 'London, UK',
    interests: ['Architecture', 'Design'],
    followersCount: 184,
    followingCount: 42,
    onboardingCompleted: true,
    createdAtMs: nowMs - 86_400_000 * 30,
    updatedAtMs: nowMs - 120_000,
  };

  const communityUsers: UserProfile[] = [
    {
      uid: 'u_sophia',
      displayName: 'Sophia Chen',
      handle: 'sophia.studio',
      bio: 'Architectural photographer and brutalism researcher.',
      avatarUrl: '',
      location: 'San Francisco, US',
      interests: ['Architecture', 'Photography'],
      followersCount: 1290,
      followingCount: 310,
      onboardingCompleted: true,
      createdAtMs: nowMs - 86_400_000 * 14,
      updatedAtMs: nowMs - 300_000,
    },
    {
      uid: 'u_marcus',
      displayName: 'Marcus Sterling',
      handle: 'm.sterling',
      bio: 'Industrial designer exploring acoustic materials.',
      avatarUrl: '',
      location: 'Berlin, DE',
      interests: ['Design', 'Travel'],
      followersCount: 642,
      followingCount: 195,
      onboardingCompleted: true,
      createdAtMs: nowMs - 86_400_000 * 9,
      updatedAtMs: nowMs - 900_000,
    },
    {
      uid: 'u_kofi',
      displayName: 'Kofi Mensah',
      handle: 'kofi.fieldnotes',
      bio: 'Sound recordist and visual essayist.',
      avatarUrl: '',
      location: 'Accra, GH',
      interests: ['Journal', 'Photography'],
      followersCount: 418,
      followingCount: 88,
      onboardingCompleted: true,
      createdAtMs: nowMs - 86_400_000 * 6,
      updatedAtMs: nowMs - 3_600_000,
    },
    {
      uid: 'u_spammer_test',
      displayName: 'Promo Bot 904',
      handle: 'promo_deals_904',
      bio: 'Automated promotional links.',
      avatarUrl: '',
      location: 'Unknown',
      interests: ['Travel'],
      followersCount: 3,
      followingCount: 912,
      onboardingCompleted: false,
      createdAtMs: nowMs - 86_400_000 * 1,
      updatedAtMs: nowMs - 1_800_000,
    },
  ];

  const posts: Post[] = [
    {
      id: 'post_arch_1',
      authorId: 'u_sophia',
      authorName: 'Sophia Chen',
      authorHandle: 'sophia.studio',
      authorAvatar: '',
      caption: 'Morning shadows across cast concrete ribs at the civic pavilion.',
      imageUrl: '',
      category: 'Architecture',
      likesCount: 84,
      commentsCount: 14,
      createdAtMs: nowMs - 1_800_000,
      updatedAtMs: nowMs - 1_800_000,
    },
    {
      id: 'post_design_2',
      authorId: 'u_marcus',
      authorName: 'Marcus Sterling',
      authorHandle: 'm.sterling',
      authorAvatar: '',
      caption: 'Acoustic baffle prototype tests wrapped up in studio B.',
      imageUrl: '',
      audioUrl: 'voice://prototype-test',
      mediaTitle: 'Studio B acoustic decay test',
      category: 'Design',
      likesCount: 49,
      commentsCount: 7,
      createdAtMs: nowMs - 5_400_000,
      updatedAtMs: nowMs - 5_400_000,
    },
    {
      id: 'post_journal_3',
      authorId: 'u_kofi',
      authorName: 'Kofi Mensah',
      authorHandle: 'kofi.fieldnotes',
      authorAvatar: '',
      caption: 'Field notes on coastal wind corridors and monsoon drainage geometry.',
      imageUrl: '',
      linkUrl: 'https://looma.studio/notes/wind-corridors',
      mediaTitle: 'Coastal Wind Corridors',
      category: 'Journal',
      likesCount: 31,
      commentsCount: 5,
      createdAtMs: nowMs - 14_400_000,
      updatedAtMs: nowMs - 14_400_000,
    },
    {
      id: 'post_flagged_4',
      authorId: 'u_spammer_test',
      authorName: 'Promo Bot 904',
      authorHandle: 'promo_deals_904',
      authorAvatar: '',
      caption: 'GET 90% OFF EXTERNAL CRYPTO SIGNALS CLICK HERE FAST >>>',
      imageUrl: '',
      category: 'Travel',
      likesCount: 0,
      commentsCount: 0,
      createdAtMs: nowMs - 900_000,
      updatedAtMs: nowMs - 900_000,
    },
  ];

  const storyGroups: StoryGroup[] = [
    {
      authorId: 'u_sophia',
      authorName: 'Sophia Chen',
      authorHandle: 'sophia.studio',
      authorAvatar: '',
      hasUnviewed: true,
      latestCreatedAtMs: nowMs - 2_400_000,
      items: [
        {
          id: 'story_1',
          authorId: 'u_sophia',
          authorName: 'Sophia Chen',
          authorHandle: 'sophia.studio',
          authorAvatar: '',
          imageUrl: '',
          caption: 'Golden hour facade light inspection.',
          createdAtMs: nowMs - 2_400_000,
          expiresAtMs: nowMs + 84_000_000,
        },
        {
          id: 'story_expired_legacy',
          authorId: 'u_sophia',
          authorName: 'Sophia Chen',
          authorHandle: 'sophia.studio',
          authorAvatar: '',
          imageUrl: '',
          caption: 'Yesterday daylight archive frame.',
          createdAtMs: nowMs - 90_000_000,
          expiresAtMs: nowMs - 3_600_000,
        },
      ],
    },
  ];

  const memberModerationRecords: Record<string, MemberModerationRecord> = {
    u_spammer_test: {
      uid: 'u_spammer_test',
      status: 'restricted',
      reason: 'Automated promotional link spam triggered threshold.',
      updatedBy: 'admin_operator_1',
      updatedAtMs: nowMs - 600_000,
    },
  };

  const adminRoles: AdminRoleEntry[] = [
    {
      uid: 'admin_operator_1',
      email: 'prigidholdings@gmail.com',
      displayName: 'Elena Vance',
      role: 'super_admin',
      permissions: [...ADMIN_ROLE_PERMISSIONS.super_admin],
      grantedBy: 'system',
      createdAtMs: nowMs - 86_400_000 * 30,
      updatedAtMs: nowMs - 86_400_000 * 30,
    },
    {
      uid: 'u_marcus',
      email: 'prigidwebcloud@gmail.com',
      displayName: 'Marcus Sterling',
      role: 'moderator',
      permissions: [...ADMIN_ROLE_PERMISSIONS.moderator],
      grantedBy: 'admin_operator_1',
      createdAtMs: nowMs - 86_400_000 * 7,
      updatedAtMs: nowMs - 86_400_000 * 7,
    },
  ];

  const reports: ContentReport[] = [
    {
      id: 'rep_spam_01',
      targetType: 'post',
      targetId: 'post_flagged_4',
      targetAuthorUid: 'u_spammer_test',
      targetSummary: 'GET 90% OFF EXTERNAL CRYPTO SIGNALS CLICK HERE FAST >>>',
      reporterUid: 'u_sophia',
      reporterName: 'Sophia Chen',
      category: 'spam',
      severity: 'high',
      reason: 'Unsolicited mass promotional link targeting Travel topic feed.',
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
      targetId: 'story_1',
      targetAuthorUid: 'u_sophia',
      targetSummary: 'Golden hour facade light inspection.',
      reporterUid: 'u_kofi',
      reporterName: 'Kofi Mensah',
      category: 'copyright',
      severity: 'low',
      reason: 'Missing architect credit line in story caption (advisory check).',
      status: 'reviewing',
      resolutionAction: 'Pending attribution note',
      reviewedBy: 'admin_operator_1',
      reviewedAtMs: nowMs - 300_000,
      createdAtMs: nowMs - 3_200_000,
      updatedAtMs: nowMs - 300_000,
    },
  ];

  const appeals: ModerationAppeal[] = [
    {
      id: 'app_01',
      appellantUid: 'u_spammer_test',
      appellantName: 'Promo Bot 904',
      appellantHandle: 'promo_deals_904',
      reportId: 'rep_spam_01',
      targetId: 'post_flagged_4',
      reason: 'Requesting lifting of posting restriction after removing external affiliate links.',
      status: 'pending',
      reviewerUid: '',
      reviewerNote: '',
      createdAtMs: nowMs - 400_000,
      updatedAtMs: nowMs - 400_000,
    },
  ];

  const announcements: PlatformAnnouncement[] = [
    {
      id: 'ann_r2_audio',
      title: 'Voice Note & Rich Link Unfurling Live',
      body: 'Audio messaging pipelines on Cloudflare R2 and rich URL previews are now enabled across web and mobile.',
      severity: 'info',
      audience: 'all',
      active: true,
      authorUid: 'admin_operator_1',
      authorName: 'Elena Vance',
      createdAtMs: nowMs - 86_400_000 * 2,
      updatedAtMs: nowMs - 86_400_000 * 2,
    },
  ];

  const auditLogs: AdminAuditEntry[] = [
    {
      id: 'audit_init_1',
      actorUid: 'admin_operator_1',
      actorEmail: 'prigidholdings@gmail.com',
      action: 'member.restrict',
      targetType: 'user',
      targetId: 'u_spammer_test',
      summary: 'Restricted @promo_deals_904 after automated spam report.',
      createdAtMs: nowMs - 600_000,
    },
    {
      id: 'audit_init_2',
      actorUid: 'admin_operator_1',
      actorEmail: 'prigidholdings@gmail.com',
      action: 'announcement.publish',
      targetType: 'announcement',
      targetId: 'ann_r2_audio',
      summary: 'Published announcement: Voice Note & Rich Link Unfurling Live.',
      createdAtMs: nowMs - 86_400_000 * 2,
    },
  ];

  const inquiries: AdminAccessInquiry[] = [
    {
      id: 'inq_studio_1',
      fullName: 'Nadia Patel',
      email: 'nadia@nordic-atelier.org',
      organization: 'Nordic Atelier',
      note: 'Onboarding 12 architectural photographers to private studio feed.',
      status: 'pending',
      createdAtMs: nowMs - 4_200_000,
    },
  ];

  return {
    currentProfile,
    communityUsers,
    posts,
    storyGroups,
    onlineUserIds: ['admin_operator_1', 'u_sophia', 'u_marcus'],
    moderation: {
      hiddenPostIds: ['post_flagged_4'],
      restrictedUids: ['u_spammer_test'],
    },
    memberModerationRecords,
    adminRoles,
    reports,
    appeals,
    announcements,
    guidelines: {
      ...DEFAULT_COMMUNITY_GUIDELINES,
      updatedAtMs: nowMs - 86_400_000 * 5,
    },
    featureFlags: {
      ...DEFAULT_FEATURE_FLAGS,
      updatedAtMs: nowMs - 86_400_000 * 3,
    },
    auditLogs,
    inquiries,
  };
}
