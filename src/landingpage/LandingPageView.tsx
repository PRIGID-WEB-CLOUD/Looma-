import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  ImageOff,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import heroWorkspaceImg from '../assets/images/hero_looma_workspace_1794784020527.jpg';
import landingGalleryImg from '../assets/images/landing_community_gallery_1794784021354.jpg';
import landingAtriumImg from '../assets/images/landing_private_atrium_1794784021462.jpg';
import { LoomaLogo } from '../components/LoomaLogo';
import type { ThemeMode } from '../types/social';
import type { LegalDocId } from '../utils/legalLogic';
import {
  createAccessInquiryRecord,
  LANDING_CAPABILITIES,
  PROTECTED_WORKSPACE_BOUNDARIES,
  validateAccessInquiry,
  WORKSPACE_GUARANTEES,
  type AccessInquiry,
} from './landingData';

interface LandingPageViewProps {
  theme: ThemeMode;
  isAuthorized: boolean;
  isAdmin?: boolean;
  userDisplayName?: string;
  onSetTheme: (theme: ThemeMode) => void;
  onNavigateToAuth: (mode?: 'signin' | 'signup') => void;
  onNavigateToProtectedPath: (
    path: '/feed' | '/messages' | '/settings' | '/admin'
  ) => void;
  onOpenLegal: (docId: LegalDocId) => void;
  onSubmitAccessInquiry?: (inquiry: AccessInquiry) => void;
}

