export interface LandingCapability {
  id: string;
  number: string;
  title: string;
  summary: string;
  detail: string;
  highlight: string;
  featured?: boolean;
}

export interface ProtectedBoundaryItem {
  id: string;
  title: string;
  scopeTag: string;
  requirement: string;
  description: string;
}

export interface AccessInquiry {
  id: string;
  fullName: string;
  email: string;
  organization: string;
  note: string;
  status: 'pending' | 'approved' | 'archived';
  createdAtMs: number;
}

export const ACCESS_INQUIRIES_STORAGE_KEY = 'looma_access_inquiries_v1';

export const LANDING_CAPABILITIES: LandingCapability[] = [
  {
    id: 'feed',
    number: '01',
    title: 'Curated Creator Feed',
    summary:
      'High-resolution photo journals, studio notes, and 24-hour visual stories reserved exclusively for verified members.',
    detail:
      'Automatic client-side compression, Cloudflare R2 media delivery, topic filters, bookmarks, and threaded comments.',
    highlight: 'R2 Signed Media Pipeline',
    featured: true,
  },
  {
    id: 'messaging',
    number: '02',
    title: 'Direct & Group Messaging',
    summary:
      'Private 1-on-1 conversations, studio channels, voice notes, and WebRTC audio or video calls scoped strictly to participants.',
    detail:
      'Firestore member-bound chat rules paired with ephemeral Cloudflare TURN credentials.',
    highlight: 'Ephemeral TURN Relay',
  },
  {
    id: 'settings',
    number: '03',
    title: 'Isolated Profile Settings',
    summary:
      'Owner-only controls for profile visibility, direct-message privacy, push alert preferences, and account deletion.',
    detail:
      'PII and notification preferences live in a dedicated private subcollection accessible only to the signed-in owner.',
    highlight: 'Private Subcollection Isolation',
  },
  {
    id: 'admin',
    number: '04',
    title: 'Studio Governance & Safety',
    summary:
      'Structured moderation queues, community policy controls, and studio onboarding review for network operators.',
    detail:
      'Protected by verified-email RBAC checks and dedicated audit logging across workspace actions.',
    highlight: 'Verified RBAC Governance',
  },
];

export const PROTECTED_WORKSPACE_BOUNDARIES: ProtectedBoundaryItem[] = [
  {
    id: 'boundary-feed',
    title: 'Feed Posts & Stories',
    scopeTag: 'Members Only',
    requirement: 'Authenticated & verified session required',
    description:
      'Unauthenticated visitors cannot read member streams, post captions, comments, or 24-hour stories.',
  },
  {
    id: 'boundary-messages',
    title: 'Direct Messages & Calls',
    scopeTag: 'Participant Scoped',
    requirement: 'Verified member + explicit thread participant UID',
    description:
      'Every thread, message, and WebRTC room enforces explicit memberIds checks in Firestore and backend APIs.',
  },
  {
    id: 'boundary-settings',
    title: 'Profile Settings & PII',
    scopeTag: 'Owner Isolated',
    requirement: 'Owner-only verified authentication',
    description:
      'Account preferences, email address, and deletion controls require an active owner session.',
  },
  {
    id: 'boundary-admin',
    title: 'Operator Governance',
    scopeTag: 'RBAC Enforced',
    requirement: 'Verified administrator privileges',
    description:
      'Workspace metrics, moderation actions, and inquiry queues reject unauthenticated users and standard member accounts.',
  },
];

export const WORKSPACE_GUARANTEES = [
  { label: 'Auth Gate', value: 'Email Verified + OAuth' },
  { label: 'Collection Rules', value: 'Zero-Trust Firestore' },
  { label: 'Legal Baseline', value: '2026-11-15 Mandatory' },
  { label: 'Media Transport', value: 'Signed Cloudflare R2' },
];

export function validateAccessInquiry(input: {
  fullName: string;
  email: string;
  organization: string;
  note: string;
}): { valid: boolean; error?: string } {
  const name = input.fullName.trim();
  const email = input.email.trim();
  const org = input.organization.trim();
  const note = input.note.trim();

  if (name.length < 2 || name.length > 80) {
    return {
      valid: false,
      error: 'Enter your full name (2 to 80 characters).',
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 160) {
    return {
      valid: false,
      error: 'Enter a valid email address.',
    };
  }
  if (org.length > 100) {
    return {
      valid: false,
      error: 'Studio or organization name must be 100 characters or fewer.',
    };
  }
  if (note.length < 10 || note.length > 600) {
    return {
      valid: false,
      error: 'Include a brief workspace note (10 to 600 characters).',
    };
  }
  return { valid: true };
}

export function createAccessInquiryRecord(input: {
  fullName: string;
  email: string;
  organization: string;
  note: string;
  nowMs?: number;
}): AccessInquiry {
  const validation = validateAccessInquiry(input);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid access inquiry.');
  }
  const nowMs = input.nowMs ?? Date.now();
  return {
    id: `inq_${nowMs}_${Math.random().toString(36).slice(2, 8)}`,
    fullName: input.fullName.trim(),
    email: input.email.trim().toLowerCase(),
    organization: input.organization.trim() || 'Independent Studio',
    note: input.note.trim(),
    status: 'pending',
    createdAtMs: nowMs,
  };
}

export function readStoredAccessInquiries(): AccessInquiry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ACCESS_INQUIRIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AccessInquiry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredAccessInquiries(inquiries: AccessInquiry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      ACCESS_INQUIRIES_STORAGE_KEY,
      JSON.stringify(inquiries.slice(0, 100))
    );
  } catch {
    // Ignore storage quota issues cleanly
  }
}
