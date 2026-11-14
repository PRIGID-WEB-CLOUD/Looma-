interface LoomaLogoMarkProps {
  size?: 'sm' | 'md' | 'hero';
  className?: string;
}

export function LoomaLogoMark({
  size = 'sm',
  className = '',
}: LoomaLogoMarkProps) {
  const containerClasses =
    size === 'hero'
      ? 'w-20 h-20 sm:w-24 sm:h-24 rounded-3xl shadow-md'
      : size === 'md'
        ? 'w-9 h-9 rounded-xl shadow-sm'
        : 'w-7 h-7 rounded-lg shadow-sm';

  const svgClasses =
    size === 'hero' ? 'w-11 h-11 sm:w-13 sm:h-13' : size === 'md' ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <div
      aria-hidden="true"
      className={`${containerClasses} bg-blue-600 dark:bg-amber-400 flex items-center justify-center shrink-0 transition-colors ${className}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        fill="none"
        className={svgClasses}
      >
        <path
          d="M148 112h64v224h148v56H148V112z"
          className="fill-white dark:fill-slate-950 transition-colors"
        />
        <circle
          cx="348"
          cy="156"
          r="32"
          className="fill-sky-200 dark:fill-amber-800 transition-colors"
        />
      </svg>
    </div>
  );
}

interface LoomaLogoProps {
  className?: string;
}

export function LoomaLogo({ className = '' }: LoomaLogoProps) {
  return (
    <div
      className={`flex items-center gap-2 font-display text-lg md:text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 select-none ${className}`}
    >
      <LoomaLogoMark size="sm" />
      <span>Looma</span>
    </div>
  );
}
