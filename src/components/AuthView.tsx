import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Lock,
  LogOut,
  Mail,
  Moon,
  RefreshCw,
  Sun,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ThemeMode, UserProfile } from '../types/social';
import { Avatar } from './Avatar';
import { LoomaLogo, LoomaLogoMark } from './LoomaLogo';

export type AuthMode = 'signin' | 'signup';

interface AuthViewProps {
  initialMode?: AuthMode;
  profile: UserProfile;
  firebaseUser: User | null;
  authLoading: boolean;
  authError: string | null;
  theme: ThemeMode;
  onSetTheme: (theme: ThemeMode) => void;
  onLoginGoogle: () => Promise<void>;
  onLoginApple: () => Promise<void>;
  onLoginEmail: (email: string, pass: string) => Promise<void>;
  onSignupEmail: (email: string, pass: string, name: string) => Promise<void>;
  onResendVerification?: () => Promise<void>;
  onCheckVerified?: () => Promise<boolean>;
  onLogout: () => Promise<void>;
  onContinueAuthenticated: () => void;
}

function GoogleMark() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 5.15c.57-.69 0.96-1.65.86-2.61-.84.04-1.85.56-2.45 1.25-.53.6-1 1.58-.87 2.54.94.07 1.89-.48 2.46-1.18z" />
    </svg>
  );
}

