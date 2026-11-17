import { ArrowLeft, Check, Mail, Moon, Sun } from 'lucide-react';
import type { ThemeMode } from '../types/social';
import {
  buildLiveGuidelinesDocument,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DOCUMENTS,
  type GuidelinesConfigInput,
  type LegalDocId,
} from '../utils/legalLogic';
import { LoomaLogo } from './LoomaLogo';

interface LegalDocumentViewProps {
  activeDocId: LegalDocId;
  theme: ThemeMode;
  guidelinesConfig?: GuidelinesConfigInput | null;
  fromAuthSignup?: boolean;
  consentAlreadyAccepted?: boolean;
  onSelectDoc: (docId: LegalDocId) => void;
  onSetTheme: (theme: ThemeMode) => void;
  onBack: () => void;
  onAcceptAndReturn?: () => void;
}

const DOC_ORDER: LegalDocId[] = ['terms', 'privacy', 'guidelines'];

export function LegalDocumentView({
  activeDocId,
  theme,
  guidelinesConfig,
  fromAuthSignup = false,
  consentAlreadyAccepted = false,
  onSelectDoc,
  onSetTheme,
  onBack,
  onAcceptAndReturn,
}: LegalDocumentViewProps) {
  const doc =
    activeDocId === 'guidelines'
      ? buildLiveGuidelinesDocument(guidelinesConfig)
      : LEGAL_DOCUMENTS[activeDocId];

  return (
    <div
      data-testid="legal-document-page"
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors looma-stage-enter"
    >
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto h-14 md:h-16 px-4 md:px-8 flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Back</span>
            </button>
            <LoomaLogo />
          </div>

          {/* Desktop Legal Document Switcher */}
          <nav
            aria-label="Legal documents"
            className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
          >
            {DOC_ORDER.map((id) => {
              const item = LEGAL_DOCUMENTS[id];
              const isActive = id === activeDocId;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onSelectDoc(id)}
                  className={`min-h-[36px] px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.shortTitle}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => onSetTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer shrink-0"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Mobile Legal Document Switcher */}
        <div className="sm:hidden px-4 pb-2.5">
          <nav
            aria-label="Legal documents mobile"
            className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
          >
            {DOC_ORDER.map((id) => {
              const item = LEGAL_DOCUMENTS[id];
              const isActive = id === activeDocId;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onSelectDoc(id)}
                  className={`min-h-[36px] px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-center whitespace-nowrap ${
                    isActive
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.shortTitle}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Navigation & Metadata Rail */}
        <aside
          aria-label="Document outline and quick navigation"
          className="lg:col-span-4 space-y-4 lg:sticky lg:top-24"
        >
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span>Looma Legal</span>
                <span aria-hidden="true"> · </span>
                <span className="tabular-nums">Effective {doc.effectiveDate}</span>
              </p>
              <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                {doc.title}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {doc.summary}
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-1">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Sections
              </p>
              {doc.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#legal-${section.id}`}
                  className="block py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  <span className="font-semibold tabular-nums text-slate-400 dark:text-slate-500 mr-2">
                    {section.number}.
                  </span>
                  <span>{section.title}</span>
                </a>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <a
                href={`mailto:${LEGAL_CONTACT_EMAIL}`}
                className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate"
              >
                {LEGAL_CONTACT_EMAIL}
              </a>
            </div>
          </div>
        </aside>

        {/* Right Editorial Legal Document */}
        <article className="lg:col-span-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-8 lg:p-10 space-y-8">
          <header className="pb-6 border-b border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span>Version {doc.version}</span>
              <span aria-hidden="true">·</span>
              <span>Effective {doc.effectiveDate}</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              {doc.title}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-[68ch]">
              {doc.summary}
            </p>
          </header>

          <div className="space-y-8">
            {doc.sections.map((section) => (
              <section
                key={section.id}
                id={`legal-${section.id}`}
                className="scroll-mt-24 space-y-3"
              >
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  <span className="text-blue-600 dark:text-blue-400 tabular-nums mr-2">
                    {section.number}.
                  </span>
                  {section.title}
                </h3>

                {section.paragraphs.map((paragraph, idx) => (
                  <p
                    key={idx}
                    className="text-sm sm:text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed max-w-[68ch]"
                  >
                    {paragraph}
                  </p>
                ))}

                {section.bullets && section.bullets.length > 0 && (
                  <ul className="space-y-2 pt-1 max-w-[68ch]">
                    {section.bullets.map((bullet, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 shrink-0"
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          {/* Cross-Links & Auth Return Action */}
          <footer className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
              {DOC_ORDER.filter((id) => id !== activeDocId).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectDoc(id)}
                  className="min-h-[36px] hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                >
                  Read {LEGAL_DOCUMENTS[id].title}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {fromAuthSignup && onAcceptAndReturn && (
                <button
                  type="button"
                  onClick={onAcceptAndReturn}
                  className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {consentAlreadyAccepted
                      ? 'Accepted · Return to Sign Up'
                      : 'Accept & Return to Sign Up'}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={onBack}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {fromAuthSignup ? 'Back to Auth' : 'Close'}
              </button>
            </div>
          </footer>
        </article>
      </main>
    </div>
  );
}
