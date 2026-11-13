import { useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';

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
      aria-label="Looma Brand & Logo Assets"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
    >
      <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                L
              </div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Looma Brand & Logo
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Official brand vectors, black & white, and transparent logo assets.
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

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Logo Card 1: Default / Colored */}
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-slate-900 flex items-center justify-center p-3 shadow-inner shrink-0">
              <img src="/icon.svg" alt="Looma Default Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Default Brand Icon & Gradient
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Primary app mark with rounded geometry and signature blue gradient.
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                <a
                  href="/icon.svg"
                  download="looma-logo-default.svg"
                  className="min-h-[36px] px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Download SVG</span>
                </a>
                <button
                  type="button"
                  onClick={() => handleCopySvg('/icon.svg', 'default')}
                  className="min-h-[36px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedType === 'default' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Copied SVG!</span>
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

          {/* Logo Card 2: Black & White */}
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-black flex items-center justify-center p-3 shadow-inner shrink-0">
              <img src="/logo-black-white.svg" alt="Looma Black & White Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Black & White Logo
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                High-contrast monochrome mark for print and stark collateral.
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                <a
                  href="/logo-black-white.svg"
                  download="looma-logo-black-white.svg"
                  className="min-h-[36px] px-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer hover:bg-slate-800 dark:hover:bg-slate-100"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Download SVG</span>
                </a>
                <button
                  type="button"
                  onClick={() => handleCopySvg('/logo-black-white.svg', 'bw')}
                  className="min-h-[36px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedType === 'bw' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Copied SVG!</span>
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

          {/* Logo Card 3: Transparent */}
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center p-3 shadow-inner shrink-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:8px_8px]">
              <img src="/logo-transparent.svg" alt="Looma Transparent Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Transparent Vector Logo
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Transparent background asset for seamless overlaying on any design.
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                <a
                  href="/logo-transparent.svg"
                  download="looma-logo-transparent.svg"
                  className="min-h-[36px] px-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer hover:bg-slate-800 dark:hover:bg-slate-100"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Download SVG</span>
                </a>
                <button
                  type="button"
                  onClick={() => handleCopySvg('/logo-transparent.svg', 'transparent')}
                  className="min-h-[36px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedType === 'transparent' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Copied SVG!</span>
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
