import { useState } from 'react';
import { ArrowRight, Check, Lock, LogOut, Moon, Sun } from 'lucide-react';
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
  onLogout: () => Promise<void>;
  onContinueAuthenticated: () => void;
}

function GoogleMark() {
  return (
    <svg
      className="w-4 h-4 shrink-0"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
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

export function AuthView({
  initialMode = 'signin',
  profile,
  firebaseUser,
  authLoading,
  authError,
  theme,
  onSetTheme,
  onLoginGoogle,
  onLogout,
  onContinueAuthenticated,
}: AuthViewProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
  };

  const isSignIn = mode === 'signin';
  const displayError = authError;

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
        {/* Editorial Visual Column (Compact Banner on Mobile, Full Panel on Desktop) */}
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
                  03. Synced via Google OAuth
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Your profile, dark mode preference, and privacy settings stay synchronized across devices.
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
                  ? 'Sign in with a verified Google account to access your feed, messages, and profile.'
                  : 'Create your Looma member profile with a verified Google account to get started.'}
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

            {/* Authenticated Google OAuth Card or OAuth CTA */}
            {firebaseUser ? (
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
                        {firebaseUser.email} · {firebaseUser.emailVerified ? 'Verified Google OAuth' : 'Email verification required'}
                      </p>
                    </div>
                  </div>
                  <Check
                    className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0"
                    aria-hidden="true"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {firebaseUser.emailVerified && (
                    <button
                      type="button"
                      onClick={onContinueAuthenticated}
                      className="flex-1 min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Continue to Looma</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
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
              <div className="space-y-4">
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
                      ? 'Verifying Google Session...'
                      : isSignIn
                        ? 'Continue with Google'
                        : 'Sign up with Google'}
                  </span>
                </button>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                  <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p className="font-semibold text-slate-900 dark:text-slate-200">
                      Protected Workspace Access
                    </p>
                    <p className="mt-0.5">
                      Feed posts, direct messages, and profile settings are restricted to authenticated users with verified Google accounts.
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
