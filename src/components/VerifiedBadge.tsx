import { CheckCircle2 } from 'lucide-react';

interface VerifiedBadgeProps {
  className?: string;
  size?: number;
  title?: string;
}

export function VerifiedBadge({
  className = 'w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 inline-flex items-center justify-center',
  size = 16,
  title = 'Verified Account',
}: VerifiedBadgeProps) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      data-testid="verified-badge"
      className={className}
    >
      <CheckCircle2 size={size} className="fill-blue-600 text-white dark:fill-blue-500 dark:text-slate-950" />
    </span>
  );
}
