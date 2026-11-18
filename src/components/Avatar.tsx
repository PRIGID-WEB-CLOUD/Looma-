import { useState } from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

const DOT_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-3.5 h-3.5',
  xl: 'w-4 h-4',
};

export function Avatar({ src, name, size = 'md', online = false }: AvatarProps) {
  const cleanSrc = src?.trim() || '';
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(cleanSrc) && failedSrc === cleanSrc;
  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'L';

  const avatarNode =
    !cleanSrc || failed ? (
      <div
        aria-hidden="true"
        className={`${SIZE_CLASSES[size]} shrink-0 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-display font-semibold flex items-center justify-center border border-slate-300/70 dark:border-slate-700`}
      >
        {initials}
      </div>
    ) : (
      <img
        src={cleanSrc}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(cleanSrc || null)}
        className={`${SIZE_CLASSES[size]} shrink-0 rounded-full object-cover bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700`}
      />
    );

  if (!online) {
    return avatarNode;
  }

  return (
    <span className="relative inline-flex shrink-0">
      {avatarNode}
      <span
        aria-label="Online"
        title="Online"
        data-testid="online-indicator"
        className={`absolute bottom-0 right-0 block rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 ${DOT_CLASSES[size]}`}
      />
    </span>
  );
}
