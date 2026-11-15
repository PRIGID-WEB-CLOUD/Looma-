export type LegalDocId = 'terms' | 'privacy' | 'guidelines';

export type ConsentAuthMethod = 'email' | 'google' | 'apple';

export const TERMS_VERSION = '2026-11-15';
export const LEGAL_EFFECTIVE_DATE = 'November 15, 2026';
export const LEGAL_CONTACT_EMAIL = 'prigidholdings@gmail.com';

export interface LegalSection {
  id: string;
  number: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDocumentContent {
  id: LegalDocId;
  path: string;
  title: string;
  shortTitle: string;
  summary: string;
  effectiveDate: string;
  version: string;
  sections: LegalSection[];
}

export interface AccountConsentState {
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

export interface TermsConsentRecord {
  version: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  acceptedAtMs: number;
  authMethod: ConsentAuthMethod;
}

export const LEGAL_DOCUMENTS: Record<LegalDocId, LegalDocumentContent> = {
  terms: {
    id: 'terms',
    path: '/terms',
    title: 'Terms & Conditions',
    shortTitle: 'Terms',
    summary:
      'Rules governing Looma accounts, user content ownership, real-time messaging, audio and video calls, and platform safety.',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    version: TERMS_VERSION,
    sections: [
      {
        id: 'acceptance',
        number: '01',
        title: 'Acceptance of Terms & Eligibility',
        paragraphs: [
          'By creating a Looma account via Email & Password or OAuth providers (such as Google or Apple), you agree to be bound by these Terms & Conditions, our Privacy Policy, and our Community Guidelines.',
          'You must be at least 13 years old (or the minimum digital consent age in your jurisdiction) and provide accurate, verifiable account details. Verified email authentication is required before publishing posts, sending messages, uploading media, or joining calls.',
        ],
      },
      {
        id: 'accounts-security',
        number: '02',
        title: 'Account Security & Authentication',
        paragraphs: [
          'You are responsible for safeguarding your sign-in credentials and any OAuth-linked sessions connected to your Looma profile. Notify our security maintainer immediately if you suspect unauthorized access.',
        ],
        bullets: [
          'Do not impersonate another creator, brand, or member handle.',
          'Do not bypass authentication gates, rate limits, or Firestore access rules.',
          'You may delete your Looma account and associated profile settings at any time from Profile Settings.',
        ],
      },
      {
        id: 'user-content',
        number: '03',
        title: 'Your Content & Platform License',
        paragraphs: [
          'You retain full ownership of the photos, videos, audio clips, stories, posts, and messages you create and share on Looma.',
          'To operate the service, you grant Looma a limited, non-exclusive, worldwide, revocable license to host, compress, transmit, and display your shared content solely within Looma features you choose to use (such as the public feed, follower streams, stories, and chat threads). When you delete a post, story, or account, that display license ends subject to standard backup retention cycles.',
        ],
      },
      {
        id: 'messaging-calls',
        number: '04',
        title: 'Direct Messaging, Group Chats & WebRTC Calls',
        paragraphs: [
          'Looma provides real-time 1-on-1 direct chats, bounded group threads, and real-time audio/video calling powered by encrypted WebRTC transport and Cloudflare Calls infrastructure.',
        ],
        bullets: [
          'Only participants listed in a conversation or call room can access thread messages or join active call sessions.',
          'Group administrators may add or remove participants or update group titles; any participant may leave a group at any time.',
          'Respect participant consent: do not record or redistribute private calls or direct messages without clear permission from everyone involved.',
        ],
      },
      {
        id: 'prohibited-conduct',
        number: '05',
        title: 'Acceptable Use & Prohibited Conduct',
        paragraphs: [
          'We expect members to keep Looma constructive, lawful, and safe for every creator.',
        ],
        bullets: [
          'No harassment, hate speech, threats, doxxing, or non-consensual intimate media.',
          'No malware, automated spam, scraping, or abusive uploads exceeding media validation limits.',
          'No attempts to spoof user IDs, forge timestamps, or access other members’ private settings or chats.',
        ],
      },
      {
        id: 'termination-changes',
        number: '06',
        title: 'Suspension, Termination & Updates',
        paragraphs: [
          'We may suspend or remove accounts that violate these Terms or threaten platform security. We may update these Terms from time to time; the effective version date is always shown at the top of this page.',
          `Questions regarding these Terms & Conditions can be sent to ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  privacy: {
    id: 'privacy',
    path: '/privacy',
    title: 'Privacy Policy',
    shortTitle: 'Privacy',
    summary:
      'How Looma collects, isolates, stores, and protects your authentication identity, profile data, uploaded media, and communication preferences.',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    version: TERMS_VERSION,
    sections: [
      {
        id: 'data-collected',
        number: '01',
        title: 'Information You Provide',
        paragraphs: [
          'When you register via Email & Password or OAuth (Google or Apple), we receive your Firebase Authentication identifier, verified email status, and any display name or avatar you choose to share.',
          'You may also provide public creator profile fields (display name, handle, bio, city or studio location, topics, and avatar) and content you intentionally post or send in chats.',
        ],
      },
      {
        id: 'pii-isolation',
        number: '02',
        title: 'Private Settings & PII Isolation',
        paragraphs: [
          'Looma separates public creator profiles from sensitive account records. Your email address, notification preferences, privacy visibility settings, and Terms consent records are stored in an owner-only private settings subcollection that other members cannot read or query.',
        ],
      },
      {
        id: 'storage-infrastructure',
        number: '03',
        title: 'Media Storage & Real-Time Services',
        paragraphs: [
          'Uploaded images, videos, and audio files are stored in scoped Cloudflare R2 object storage tied to your authenticated user path, with MIME and file-signature validation.',
          'Real-time calling uses ephemeral TURN relay credentials and Cloudflare Calls SFU sessions generated server-side without exposing server secrets to the browser.',
        ],
      },
      {
        id: 'controls-rights',
        number: '04',
        title: 'Your Privacy Controls & Account Deletion',
        paragraphs: [
          'You control profile visibility (public or followers-only), who can initiate direct messages (everyone or people you follow), and push notification preferences inside Profile Settings.',
          'Deleting your account permanently removes your profile, private settings, presence status, and authentication record.',
        ],
      },
    ],
  },
  guidelines: {
    id: 'guidelines',
    path: '/guidelines',
    title: 'Community Guidelines',
    shortTitle: 'Guidelines',
    summary:
      'Shared standards for authentic creator storytelling, respectful dialogue, and constructive feedback across Looma.',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    version: TERMS_VERSION,
    sections: [
      {
        id: 'authentic-presence',
        number: '01',
        title: 'Share Authentic Work & Attribution',
        paragraphs: [
          'Credit collaborators, photographers, and original studios when posting references or design studies. Keep handles and profile identities honest.',
        ],
      },
      {
        id: 'respectful-conversations',
        number: '02',
        title: 'Keep Feedback Constructive',
        paragraphs: [
          'Critique ideas thoughtfully in comments and group channels. Personal attacks, targeted harassment, and unsolicited promotional spam have no place on Looma.',
        ],
      },
      {
        id: 'privacy-respect',
        number: '03',
        title: 'Respect Direct Message Boundaries',
        paragraphs: [
          'Honor each member’s message privacy and muting choices. Never share private conversations, voice notes, or call details publicly without consent.',
        ],
      },
    ],
  },
};

export function parseLegalRoute(
  pathname: string,
  search: string = ''
): LegalDocId | null {
  const cleanPath = (pathname || '/').trim().toLowerCase().replace(/\/+$/, '') || '/';
  if (cleanPath === '/terms' || cleanPath === '/terms-and-conditions') {
    return 'terms';
  }
  if (cleanPath === '/privacy' || cleanPath === '/privacy-policy') {
    return 'privacy';
  }
  if (cleanPath === '/guidelines' || cleanPath === '/community-guidelines') {
    return 'guidelines';
  }

  if (search) {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const queryDoc = (params.get('legal') || '').trim().toLowerCase();
    if (queryDoc === 'terms' || queryDoc === 'privacy' || queryDoc === 'guidelines') {
      return queryDoc;
    }
  }

  return null;
}

export function getLegalRoutePath(docId: LegalDocId): string {
  return LEGAL_DOCUMENTS[docId].path;
}

export function hasRequiredAccountConsent(consent: AccountConsentState): boolean {
  return Boolean(consent.termsAccepted && consent.privacyAccepted);
}

export function validateAccountCreationConsent(params: {
  mode: 'signin' | 'signup';
  authMethod: ConsentAuthMethod;
  consent: AccountConsentState;
}): { allowed: boolean; error: string | null } {
  if (params.mode !== 'signup') {
    return { allowed: true, error: null };
  }

  if (!params.consent.termsAccepted && !params.consent.privacyAccepted) {
    return {
      allowed: false,
      error:
        'Please tick both the Terms & Conditions and Privacy Policy boxes before creating your account.',
    };
  }

  if (!params.consent.termsAccepted) {
    return {
      allowed: false,
      error: 'Please accept the Terms & Conditions before creating your account.',
    };
  }

  if (!params.consent.privacyAccepted) {
    return {
      allowed: false,
      error: 'Please accept the Privacy Policy before creating your account.',
    };
  }

  return { allowed: true, error: null };
}

export function createTermsConsentRecord(
  authMethod: ConsentAuthMethod,
  acceptedAtMs: number = Date.now(),
  version: string = TERMS_VERSION
): TermsConsentRecord {
  return {
    version,
    termsAccepted: true,
    privacyAccepted: true,
    acceptedAtMs,
    authMethod,
  };
}

export function isConsentRecordValid(
  record: TermsConsentRecord | null | undefined,
  requiredVersion: string = TERMS_VERSION
): boolean {
  if (!record) return false;
  return (
    record.termsAccepted === true &&
    record.privacyAccepted === true &&
    record.version === requiredVersion &&
    typeof record.acceptedAtMs === 'number' &&
    Number.isFinite(record.acceptedAtMs) &&
    record.acceptedAtMs > 0
  );
}