export function AuthView({
  initialMode = 'signin',
  profile,
  firebaseUser,
  authLoading,
  authError,
  theme,
  onSetTheme,
  onLoginGoogle,
  onLoginApple,
  onLoginEmail,
  onSignupEmail,
  onResendVerification,
  onCheckVerified,
  onLogout,
  onContinueAuthenticated,
}: AuthViewProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [useEmailForm, setUseEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setLocalError(null);
    setVerificationNotice(null);
  };

  const isSignIn = mode === 'signin';
  const displayError = localError || authError;

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setLocalError('Enter both email and password.');
      return;
    }
    if (!isSignIn && !displayName.trim()) {
      setLocalError('Enter your display name to sign up.');
      return;
    }
    try {
      if (isSignIn) {
        await onLoginEmail(cleanEmail, password);
      } else {
        await onSignupEmail(cleanEmail, password, displayName.trim());
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Authentication failed.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* Responsive Top Header */}
      <header className="sticky top-0 z-30 h-14 md:h-16 px-4 md:px-8 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto h-full flex items-center justify-between gap-4">
          <LoomaLogo />

          <button
            type="button"
            onClick={() => onSetTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {/* Main Responsive Auth Canvas */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-8 py-5 md:py-12 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
        {/* Editorial Visual Column */}
        <section
          aria-label="Looma community highlights"
          className="lg:col-span-5 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col"
        >
          <div
            data-testid="auth-hero-logo-panel"
            className="relative px-6 py-7 sm:py-9 lg:py-10 bg-slate-100/80 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-col items-start justify-between gap-5 overflow-hidden"
          >
            <div className="w-full flex items-center justify-center py-2 sm:py-4">
              <LoomaLogoMark size="hero" />
            </div>
            <div className="w-full">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isSignIn
                  ? 'Real-time community · Direct messaging'
                  : 'Join creators · Share visual stories'}
              </p>
              <h2 className="font-display text-lg sm:text-xl font-bold mt-1 text-slate-900 dark:text-white text-balance">
                {isSignIn
                  ? 'Pick up right where your conversations left off.'
                  : 'Publish notes, connect in chat, and follow studios.'}
              </h2>
            </div>
          </div>

          <div className="hidden lg:flex p-6 flex-1 flex-col justify-between gap-6">
            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  01. Live Social Feed
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Infinite scroll stream with photo compression, comments, likes, and creator profiles.
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  02. Instant Direct & Group Chat
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Message creators 1-on-1 or collaborate in studio channels with instant notifications.
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  03. Google, Apple & Email Auth
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Secure sign in with Google OAuth, Apple ID, or Email and password.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              Secured with Firebase Authentication & Cloud Firestore
            </div>
          </div>
        </section>

        {/* Auth Form Column */}
        <section
          aria-label={isSignIn ? 'Sign in form' : 'Create account form'}
          className="lg:col-span-7 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-8 flex flex-col justify-between"
        >
          <div className="space-y-6">
            {/* Mode Switcher */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 w-full sm:w-fit">
              <button
                type="button"
                aria-pressed={isSignIn}
                onClick={() => switchMode('signin')}
                className={`flex-1 sm:flex-initial min-h-[40px] px-5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isSignIn
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                aria-pressed={!isSignIn}
                onClick={() => switchMode('signup')}
                className={`flex-1 sm:flex-initial min-h-[40px] px-5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  !isSignIn
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Heading */}
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                {isSignIn ? 'Welcome back to Looma' : 'Create your Looma account'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                {isSignIn
                  ? 'Sign in with Google, Apple, or Email to access your feed, messages, and profile.'
                  : 'Create your Looma member profile to get started.'}
              </p>
            </div>

            {displayError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs sm:text-sm text-red-700 dark:text-red-300"
              >
                {displayError}
              </div>
            )}

            {/* Authenticated User Card, Verification Gate, or OAuth & Email CTAs */}
            {firebaseUser ? (
              !firebaseUser.emailVerified ? (
                <div
                  data-testid="email-verification-gate"
                  className="p-4 sm:p-5 rounded-2xl border border-amber-300 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/30 space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle
                      className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        Email Verification Required
                      </p>
                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                        We sent a verification link to{' '}
                        <span className="font-semibold">{firebaseUser.email || 'your email'}</span>.
                        Verify your inbox before accessing posts, chat, or uploads.
                      </p>
                    </div>
                  </div>

                  {verificationNotice && (
                    <p
                      role="status"
                      className="text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2"
                    >
                      {verificationNotice}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5">
                    {onCheckVerified && (
                      <button
                        type="button"
                        disabled={authLoading}
                        onClick={async () => {
                          setLocalError(null);
                          setVerificationNotice(null);
                          const ok = await onCheckVerified();
                          if (ok) onContinueAuthenticated();
                        }}
                        className="flex-1 min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                      >
                        <RefreshCw className={`w-4 h-4 ${authLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        <span>I&apos;ve Verified — Continue</span>
                      </button>
                    )}

                    {onResendVerification && (
                      <button
                        type="button"
                        disabled={authLoading}
                        onClick={async () => {
                          setLocalError(null);
                          setVerificationNotice(null);
                          try {
                            await onResendVerification();
                            setVerificationNotice(
                              `Verification email resent to ${firebaseUser.email || 'your address'}.`
                            );
                          } catch {
                            // authError is already updated in store
                          }
                        }}
                        className="min-h-[44px] px-4 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/60 cursor-pointer disabled:opacity-60"
                      >
                        Resend Verification Email
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={onLogout}
                      className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" aria-hidden="true" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        src={firebaseUser.photoURL || profile.avatarUrl}
                        name={firebaseUser.displayName || profile.displayName}
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {firebaseUser.displayName || profile.displayName}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          {firebaseUser.email} · Connected via Firebase Auth
                        </p>
                      </div>
                    </div>
                    <Check
                      className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={onContinueAuthenticated}
                      className="flex-1 min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Continue to Looma</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" aria-hidden="true" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-4">
                {!useEmailForm ? (
                  <>
                    <button
                      type="button"
                      disabled={authLoading}
                      onClick={onLoginGoogle}
                      className="w-full min-h-[48px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                        <GoogleMark />
                      </span>
                      <span>
                        {authLoading
                          ? 'Connecting...'
                          : isSignIn
                            ? 'Continue with Google'
                            : 'Sign up with Google'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={authLoading}
                      onClick={onLoginApple}
                      className="w-full min-h-[48px] px-5 rounded-xl bg-black hover:bg-slate-900 dark:bg-white dark:hover:bg-slate-200 dark:text-slate-900 text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <AppleMark />
                      <span>
                        {authLoading
                          ? 'Connecting...'
                          : isSignIn
                            ? 'Continue with Apple'
                            : 'Sign up with Apple'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={authLoading}
                      onClick={() => setUseEmailForm(true)}
                      className="w-full min-h-[48px] px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Mail className="w-4 h-4 text-slate-500" aria-hidden="true" />
                      <span>Continue with Email & Password</span>
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleEmailSubmit} className="space-y-4">
                    {!isSignIn && (
                      <div>
                        <label
                          htmlFor="auth-display-name"
                          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                        >
                          Display Name
                        </label>
                        <input
                          id="auth-display-name"
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="e.g. Maya Lin"
                          required
                          className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="auth-email"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Email Address
                      </label>
                      <input
                        id="auth-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="auth-password"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Password
                      </label>
                      <input
                        id="auth-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        minLength={6}
                        className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div className="flex items-center gap-2.5 pt-1">
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="flex-1 min-h-[46px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                      >
                        <span>{authLoading ? 'Please wait...' : isSignIn ? 'Sign In' : 'Create Account'}</span>
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setUseEmailForm(false)}
                        className="min-h-[46px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        Back
                      </button>
                    </div>
                  </form>
                )}

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                  <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p className="font-semibold text-slate-900 dark:text-slate-200">
                      Protected Workspace Access
                    </p>
                    <p className="mt-0.5">
                      Feed posts, direct messages, and profile settings are restricted to authenticated members.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mode Toggle Footer */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {isSignIn ? 'New to Looma?' : 'Already have an account?'}
            </span>
            <button
              type="button"
              onClick={() => switchMode(isSignIn ? 'signup' : 'signin')}
              className="min-h-[36px] px-2 font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {isSignIn ? 'Create an account' : 'Sign in instead'}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