function EditorialPhoto({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center gap-2 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 p-6 text-center ${className}`}
      >
        <ImageOff className="w-6 h-6 opacity-70" aria-hidden="true" />
        <span className="text-xs font-medium max-w-xs">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`w-full h-full object-cover ${className}`}
    />
  );
}

export function LandingPageView({
  theme,
  isAuthorized,
  isAdmin = false,
  userDisplayName,
  onSetTheme,
  onNavigateToAuth,
  onNavigateToProtectedPath,
  onOpenLegal,
  onSubmitAccessInquiry,
}: LandingPageViewProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedInquiry, setSubmittedInquiry] = useState<AccessInquiry | null>(
    null
  );

  const handleInquirySubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const check = validateAccessInquiry({
      fullName,
      email,
      organization,
      note,
    });
    if (!check.valid) {
      setFormError(check.error || 'Please review the highlighted inquiry fields.');
      return;
    }

    const record = createAccessInquiryRecord({
      fullName,
      email,
      organization,
      note,
    });
    onSubmitAccessInquiry?.(record);
    setSubmittedInquiry(record);
    setFullName('');
    setEmail('');
    setOrganization('');
    setNote('');
  };

  return (
    <div
      data-testid="landing-page"
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors looma-stage-enter"
    >
      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (4 single-line links) — Zone 3 (1 primary CTA) */}
      <header className="sticky top-0 z-30 h-16 px-4 md:px-8 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto h-full flex items-center justify-between gap-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg"
          >
            <LoomaLogo />
          </a>

          <nav
            aria-label="Primary landing navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            <a
              href="#workspace"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Workspace
            </a>
            <a
              href="#security"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Security
            </a>
            <a
              href="/admin"
              onClick={(e) => {
                e.preventDefault();
                onNavigateToProtectedPath('/admin');
              }}
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Admin
            </a>
            <a
              href="/terms"
              onClick={(e) => {
                e.preventDefault();
                onOpenLegal('terms');
              }}
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Terms
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() =>
                isAuthorized
                  ? onNavigateToProtectedPath('/feed')
                  : onNavigateToAuth('signin')
              }
              className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              {isAuthorized ? 'Open Feed' : 'Sign In'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full">
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-4 md:px-8 pt-8 pb-12 md:pt-14 md:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 lg:items-center">
            <div className="lg:col-span-5 flex flex-col justify-between gap-8">
              <div className="space-y-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span>Looma Workspace</span>
                  <span aria-hidden="true"> · </span>
                  <span>Protected Member Network</span>
                </p>

                <h1 className="font-display text-[clamp(2.25rem,4vw,3.5rem)] font-bold tracking-tight leading-[1.08] text-slate-900 dark:text-white text-balance">
                  Private publishing and messaging for verified creators.
                </h1>

                <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-[60ch]">
                  Share compressed photo journals, connect in direct and group chats,
                  and host audio or video studio rooms inside an authentication-gated
                  member space.
                </p>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                  <Lock
                    className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      Protected Workspace Access
                    </p>
                    <p className="mt-1">
                      Feed posts, direct messages, and profile settings are restricted
                      to authenticated members from the auth page.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  {isAuthorized ? (
                    <button
                      type="button"
                      onClick={() => onNavigateToProtectedPath('/feed')}
                      className="min-h-[48px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>
                        Continue as {userDisplayName || 'Authenticated Member'}
                      </span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onNavigateToAuth('signup')}
                        className="min-h-[48px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <span>Create Member Account</span>
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateToAuth('signin')}
                        className="min-h-[48px] px-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Go to Auth Page
                      </button>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span>Member areas:</span>
                  <button
                    type="button"
                    onClick={() => onNavigateToProtectedPath('/feed')}
                    className="font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                  >
                    Feed Posts
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateToProtectedPath('/messages')}
                    className="font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                  >
                    Direct Messages
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateToProtectedPath('/settings')}
                    className="font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                  >
                    Profile Settings
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onNavigateToProtectedPath('/admin')}
                      className="font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Admin Console
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="aspect-[16/10] w-full rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                <EditorialPhoto
                  src={heroWorkspaceImg}
                  alt="Sunlit architectural creator studio pavilion with oak desk, Leica camera, and pine forest overlook"
                />
              </div>
            </div>
          </div>

          {/* 4-Column Full-Width Technical Proof Strip */}
          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {WORKSPACE_GUARANTEES.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-5 py-4"
              >
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {item.label}
                </p>
                <p className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 01: Asymmetric Workspace Capabilities Bento */}
        <section
          id="workspace"
          className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-14 md:py-20"
        >
          <div className="max-w-6xl mx-auto px-4 md:px-8 space-y-10">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                01. Member Workspace
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                Every core surface is gated behind verified member sign-in.
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                Public visitors browse the overview and legal policies here, then
                authenticate via the Auth Page before reading or publishing content.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Featured Capability 01 */}
              <article className="md:col-span-2 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col">
                <div className="aspect-[16/9] overflow-hidden border-b border-slate-200 dark:border-slate-800">
                  <EditorialPhoto
                    src={landingGalleryImg}
                    alt="Creator reviewing monochrome architectural prints at an oak studio table"
                  />
                </div>
                <div className="p-6 sm:p-7 flex-1 flex flex-col justify-between gap-5">
                  <div className="space-y-2">
                    <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                      {LANDING_CAPABILITIES[0].number}.{' '}
                      {LANDING_CAPABILITIES[0].title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-[65ch]">
                      {LANDING_CAPABILITIES[0].summary}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {LANDING_CAPABILITIES[0].detail}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-slate-200/80 dark:border-slate-800">
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      Route: /feed · Verified Members
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigateToProtectedPath('/feed')}
                      className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>{isAuthorized ? 'Open Feed' : 'Sign in for Feed'}</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>

              {/* Capability 02 */}
              <article className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col">
                <div className="aspect-[4/3] overflow-hidden border-b border-slate-200 dark:border-slate-800">
                  <EditorialPhoto
                    src={landingAtriumImg}
                    alt="Minimalist limestone and glass private workspace courtyard in morning daylight"
                  />
                </div>
                <div className="p-6 flex-1 flex flex-col justify-between gap-5">
                  <div className="space-y-2">
                    <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                      {LANDING_CAPABILITIES[1].number}.{' '}
                      {LANDING_CAPABILITIES[1].title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {LANDING_CAPABILITIES[1].summary}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {LANDING_CAPABILITIES[1].detail}
                    </p>
                  </div>
                  <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      /messages
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigateToProtectedPath('/messages')}
                      className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>{isAuthorized ? 'Open Chat' : 'Member Login'}</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>

              {/* Capability 03 */}
              <article className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-6 flex flex-col justify-between gap-5">
                <div className="space-y-2">
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {LANDING_CAPABILITIES[2].number}.{' '}
                    {LANDING_CAPABILITIES[2].title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {LANDING_CAPABILITIES[2].summary}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {LANDING_CAPABILITIES[2].detail}
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    /settings
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateToProtectedPath('/settings')}
                    className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>
                      {isAuthorized ? 'Open Settings' : 'Sign in for Settings'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </article>

              {/* Capability 04 */}
              <article className="md:col-span-2 rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-6 sm:p-7 flex flex-col justify-between gap-5">
                <div className="space-y-2">
                  <h3 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                    {LANDING_CAPABILITIES[3].number}.{' '}
                    {LANDING_CAPABILITIES[3].title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-[65ch]">
                    {LANDING_CAPABILITIES[3].summary}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-[65ch]">
                    {LANDING_CAPABILITIES[3].detail}
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-4">
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    Route: /admin · Verified Administrators Only
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateToProtectedPath('/admin')}
                    className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>Open Admin Console</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Section 02: Protected Access Policy */}
        <section
          id="security"
          className="border-t border-slate-200 dark:border-slate-800 py-14 md:py-20"
        >
          <div className="max-w-6xl mx-auto px-4 md:px-8 space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="max-w-2xl space-y-2">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  02. Protected Access Policy
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                  Zero public leaks across posts, threads, or account PII.
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onOpenLegal('privacy')}
                className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 self-start md:self-auto transition-colors cursor-pointer whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <span>Read Privacy Policy</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PROTECTED_WORKSPACE_BOUNDARIES.map((boundary) => (
                <div
                  key={boundary.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                        {boundary.title}
                      </h3>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {boundary.path}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                      {boundary.requirement}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {boundary.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 03: Studio Workspace Access Inquiry */}
        <section
          id="request-access"
          className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-14 md:py-20"
        >
          <div className="max-w-6xl mx-auto px-4 md:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            <div className="lg:col-span-5 space-y-3">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                03. Studio Inquiries
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                Request studio onboarding or administrator review.
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Already have an account? Head directly to the Auth Page. Teams
                configuring dedicated studio channels can submit a workspace inquiry
                here for review inside the Admin Console.
              </p>
            </div>

            <div className="lg:col-span-7 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8">
              {submittedInquiry ? (
                <div
                  data-testid="landing-inquiry-success"
                  className="space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                        Workspace Inquiry Recorded
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        Submitted for{' '}
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {submittedInquiry.fullName}
                        </span>{' '}
                        ({submittedInquiry.email}). Administrators can review it under
                        Access &amp; Inquiries in the Admin Console.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => onNavigateToAuth('signup')}
                      className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
                    >
                      Continue to Sign Up
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubmittedInquiry(null)}
                      className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Submit Another Note
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInquirySubmit} noValidate className="space-y-4">
                  {formError && (
                    <div
                      role="alert"
                      className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs sm:text-sm text-red-700 dark:text-red-300"
                    >
                      {formError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="landing-inquiry-name"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Full Name
                      </label>
                      <input
                        id="landing-inquiry-name"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Maya Lin"
                        className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="landing-inquiry-email"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Work Email
                      </label>
                      <input
                        id="landing-inquiry-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="maya@studio.com"
                        className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="landing-inquiry-org"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Studio or Organization
                    </label>
                    <input
                      id="landing-inquiry-org"
                      type="text"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="Lin Architectural Photography"
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="landing-inquiry-note"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Workspace Purpose
                    </label>
                    <textarea
                      id="landing-inquiry-note"
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Describe your team channels, moderation needs, or studio workflow..."
                      className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Protected Workspace Access applies to all member sessions.
                    </p>
                    <button
                      type="submit"
                      className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Submit Inquiry
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-8 px-4 md:px-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <LoomaLogo />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Looma · Authenticated Social Feed, Direct Messaging &amp; Studio Admin
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-400">
            <button
              type="button"
              onClick={() => onNavigateToAuth('signin')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline cursor-pointer"
            >
              Auth Page
            </button>
            <button
              type="button"
              onClick={() => onNavigateToProtectedPath('/admin')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline cursor-pointer"
            >
              Admin Console
            </button>
            <button
              type="button"
              onClick={() => onOpenLegal('terms')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline cursor-pointer"
            >
              Terms &amp; Conditions
            </button>
            <button
              type="button"
              onClick={() => onOpenLegal('privacy')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline cursor-pointer"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => onOpenLegal('guidelines')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline cursor-pointer"
            >
              Community Guidelines
            </button>
            <button
              type="button"
              onClick={() => onSetTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={
                theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
              }
              className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
