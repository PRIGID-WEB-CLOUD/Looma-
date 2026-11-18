import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  Compass,
  Globe,
  Heart,
  Home,
  LayoutGrid,
  Mail,
  Menu,
  MessageCircle,
  MessageSquare,
  Plane,
  Play,
  Plus,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Video,
  X,
} from 'lucide-react';
import type { ThemeMode } from '../src/types/social';
import type { LegalDocId } from '../src/utils/legalLogic';
import {
  createAccessInquiryRecord,
  validateAccessInquiry,
  type AccessInquiry,
} from './landingData';

interface LandingPageViewProps {
  theme: ThemeMode;
  onSetTheme: (theme: ThemeMode) => void;
  onOpenLegal: (docId: LegalDocId) => void;
  onSubmitAccessInquiry?: (inquiry: AccessInquiry) => void;
}

function BlueBrandMark({ scale = 'sm' }: { scale?: 'sm' | 'lg' }) {
  const sizeClass = scale === 'lg' ? 'w-14 h-14 rounded-2xl' : 'w-9 h-9 rounded-xl';
  const iconClass = scale === 'lg' ? 'w-8 h-8' : 'w-5 h-5';
  return (
    <span
      aria-hidden="true"
      className={`${sizeClass} bg-gradient-to-br from-blue-500 to-blue-700 shadow-[0_0_24px_rgba(59,130,246,0.45)] flex items-center justify-center shrink-0 border border-blue-300/30`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        fill="none"
        className={iconClass}
      >
        <path d="M148 112h64v224h148v56H148V112z" className="fill-white" />
        <circle cx="348" cy="156" r="32" className="fill-sky-200" />
      </svg>
    </span>
  );
}

const FAQ_ITEMS = [
  {
    q: 'What is Looma?',
    a: 'Looma is a social community platform for sharing visual moments, joining interest-driven feeds, and staying close through private direct and group conversations.',
  },
  {
    q: 'How do I join Looma?',
    a: 'Click Join Looma anywhere on this page to create your account using Google, Apple, or Email and verify your profile.',
  },
  {
    q: 'Can I control my privacy?',
    a: 'Yes. Inside Profile Settings you can switch between Public and Followers-only visibility, restrict who can message you, and manage your account session anytime.',
  },
];

const TOPIC_TAGS = ['Music', 'Culture', 'Technology', 'Travel', 'Art'];

export function LandingPageView({
  onOpenLegal,
  onSubmitAccessInquiry,
}: LandingPageViewProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [inquiryModalOpen, setInquiryModalOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string>('Technology');

  // Studio Inquiry modal state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedInquiry, setSubmittedInquiry] = useState<AccessInquiry | null>(null);

  useEffect(() => {
    if (!videoModalOpen && !inquiryModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVideoModalOpen(false);
        setInquiryModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inquiryModalOpen, videoModalOpen]);

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
      className="min-h-screen bg-[#040B1B] text-[#F5F8FF] font-sans relative overflow-x-clip selection:bg-blue-500 selection:text-white looma-stage-enter"
    >
      {/* Ambient Blue Glows (radial gradients avoid fixed filter-blur compositor clipping) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-0 w-[680px] h-[680px] bg-[radial-gradient(circle_at_15%_35%,rgba(37,99,235,0.22),transparent_65%)] z-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[820px] right-0 w-[720px] h-[720px] bg-[radial-gradient(circle_at_85%_50%,rgba(14,165,233,0.16),transparent_65%)] z-0"
      />

      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#040B1B]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto h-20 px-5 sm:px-6 flex items-center justify-between gap-6 relative">
          <a
            href="#home"
            aria-label="Looma home"
            className="flex items-center gap-2.5 shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-xl"
          >
            <BlueBrandMark scale="sm" />
            <span className="font-display text-xl font-extrabold tracking-tight text-white">
              Looma
            </span>
          </a>

          <nav
            aria-label="Main navigation"
            className="hidden md:flex items-center gap-7 text-xs font-medium text-slate-300"
          >
            <a
              href="#home"
              className="text-blue-400 font-semibold whitespace-nowrap transition-colors hover:text-blue-300"
            >
              Home
            </a>
            <a
              href="#features"
              className="whitespace-nowrap transition-colors hover:text-blue-400"
            >
              Features
            </a>
            <a
              href="#about"
              className="whitespace-nowrap transition-colors hover:text-blue-400"
            >
              About
            </a>
            <a
              href="#community"
              className="whitespace-nowrap transition-colors hover:text-blue-400"
            >
              Community
            </a>
            <a
              href="#download"
              className="whitespace-nowrap transition-colors hover:text-blue-400"
            >
              Download
            </a>
            <a
              href="#faq"
              className="whitespace-nowrap transition-colors hover:text-blue-400"
            >
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-4 shrink-0">
            <a
              href="/auth"
              className="hidden sm:inline-flex items-center min-h-[40px] px-2 text-xs font-medium text-slate-200 hover:text-blue-400 transition-colors whitespace-nowrap"
            >
              Log in
            </a>
            <a
              href="/auth?mode=signup"
              className="min-h-[40px] px-4 py-2 rounded-full bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-[0_0_24px_rgba(59,130,246,0.4)] transition-all hover:-translate-y-0.5 whitespace-nowrap"
            >
              <span>Join Looma</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Open navigation"
              aria-expanded={mobileMenuOpen}
              className="md:hidden min-h-[40px] min-w-[40px] rounded-xl border border-blue-400/25 bg-[#08152E] flex items-center justify-center text-blue-300 cursor-pointer"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden absolute top-[82px] left-4 right-4 rounded-2xl border border-blue-400/20 bg-[#07142C] p-4 shadow-2xl flex flex-col gap-1 z-40">
              {[
                { href: '#home', label: 'Home' },
                { href: '#features', label: 'Features' },
                { href: '#about', label: 'About' },
                { href: '#community', label: 'Community' },
                { href: '#download', label: 'Download' },
                { href: '#faq', label: 'FAQ' },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2.5 rounded-xl text-sm font-medium text-slate-200 hover:bg-blue-500/15 hover:text-blue-300 transition-colors"
                >
                  {item.label}
                </a>
              ))}
              <a
                href="/auth"
                className="mt-1 px-3 py-2.5 rounded-xl text-sm font-semibold text-blue-300 border-t border-white/10"
              >
                Log in to Looma
              </a>
            </div>
          )}
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero Section */}
        <section
          id="home"
          className="max-w-7xl mx-auto px-5 sm:px-6 pt-12 pb-16 lg:pt-16 lg:pb-24 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-6 items-center"
        >
          <div className="lg:col-span-6 text-center lg:text-left space-y-6">
            <p className="text-[11px] font-extrabold tracking-[0.2em] uppercase text-blue-400">
              YOUR WORLD. YOUR PEOPLE.
            </p>

            <h1 className="font-display text-5xl sm:text-6xl xl:text-[76px] font-extrabold leading-[0.98] tracking-[-0.04em] text-white text-balance">
              Make every
              <br />
              <span className="text-blue-400">connection</span>
              <br />
              count.
            </h1>

            <p className="text-base sm:text-[17px] leading-relaxed text-slate-300 max-w-md mx-auto lg:mx-0">
              A place to share your moments, discover fresh perspectives and build real
              connections with people around the world.
            </p>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-5 pt-2">
              <a
                href="/auth?mode=signup"
                className="min-h-[48px] px-6 py-3.5 rounded-full bg-blue-500 hover:bg-blue-400 text-white text-sm font-bold inline-flex items-center gap-3 shadow-[0_0_32px_rgba(59,130,246,0.38)] transition-all hover:-translate-y-0.5 whitespace-nowrap"
              >
                <span>Join Looma</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </a>

              <button
                type="button"
                id="watch-video"
                onClick={() => setVideoModalOpen(true)}
                className="min-h-[48px] inline-flex items-center gap-3 text-xs sm:text-sm font-medium text-slate-200 hover:text-white cursor-pointer group"
              >
                <span className="w-10 h-10 rounded-full border border-blue-400/70 bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" aria-hidden="true" />
                </span>
                <span>See how it works</span>
              </button>
            </div>

            <div className="pt-5 flex items-center justify-center lg:justify-start gap-3.5">
              <div className="flex items-center -space-x-2">
                {[
                  { initials: 'AM', bg: 'from-sky-300 to-blue-600' },
                  { initials: 'KO', bg: 'from-blue-300 to-indigo-700' },
                  { initials: 'SA', bg: 'from-cyan-300 to-sky-700' },
                  { initials: 'JD', bg: 'from-indigo-300 to-blue-800' },
                ].map((av) => (
                  <span
                    key={av.initials}
                    className={`w-9 h-9 rounded-full border-2 border-[#040B1B] bg-gradient-to-br ${av.bg} flex items-center justify-center text-[10px] font-extrabold text-white shadow-sm`}
                  >
                    {av.initials}
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-400 text-left leading-snug">
                <strong className="text-white font-semibold block">
                  A world of people.
                </strong>
                One place to feel connected.
              </p>
            </div>
          </div>

          {/* Interactive-style App Visual Mockup (Blue Theme) */}
          <div
            aria-label="Illustration of Looma social app screens"
            className="lg:col-span-6 relative h-[430px] sm:h-[540px] flex items-center justify-center select-none scale-[0.9] sm:scale-100"
          >
            {/* Orbital Blue Rings */}
            <div
              aria-hidden="true"
              className="absolute w-[340px] sm:w-[540px] h-[190px] sm:h-[280px] rounded-full border border-blue-400/25 -rotate-[25deg] pointer-events-none"
            />
            <div
              aria-hidden="true"
              className="absolute w-[290px] sm:w-[450px] h-[270px] sm:h-[400px] rounded-full border border-blue-400/15 rotate-[35deg] pointer-events-none"
            />

            {/* Left Tilted Phone — Feed */}
            <div className="relative z-20 -translate-x-10 sm:-translate-x-16 -translate-y-4 -rotate-[7deg] w-[205px] sm:w-[235px] h-[400px] sm:h-[445px] bg-[#F6F9FF] text-slate-900 border-[7px] border-[#11203E] rounded-[34px] shadow-[0_25px_65px_rgba(0,0,0,0.68),0_0_0_1px_rgba(96,165,250,0.5)] overflow-hidden flex flex-col">
              <div className="w-[74px] h-[14px] bg-[#11203E] rounded-b-xl mx-auto mb-1.5" />
              <div className="flex items-center justify-between px-3 py-1 text-[10px] font-bold text-blue-950">
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-blue-600" aria-hidden="true" />
                  Looma
                </span>
                <span className="inline-flex items-center gap-2 text-slate-500">
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  <Search className="w-3 h-3" aria-hidden="true" />
                  <Bell className="w-3 h-3" aria-hidden="true" />
                </span>
              </div>

              {/* Story Avatars */}
              <div className="flex justify-around px-2 py-2 text-[8px] font-medium text-slate-600">
                <div className="flex flex-col items-center gap-1">
                  <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 border-2 border-blue-500 flex items-center justify-center font-extrabold">
                    +
                  </span>
                  <span>You</span>
                </div>
                {[
                  { name: 'Amara', l: 'A', bg: 'from-sky-400 to-blue-600' },
                  { name: 'Kofi', l: 'K', bg: 'from-blue-500 to-indigo-700' },
                  { name: 'Maya', l: 'M', bg: 'from-cyan-500 to-blue-700' },
                ].map((s) => (
                  <div key={s.name} className="flex flex-col items-center gap-1">
                    <span
                      className={`w-7 h-7 rounded-full bg-gradient-to-br ${s.bg} text-white border-2 border-blue-500 flex items-center justify-center font-bold`}
                    >
                      {s.l}
                    </span>
                    <span>{s.name}</span>
                  </div>
                ))}
              </div>

              {/* Post Card */}
              <div className="flex items-center gap-2 px-2.5 py-1 text-[9px]">
                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-700 text-white font-bold flex items-center justify-center shrink-0">
                  K
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 leading-none">Kofi Mensah</p>
                  <p className="text-[7px] text-slate-500 mt-0.5">2 hours ago · Accra</p>
                </div>
                <span className="text-slate-400 font-bold">•••</span>
              </div>

              <div className="mx-2.5 my-1 h-[145px] sm:h-[170px] rounded-xl bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-900 p-3.5 flex items-end shadow-inner">
                <span className="text-white font-extrabold text-lg sm:text-xl leading-tight tracking-tight drop-shadow">
                  GOOD VIBES
                  <br />
                  ONLY.
                </span>
              </div>

              <p className="px-3 pt-1 text-[9px] text-slate-700 font-medium">
                Finding joy in the little moments.
              </p>

              <div className="mt-auto border-t border-slate-200 px-3 py-1.5 text-[9px] text-slate-500 flex items-center justify-between tabular-nums">
                <span>2.4k likes</span>
                <span>184 replies</span>
                <span>62 shares</span>
              </div>
              <div className="border-t border-slate-200 bg-white px-4 py-2 flex items-center justify-between text-slate-500">
                <Home className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <Heart className="w-3.5 h-3.5" aria-hidden="true" />
                <User className="w-3.5 h-3.5" aria-hidden="true" />
              </div>
            </div>

            {/* Right Tilted Phone — Chat */}
            <div className="absolute z-10 translate-x-16 sm:translate-x-28 translate-y-8 rotate-[8deg] w-[180px] sm:w-[205px] h-[350px] sm:h-[395px] bg-[#08142C] text-white border-[7px] border-[#1A2D52] rounded-[32px] shadow-[0_25px_65px_rgba(0,0,0,0.7),0_0_0_1px_rgba(96,165,250,0.3)] overflow-hidden flex flex-col">
              <div className="w-[66px] h-[14px] bg-[#142240] rounded-b-xl mx-auto mb-1.5" />
              <div className="px-3.5 pt-1 pb-3">
                <p className="text-sm font-extrabold">Messages</p>
                <p className="text-[8px] text-slate-400">Stay close, anywhere.</p>
              </div>
              {[
                { name: 'Amara', msg: 'Hey! How are you?', time: '2m', l: 'A', bg: 'from-sky-400 to-blue-600' },
                { name: 'Maya', msg: 'That photo is amazing!', time: '8m', l: 'M', bg: 'from-cyan-400 to-blue-700' },
                { name: 'Kofi', msg: 'See you this weekend.', time: '1h', l: 'K', bg: 'from-blue-500 to-indigo-700' },
              ].map((row) => (
                <div
                  key={row.name}
                  className="flex items-center gap-2 px-3 py-2 border-b border-white/10 text-[9px]"
                >
                  <span
                    className={`w-6 h-6 rounded-full bg-gradient-to-br ${row.bg} text-white font-bold flex items-center justify-center shrink-0`}
                  >
                    {row.l}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{row.name}</p>
                    <p className="text-[7px] text-slate-400 truncate">{row.msg}</p>
                  </div>
                  <span className="text-[7px] text-slate-400 tabular-nums">{row.time}</span>
                </div>
              ))}
              <div className="px-2.5 pt-3 space-y-1.5 text-[8px]">
                <div className="ml-6 rounded-xl rounded-br-sm bg-blue-600 px-2.5 py-1.5 text-white">
                  Great to hear from you!
                </div>
                <div className="mr-6 rounded-xl rounded-bl-sm bg-[#162749] px-2.5 py-1.5 text-slate-200">
                  Let&apos;s catch up soon.
                </div>
              </div>
              <div className="mt-auto m-2.5 rounded-full bg-[#132342] px-3 py-1.5 text-[8px] text-slate-400 flex items-center justify-between">
                <span>Message…</span>
                <Send className="w-3 h-3 text-blue-400" aria-hidden="true" />
              </div>
            </div>

            {/* Floating Tags */}
            <div className="hidden sm:flex items-center gap-1.5 absolute right-2 top-12 z-30 rounded-full bg-[#091838]/95 border border-blue-400/25 px-3.5 py-2 text-[10px] font-medium text-blue-100 shadow-xl">
              <Sparkles className="w-3 h-3 text-blue-400" aria-hidden="true" />
              <span>Discover your people</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 absolute left-2 bottom-10 z-30 rounded-full bg-[#091838]/95 border border-blue-400/25 px-3.5 py-2 text-[10px] font-medium text-blue-100 shadow-xl">
              <Compass className="w-3 h-3 text-blue-400" aria-hidden="true" />
              <span>Always in the loop</span>
            </div>
          </div>
        </section>

        {/* 5-Column Benefit Strip */}
        <section
          id="about"
          aria-label="Looma highlights"
          className="max-w-7xl mx-auto px-5 sm:px-6 mb-24 lg:mb-32"
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 rounded-2xl border border-blue-400/20 bg-gradient-to-r from-[#08152E] via-[#061126] to-[#08152E] py-6 px-3 gap-y-6">
            {[
              { icon: Users, title: 'Connect', sub: 'With your people' },
              { icon: Play, title: 'Share', sub: 'Your moments' },
              { icon: Sparkles, title: 'Discover', sub: 'New perspectives' },
              { icon: MessageSquare, title: 'Communicate', sub: 'Stay in touch' },
              { icon: Heart, title: 'Belong', sub: 'Be yourself' },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className={`flex flex-col items-center justify-center text-center gap-1.5 px-3 ${
                    idx < 4 ? 'lg:border-r lg:border-blue-400/20' : ''
                  }`}
                >
                  <Icon
                    className="w-5 h-5 text-blue-400 drop-shadow-[0_0_12px_rgba(96,165,250,0.65)]"
                    aria-hidden="true"
                  />
                  <b className="text-xs font-bold text-white">{item.title}</b>
                  <small className="text-[10px] text-slate-400">{item.sub}</small>
                </div>
              );
            })}
          </div>
        </section>

        {/* Features Bento Section */}
        <section id="features" className="max-w-7xl mx-auto px-5 sm:px-6 pb-24 lg:pb-32">
          <div className="text-center max-w-xl mx-auto mb-12 space-y-4">
            <p className="text-[10px] font-extrabold tracking-[0.2em] uppercase text-blue-400">
              MORE THAN A FEED
            </p>
            <h2 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1.06] tracking-[-0.03em] text-white text-balance">
              Your social world,
              <br />
              <em className="not-italic text-blue-400">all in one place.</em>
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Everything you need to express yourself, keep up with friends and find
              communities that share your interests.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Tall Left Card */}
            <article className="lg:row-span-2 rounded-2xl border border-blue-400/20 bg-gradient-to-br from-[#0B1C3D] to-[#050E22] p-7 flex flex-col justify-between gap-6">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center mb-4">
                  <LayoutGrid className="w-5 h-5" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-bold text-white">
                  Share your story
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mt-2 max-w-sm">
                  Post updates, photos and videos. Let people see the moments that make
                  you, you.
                </p>
              </div>

              <div className="w-full max-w-sm mx-auto rounded-xl bg-[#F5F8FF] text-slate-900 p-3.5 shadow-2xl">
                <div className="flex items-center gap-2.5 text-xs">
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-blue-700 text-white font-bold flex items-center justify-center shrink-0">
                    A
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 leading-none">Amara O.</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Shared a moment</p>
                  </div>
                  <span className="text-slate-400 font-bold">•••</span>
                </div>
                <div className="h-44 rounded-lg my-3 bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-900 p-4 flex items-end">
                  <span className="text-white font-extrabold text-xl leading-tight">
                    Little moments.
                    <br />
                    Big memories.
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[11px] font-medium text-slate-600 tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 text-blue-600 fill-blue-600" aria-hidden="true" />
                    248
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    32
                  </span>
                  <span className="inline-flex items-center gap-1 ml-auto">
                    <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Share
                  </span>
                </div>
              </div>
            </article>

            {/* Chat Feature Card */}
            <article className="rounded-2xl border border-blue-400/20 bg-gradient-to-br from-[#0B1C3D] to-[#050E22] p-7 flex flex-col justify-between gap-5">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center mb-4">
                  <Mail className="w-5 h-5" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-bold text-white">
                  Conversations that flow
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mt-2 max-w-sm">
                  Keep the conversation going with private messages and group chats.
                </p>
              </div>
              <div className="space-y-2 text-xs">
                <div className="w-4/5 rounded-xl bg-[#13284F] text-slate-100 px-3.5 py-2.5">
                  Hey, are you around?
                </div>
                <div className="w-4/5 ml-auto rounded-xl bg-blue-500 text-white font-semibold px-3.5 py-2.5 shadow-sm">
                  Always! What&apos;s up?
                </div>
                <div className="w-4/5 rounded-xl bg-[#13284F] text-slate-100 px-3.5 py-2.5">
                  Let&apos;s make a plan.
                </div>
              </div>
            </article>

            {/* Community Topics Card */}
            <article className="rounded-2xl border border-blue-400/20 bg-gradient-to-br from-[#0B1C3D] to-[#050E22] p-7 flex flex-col justify-between gap-5">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center mb-4">
                  <Compass className="w-5 h-5" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-bold text-white">
                  Find your community
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mt-2 max-w-sm">
                  Explore topics, creators and communities that match what you love.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {TOPIC_TAGS.map((topic) => {
                  const active = selectedTopic === topic;
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => setSelectedTopic(topic)}
                      className={`px-3.5 py-2 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-400 bg-blue-500/25 text-white'
                          : 'border-blue-400/25 bg-[#08152E] text-blue-100 hover:border-blue-400/60'
                      }`}
                    >
                      {topic}
                    </button>
                  );
                })}
              </div>
            </article>

            {/* Bottom Wide Privacy Card */}
            <article className="lg:col-span-2 rounded-2xl border border-blue-400/20 bg-gradient-to-br from-[#0B1C3D] to-[#050E22] p-7 flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-xl font-bold text-white">
                  Your space, your control
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mt-1.5 max-w-xl">
                  Manage your profile, choose what you share and use the privacy controls
                  available in your account.
                </p>
              </div>
              <div className="mx-auto sm:mx-0 sm:ml-auto w-32 h-28 rounded-full border border-blue-400/30 bg-[radial-gradient(circle,rgba(59,130,246,0.28),transparent_70%)] flex flex-col items-center justify-center shrink-0">
                <Check className="w-9 h-9 text-blue-400" aria-hidden="true" />
                <span className="text-[10px] font-medium text-blue-100 mt-0.5">
                  Privacy matters
                </span>
              </div>
            </article>
          </div>
        </section>

        {/* Community Global Section */}
        <section
          id="community"
          className="max-w-7xl mx-auto px-5 sm:px-6 pb-24 lg:pb-32 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center"
        >
          <div className="h-[310px] sm:h-[360px] rounded-3xl border border-blue-400/20 bg-[radial-gradient(circle_at_center,#1d4ed8_0%,#0a1e47_42%,#040b1b_78%)] relative flex items-center justify-center overflow-hidden">
            <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-full border border-blue-300/30 shadow-[inset_0_0_50px_rgba(59,130,246,0.25),0_0_80px_rgba(59,130,246,0.2)] flex items-center justify-center">
              <Globe
                className="w-28 h-28 sm:w-32 sm:h-32 text-blue-400 drop-shadow-[0_0_32px_rgba(96,165,250,0.7)]"
                strokeWidth={1.25}
                aria-hidden="true"
              />
            </div>

            <div className="absolute top-8 left-6 rounded-full bg-[#09193A]/95 border border-blue-400/25 px-4 py-2 text-[11px] font-medium text-blue-100 shadow-lg inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
              <span>Music lovers</span>
            </div>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full bg-[#09193A]/95 border border-blue-400/25 px-4 py-2 text-[11px] font-medium text-blue-100 shadow-lg inline-flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
              <span>Travel stories</span>
            </div>
            <div className="absolute bottom-8 left-14 rounded-full bg-[#09193A]/95 border border-blue-400/25 px-4 py-2 text-[11px] font-medium text-blue-100 shadow-lg inline-flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
              <span>Creative minds</span>
            </div>
          </div>

          <div className="space-y-5 text-center lg:text-left">
            <p className="text-[10px] font-extrabold tracking-[0.2em] uppercase text-blue-400">
              A BIGGER, CLOSER WORLD
            </p>
            <h2 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1.06] tracking-[-0.03em] text-white text-balance">
              Different voices.
              <br />
              <em className="not-italic text-blue-400">Shared moments.</em>
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-lg mx-auto lg:mx-0">
              From everyday conversations to the interests that bring people together,
              Looma gives your social life room to grow.
            </p>
            <a
              href="/auth?mode=signup"
              className="inline-flex items-center gap-2.5 text-sm font-bold text-blue-400 hover:text-blue-300 transition-colors pt-1"
            >
              <span>Explore the Looma experience</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>
        </section>

        {/* Download / Get Started Banner */}
        <section id="download" className="max-w-7xl mx-auto px-5 sm:px-6 pb-24 lg:pb-32">
          <div className="rounded-3xl border border-blue-400/20 bg-gradient-to-br from-[#0A1E46] to-[#050E22] p-8 sm:p-14 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center overflow-hidden">
            <div className="lg:col-span-7 text-center lg:text-left space-y-4">
              <p className="text-[10px] font-extrabold tracking-[0.2em] uppercase text-blue-400">
                YOUR PEOPLE ARE HERE
              </p>
              <h2 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1.06] tracking-[-0.03em] text-white text-balance">
                Ready to feel
                <br />
                <em className="not-italic text-blue-400">more connected?</em>
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Start building your social world with Looma.
              </p>
              <div className="pt-2">
                <a
                  href="/auth?mode=signup"
                  className="min-h-[48px] px-6 py-3.5 rounded-full bg-blue-500 hover:bg-blue-400 text-white text-sm font-bold inline-flex items-center gap-3 shadow-[0_0_30px_rgba(59,130,246,0.38)] transition-all hover:-translate-y-0.5 whitespace-nowrap"
                >
                  <span>Get started with Looma</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </a>
              </div>
              <small className="block text-[11px] text-slate-400 pt-1">
                Available instantly on the web as an installable PWA.
              </small>
            </div>

            <div className="lg:col-span-5 h-[260px] relative flex items-center justify-center">
              <div
                aria-hidden="true"
                className="absolute w-72 h-44 rounded-full border border-blue-400/25 -rotate-[25deg]"
              />
              <div className="relative z-10 w-36 h-60 rounded-[26px] border-[5px] border-[#213B6E] bg-gradient-to-br from-[#122D61] to-[#061128] flex flex-col items-center justify-center gap-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.7),0_0_45px_rgba(59,130,246,0.28)]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute w-36 h-36 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.42),transparent_70%)]"
                />
                <BlueBrandMark scale="lg" />
                <b className="relative text-xl font-extrabold text-white">Looma</b>
                <small className="relative text-[9px] text-blue-200 tracking-wide">
                  Connect · Share · Belong
                </small>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section
          id="faq"
          className="max-w-7xl mx-auto px-5 sm:px-6 pb-24 lg:pb-28 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14"
        >
          <div className="lg:col-span-5 text-center lg:text-left space-y-3">
            <p className="text-[10px] font-extrabold tracking-[0.2em] uppercase text-blue-400">
              GOOD TO KNOW
            </p>
            <h2 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1.06] tracking-[-0.03em] text-white text-balance">
              Frequently asked
              <br />
              <em className="not-italic text-blue-400">questions.</em>
            </h2>
          </div>

          <div className="lg:col-span-7 divide-y divide-blue-400/20 border-t border-b border-blue-400/20">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="list-none cursor-pointer flex items-center justify-between gap-4 text-sm sm:text-base font-bold text-white select-none">
                  <span>{item.q}</span>
                  <Plus
                    className="w-5 h-5 text-blue-400 shrink-0 transition-transform duration-200 group-open:rotate-45"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-3 text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Final Join CTA */}
        <section id="join" className="max-w-7xl mx-auto px-5 sm:px-6 pb-20">
          <div
            id="contact"
            className="text-center rounded-3xl border border-blue-400/20 bg-[radial-gradient(ellipse_at_50%_100%,#1d4ed8_0%,#091b3f_58%,#040b1b_100%)] px-6 py-16 space-y-5"
          >
            <p className="text-[10px] font-extrabold tracking-[0.2em] uppercase text-blue-300">
              CONNECT · SHARE · BELONG
            </p>
            <h2 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1.06] tracking-[-0.03em] text-white text-balance">
              Your next connection
              <br />
              starts <em className="not-italic text-blue-300">with Looma.</em>
            </h2>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3.5">
              <a
                href="/auth?mode=signup"
                className="min-h-[48px] px-7 py-3.5 rounded-full bg-white text-[#071535] hover:bg-blue-50 text-sm font-extrabold inline-flex items-center gap-2.5 shadow-xl transition-all hover:-translate-y-0.5 whitespace-nowrap"
              >
                <span>Explore Looma</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={() => {
                  setSubmittedInquiry(null);
                  setFormError(null);
                  setInquiryModalOpen(true);
                }}
                className="min-h-[48px] px-6 py-3.5 rounded-full border border-blue-300/35 bg-blue-950/50 hover:bg-blue-900/60 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Studio Inquiry</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-7xl mx-auto px-5 sm:px-6 pt-8 pb-8 border-t border-blue-400/20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <a href="#home" className="flex items-center gap-2.5">
            <BlueBrandMark scale="sm" />
            <div>
              <strong className="block font-display text-lg font-extrabold text-white leading-none">
                Looma
              </strong>
              <small className="block text-[10px] text-slate-400 mt-1">
                Connect · Share · Belong
              </small>
            </div>
          </a>

          <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-slate-400">
            <a href="#features" className="hover:text-blue-400 transition-colors">
              Features
            </a>
            <a href="#about" className="hover:text-blue-400 transition-colors">
              About
            </a>
            <a href="#community" className="hover:text-blue-400 transition-colors">
              Community
            </a>
            <a href="#faq" className="hover:text-blue-400 transition-colors">
              FAQ
            </a>
            <button
              type="button"
              onClick={() => {
                setSubmittedInquiry(null);
                setFormError(null);
                setInquiryModalOpen(true);
              }}
              className="hover:text-blue-400 transition-colors cursor-pointer"
            >
              Contact
            </button>
            <button
              type="button"
              onClick={() => onOpenLegal('terms')}
              className="hover:text-blue-400 transition-colors cursor-pointer"
            >
              Terms
            </button>
            <button
              type="button"
              onClick={() => onOpenLegal('privacy')}
              className="hover:text-blue-400 transition-colors cursor-pointer"
            >
              Privacy
            </button>
            <button
              type="button"
              onClick={() => onOpenLegal('guidelines')}
              className="hover:text-blue-400 transition-colors cursor-pointer"
            >
              Guidelines
            </button>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400">
          <span>© {new Date().getFullYear()} Looma. All rights reserved.</span>
          <span className="inline-flex items-center gap-1.5">
            Made for a more connected world.
            <Sparkles className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
          </span>
        </div>
      </footer>

      {/* See How It Works Modal */}
      {videoModalOpen && (
        <div
          id="video-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Looma introduction"
          onClick={(e) => {
            if (e.target === e.currentTarget) setVideoModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-blue-400/25 bg-[#08152E] p-7 text-center relative shadow-2xl space-y-4">
            <button
              type="button"
              aria-label="Close"
              onClick={() => setVideoModalOpen(false)}
              className="absolute right-4 top-4 w-9 h-9 rounded-full hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>

            <div className="w-12 h-12 mx-auto rounded-full border border-blue-400 bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <Video className="w-5 h-5" aria-hidden="true" />
            </div>

            <h3 className="font-display text-2xl font-bold text-white">
              Welcome to Looma
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Share photo stories on the live feed, chat 1-on-1 or in groups with real-time
              presence, and connect over WebRTC audio and video calls.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
              <a
                href="/auth?mode=signup"
                className="min-h-[44px] px-5 rounded-full bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold inline-flex items-center justify-center gap-2"
              >
                <span>Join Looma</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={() => setVideoModalOpen(false)}
                className="min-h-[44px] px-5 rounded-full border border-blue-400/25 text-xs font-semibold text-slate-200 hover:bg-white/5 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Studio & Team Access Inquiry Modal */}
      {inquiryModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Studio inquiry"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInquiryModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-blue-400/25 bg-[#08152E] p-6 sm:p-7 relative shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-bold text-white">
                  Contact &amp; Studio Inquiry
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Connect with our team for studio onboarding or community questions.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close inquiry modal"
                onClick={() => setInquiryModalOpen(false)}
                className="w-9 h-9 rounded-full hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {submittedInquiry ? (
              <div
                data-testid="landing-inquiry-success"
                className="rounded-xl border border-blue-400/30 bg-blue-500/10 p-5 space-y-3"
              >
                <div className="flex items-center gap-2.5 text-blue-300 font-bold text-sm">
                  <Check className="w-5 h-5" aria-hidden="true" />
                  <span>Inquiry Successfully Recorded</span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  Thank you, <strong>{submittedInquiry.fullName}</strong> (
                  {submittedInquiry.email}). We have received your message and will follow
                  up shortly.
                </p>
                <button
                  type="button"
                  onClick={() => setInquiryModalOpen(false)}
                  className="min-h-[40px] px-4 rounded-full bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleInquirySubmit} noValidate className="space-y-3.5">
                {formError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl border border-rose-500/40 bg-rose-950/50 text-xs text-rose-200"
                  >
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="landing-inquiry-name"
                      className="block text-xs font-semibold text-slate-300 mb-1"
                    >
                      Full Name
                    </label>
                    <input
                      id="landing-inquiry-name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Maya Lin"
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#040B1B] border border-blue-400/25 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="landing-inquiry-email"
                      className="block text-xs font-semibold text-slate-300 mb-1"
                    >
                      Email Address
                    </label>
                    <input
                      id="landing-inquiry-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="maya@studio.com"
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#040B1B] border border-blue-400/25 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="landing-inquiry-org"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    Studio or Community (Optional)
                  </label>
                  <input
                    id="landing-inquiry-org"
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Looma Creative Studio"
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#040B1B] border border-blue-400/25 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="landing-inquiry-note"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    Message
                  </label>
                  <textarea
                    id="landing-inquiry-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Tell us about your team or inquiry..."
                    className="w-full p-3.5 rounded-xl bg-[#040B1B] border border-blue-400/25 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setInquiryModalOpen(false)}
                    className="min-h-[42px] px-4 rounded-full border border-blue-400/25 text-xs font-semibold text-slate-200 hover:bg-white/5 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="min-h-[42px] px-5 rounded-full bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold cursor-pointer shadow-[0_0_20px_rgba(59,130,246,0.35)]"
                  >
                    Send Inquiry
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
