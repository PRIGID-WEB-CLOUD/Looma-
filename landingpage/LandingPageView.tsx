import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  Globe,
  ImageOff,
  Lock,
  MessageSquare,
  Mic,
  Moon,
  Shield,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  Video,
} from 'lucide-react';
import heroWorkspaceImg from '../src/assets/images/hero_looma_workspace_1794784020527.jpg';
import landingGalleryImg from '../src/assets/images/landing_community_gallery_1794784021354.jpg';
import landingAtriumImg from '../src/assets/images/landing_private_atrium_1794784021462.jpg';
import { LoomaLogo } from '../src/components/LoomaLogo';
import type { ThemeMode } from '../src/types/social';
import type { LegalDocId } from '../src/utils/legalLogic';
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
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors looma-stage-enter font-sans selection:bg-blue-600 selection:text-white"
    >
      {/* Professional Sticky Header */}
      <header className="sticky top-0 z-40 h-20 px-4 md:px-8 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between gap-8">
          <div className="flex items-center gap-8">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xl"
            >
              <LoomaLogo />
            </a>

            <nav
              aria-label="Primary landing navigation"
              className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
            >
              <a
                href="#workspace"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap"
              >
                Workspace
              </a>
              <a
                href="#capabilities"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap"
              >
                Features
              </a>
              <a
                href="#security"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap"
              >
                Security &amp; Auth
              </a>
              <a
                href="#request-access"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap"
              >
                Studio Inquiries
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSetTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={
                theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
              }
              className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                isAuthorized
                  ? onNavigateToProtectedPath('/feed')
                  : onNavigateToAuth('signin')
              }
              className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold transition-all shadow-sm shadow-blue-600/20 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              {isAuthorized ? 'Open Feed' : 'Sign In'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full overflow-hidden">
        {/* Hero Section */}
        <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden">
          {/* Background Ambient Glow */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-blue-500/10 dark:bg-blue-600/15 blur-[120px] rounded-full pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 md:px-8 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 lg:items-center">
              <div className="lg:col-span-6 flex flex-col justify-center space-y-8">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-blue-200 dark:border-blue-900/60 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-semibold w-fit">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Looma v2.6 · Production Social &amp; Studio Network</span>
                </div>

                <div className="space-y-4">
                  <h1 className="font-display text-[clamp(2.5rem,5vw,4.25rem)] font-bold tracking-tight leading-[1.05] text-slate-900 dark:text-white text-balance">
                    Private publishing and real-time studio messaging.
                  </h1>

                  <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-[55ch]">
                    Designed for architectural practices, creative collectives, and
                    verified creators. Experience authenticated media feeds, end-to-end
                    encrypted channels, and WebRTC collaboration spaces.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Lock className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    <p className="font-bold text-slate-900 dark:text-white">
                      Protected Workspace Enforcement
                    </p>
                    <p className="mt-0.5">
                      All feed posts, direct messages, and member settings require verified
                      Firebase authentication. No public scraping or unauthenticated leaks.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex flex-wrap items-center gap-3.5">
                    {isAuthorized ? (
                      <button
                        type="button"
                        onClick={() => onNavigateToProtectedPath('/feed')}
                        className="min-h-[52px] px-7 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-base font-semibold inline-flex items-center gap-2.5 shadow-lg shadow-blue-600/25 transition-all cursor-pointer whitespace-nowrap"
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
                          className="min-h-[52px] px-7 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-base font-semibold inline-flex items-center gap-2.5 shadow-lg shadow-blue-600/25 transition-all cursor-pointer whitespace-nowrap"
                        >
                          <span>Create Member Account</span>
                          <ArrowRight className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onNavigateToAuth('signin')}
                          className="min-h-[52px] px-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-base font-semibold transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Sign In
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Cloudflare R2 Storage
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Cloudflare Calls SFU
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Firebase RBAC Rules
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="relative mx-auto max-w-xl lg:max-w-none">
                  <div className="aspect-[16/11] w-full rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shadow-2xl">
                    <EditorialPhoto
                      src={heroWorkspaceImg}
                      alt="Sunlit architectural creator studio pavilion with oak desk, Leica camera, and pine forest overlook"
                    />
                  </div>
                  {/* Floating Stat Badge */}
                  <div className="absolute -bottom-6 -left-6 hidden sm:flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                      99.9%
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Uptime &amp; Live Sync
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Sub-50ms Firestore presence
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 4-Column Technical Proof Strip */}
            <div className="mt-20 grid grid-cols-2 lg:grid-cols-4 gap-4">
              {WORKSPACE_GUARANTEES.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between gap-2"
                >
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {item.label}
                  </p>
                  <p className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 01: Core Capabilities Bento Grid */}
        <section
          id="workspace"
          className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 py-20 md:py-28"
        >
          <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-14">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                <span>01. Ecosystem Capabilities</span>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                Built as a cohesive social ecosystem, not disconnected features.
              </h2>
              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                Every user action has predictable feedback, every async operation has a
                defined lifecycle, and every screen is optimized for mobile, tablet, and desktop.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Feature 01 */}
              <article className="md:col-span-2 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col group">
                <div className="aspect-[16/9] overflow-hidden border-b border-slate-200 dark:border-slate-800 relative">
                  <div className="absolute top-4 left-4 z-10 px-3 py-1 rounded-lg bg-black/60 backdrop-blur-md text-white text-xs font-medium flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-400" />
                    <span>Feed &amp; Media Pipeline</span>
                  </div>
                  <EditorialPhoto
                    src={landingGalleryImg}
                    alt="Creator reviewing monochrome architectural prints at an oak studio table"
                  />
                </div>
                <div className="p-8 flex-1 flex flex-col justify-between gap-6">
                  <div className="space-y-3">
                    <h3 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                      {LANDING_CAPABILITIES[0].title}
                    </h3>
                    <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-[65ch]">
                      {LANDING_CAPABILITIES[0].summary}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      {LANDING_CAPABILITIES[0].detail}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      Route: /feed · Verified Members
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigateToProtectedPath('/feed')}
                      className="min-h-[44px] px-5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-blue-600 dark:hover:bg-blue-400 dark:hover:text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>{isAuthorized ? 'Open Feed' : 'Explore Feed'}</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>

              {/* Feature 02 */}
              <article className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col">
                <div className="aspect-[4/3] overflow-hidden border-b border-slate-200 dark:border-slate-800 relative">
                  <div className="absolute top-4 left-4 z-10 px-3 py-1 rounded-lg bg-black/60 backdrop-blur-md text-white text-xs font-medium flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                    <span>Secure Chat</span>
                  </div>
                  <EditorialPhoto
                    src={landingAtriumImg}
                    alt="Minimalist limestone and glass private workspace courtyard in morning daylight"
                  />
                </div>
                <div className="p-7 flex-1 flex flex-col justify-between gap-6">
                  <div className="space-y-3">
                    <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                      {LANDING_CAPABILITIES[1].title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {LANDING_CAPABILITIES[1].summary}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {LANDING_CAPABILITIES[1].detail}
                    </p>
                  </div>
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
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

              {/* Feature 03 */}
              <article className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-8 flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                    {LANDING_CAPABILITIES[2].title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {LANDING_CAPABILITIES[2].summary}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {LANDING_CAPABILITIES[2].detail}
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    /settings
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateToProtectedPath('/settings')}
                    className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>
                      {isAuthorized ? 'Open Settings' : 'Settings'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </article>

              {/* Feature 04 */}
              <article className="md:col-span-2 rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-8 flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Shield className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                    {LANDING_CAPABILITIES[3].title}
                  </h3>
                  <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-[65ch]">
                    {LANDING_CAPABILITIES[3].summary}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-[65ch]">
                    {LANDING_CAPABILITIES[3].detail}
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    Route: /admin · Verified Administrators Only
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateToProtectedPath('/admin')}
                    className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>Open Admin Console</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Section 02: Security & Protected Boundaries */}
        <section
          id="security"
          className="border-t border-slate-200 dark:border-slate-800 py-20 md:py-28"
        >
          <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="max-w-2xl space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                  <span>02. Security Architecture</span>
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                  Zero public leaks. Hardened Firestore security rules.
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onOpenLegal('privacy')}
                className="min-h-[44px] px-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 self-start md:self-auto transition-colors cursor-pointer whitespace-nowrap shadow-sm"
              >
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <span>Read Privacy Policy</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {PROTECTED_WORKSPACE_BOUNDARIES.map((boundary) => (
                <div
                  key={boundary.id}
                  className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-7 flex flex-col justify-between gap-5 shadow-sm"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                        {boundary.title}
                      </h3>
                      <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 tabular-nums">
                        {boundary.path}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {boundary.requirement}
                    </p>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                      {boundary.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 03: Studio Access Inquiries */}
        <section
          id="request-access"
          className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 py-20 md:py-28"
        >
          <div className="max-w-7xl mx-auto px-4 md:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-5 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                <span>03. Studio Inquiries</span>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                Request studio onboarding &amp; operator review.
              </h2>
              <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                Already registered? Head directly to the Auth Page. Teams connecting
                dedicated architectural or creative practices can submit a workspace
                inquiry here for review inside the Admin Console.
              </p>

              <div className="pt-4 space-y-3 text-sm text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Instant review queue ingestion</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Direct admin approval workflow</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Encrypted R2 media channel assignment</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-10 shadow-xl">
              {submittedInquiry ? (
                <div
                  data-testid="landing-inquiry-success"
                  className="space-y-6 py-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <Check className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                        Workspace Inquiry Successfully Recorded
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        Submitted for{' '}
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {submittedInquiry.fullName}
                        </span>{' '}
                        ({submittedInquiry.email}). Administrators can review and approve
                        this inquiry in the Admin Console.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => onNavigateToAuth('signup')}
                      className="min-h-[48px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20"
                    >
                      Continue to Sign Up
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubmittedInquiry(null)}
                      className="min-h-[48px] px-5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Submit Another Note
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInquirySubmit} noValidate className="space-y-5">
                  {formError && (
                    <div
                      role="alert"
                      className="p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs sm:text-sm text-red-700 dark:text-red-300 font-medium"
                    >
                      {formError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label
                        htmlFor="landing-inquiry-name"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Full Name
                      </label>
                      <input
                        id="landing-inquiry-name"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Maya Lin"
                        className="w-full min-h-[48px] px-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="landing-inquiry-email"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Work Email
                      </label>
                      <input
                        id="landing-inquiry-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="maya@studio.com"
                        className="w-full min-h-[48px] px-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="landing-inquiry-org"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Studio or Organization
                    </label>
                    <input
                      id="landing-inquiry-org"
                      type="text"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="Lin Architectural Photography"
                      className="w-full min-h-[48px] px-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="landing-inquiry-note"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Workspace Purpose &amp; Scale
                    </label>
                    <textarea
                      id="landing-inquiry-note"
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Describe your team channels, storage requirements, or studio workflow..."
                      className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all resize-y"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Protected Workspace Access enforced on submission.
                    </p>
                    <button
                      type="submit"
                      className="min-h-[48px] px-7 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold shadow-md shadow-blue-600/20 transition-all cursor-pointer whitespace-nowrap"
                    >
                      Submit Studio Inquiry
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Professional Multi-Column Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-16 px-4 md:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          <div className="space-y-4 md:col-span-1">
            <LoomaLogo />
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Authenticated social feed, direct messaging, ephemeral stories, and studio administration for verified professional networks.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Platform
            </p>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigateToProtectedPath('/feed')}
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  Member Feed
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigateToProtectedPath('/messages')}
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  Direct Messaging
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigateToProtectedPath('/admin')}
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  Admin Console
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Legal &amp; Compliance
            </p>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              <li>
                <button
                  type="button"
                  onClick={() => onOpenLegal('terms')}
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  Terms &amp; Conditions
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenLegal('privacy')}
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenLegal('guidelines')}
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  Community Guidelines
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Authentication &amp; Access
            </p>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigateToAuth('signin')}
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  Sign In to Account
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigateToAuth('signup')}
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  Create Member Profile
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <p>© {new Date().getFullYear()} Looma Studio Network. All rights reserved.</p>
          <p>Protected Workspace Access enforced by Firebase Auth &amp; Firestore Rules.</p>
        </div>
      </footer>
    </div>
  );
}
