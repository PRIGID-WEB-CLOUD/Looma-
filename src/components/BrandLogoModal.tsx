import { useState } from 'react';
import { Check, Copy, Eye, Moon, Sun, X } from 'lucide-react';

interface BrandLogoModalProps {
  open: boolean;
  onClose: () => void;
  onGoToFeed?: () => void;
}

export function BrandLogoModal({
  open,
  onClose,
  onGoToFeed,
}: BrandLogoModalProps) {
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('dark');

  if (!open) return null;

  const handleCopySvg = async (path: string, typeName: string) => {
    try {
      const res = await fetch(path);
      const svgText = await res.text();
      await navigator.clipboard.writeText(svgText);
      setCopiedType(typeName);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Looma Brand Identity & Logo Showcase"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
    >
      <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                L
              </div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Looma Brand Identity &amp; Logo Suite
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Professional brand guidelines showcasing the 3 official logo variants across light and dark workspace themes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close brand modal"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Theme Preview Switcher Bar */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
            <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>Theme Preview Mode:</span>
          </div>
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800">
            <button
              type="button"
              aria-pressed={previewTheme === 'light'}
              onClick={() => setPreviewTheme('light')}
              className={`min-h-[32px] px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                previewTheme === 'light'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
              <span>Light Theme</span>
            </button>
            <button
              type="button"
              aria-pressed={previewTheme === 'dark'}
              onClick={() => setPreviewTheme('dark')}
              className={`min-h-[32px] px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                previewTheme === 'dark'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
              <span>Dark Theme</span>
            </button>
          </div>
        </div>

        {/* Modal Body: 3 Logo Variants */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {/* Logo 1: Default / Colored Mark */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-5 transition-colors">
            <div
              className={`w-24 h-24 rounded-2xl flex items-center justify-center p-4 shadow-sm shrink-0 border transition-colors ${
                previewTheme === 'light'
                  ? 'bg-slate-100 border-slate-200'
                  : 'bg-slate-950 border-slate-800'
              }`}
            >
              <img src="/icon.svg" alt="Looma Default Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left space-y-1">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                  Variant 01
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Default Brand Mark (Gradient)
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Primary app identity featuring signature rounded geometry, dual-tone blue gradient, and high-contrast typography.
              </p>
              <div className="pt-2 flex items-center justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => handleCopySvg('/icon.svg', 'default')}
                  className="min-h-[36px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedType === 'default' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Copied SVG Code!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copy SVG Code</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Logo 2: Black & White */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-5 transition-colors">
            <div
              className={`w-24 h-24 rounded-2xl flex items-center justify-center p-4 shadow-sm shrink-0 border transition-colors ${
                previewTheme === 'light'
                  ? 'bg-white border-slate-200'
                  : 'bg-black border-slate-800'
              }`}
            >
              <img src="/logo-black-white.svg" alt="Looma Black & White Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left space-y-1">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  Variant 02
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Black &amp; White Logo (Monochrome)
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                High-contrast monochrome execution engineered for print collateral, stark branding, and grayscale editorial contexts.
              </p>
              <div className="pt-2 flex items-center justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => handleCopySvg('/logo-black-white.svg', 'bw')}
                  className="min-h-[36px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedType === 'bw' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Copied SVG Code!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copy SVG Code</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Logo 3: Transparent */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-5 transition-colors">
            <div
              className={`w-24 h-24 rounded-2xl flex items-center justify-center p-4 shadow-sm shrink-0 border transition-colors ${
                previewTheme === 'light'
                  ? 'bg-slate-200/80 border-slate-300 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:8px_8px]'
                  : 'bg-slate-800/80 border-slate-700 bg-[radial-gradient(#475569_1px,transparent_1px)] [background-size:8px_8px]'
              }`}
            >
              <img src="/logo-transparent.svg" alt="Looma Transparent Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left space-y-1">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                  Variant 03
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Transparent Vector Logo
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Transparent background vector mark designed for seamless overlaying on varied photography, cards, and UI backdrops.
              </p>
              <div className="pt-2 flex items-center justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => handleCopySvg('/logo-transparent.svg', 'transparent')}
                  className="min-h-[36px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedType === 'transparent' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Copied SVG Code!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copy SVG Code</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onGoToFeed?.();
            }}
            className="min-h-[40px] px-4 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Go to Feed
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
