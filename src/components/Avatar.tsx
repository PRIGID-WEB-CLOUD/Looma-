import { useState } from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'business';
  online?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

const BUSINESS_RADIUS_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'rounded-md',
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-2xl',
};

const DOT_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-2 h-2',
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-3.5 h-3.5',
  xl: 'w-4 h-4',
};

export function Avatar({
  src,
  name,
  size = 'md',
  shape = 'circle',
  online = false,
}: AvatarProps) {
  const cleanSrc = src?.trim() || '';
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(cleanSrc) && failedSrc === cleanSrc;
  const radiusClass =
    shape === 'business' ? BUSINESS_RADIUS_CLASSES[size] : 'rounded-full';
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
        className={`${SIZE_CLASSES[size]} ${radiusClass} shrink-0 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-display font-semibold flex items-center justify-center border border-slate-300/70 dark:border-slate-700`}
      >
        {initials}
      </div>
    ) : (
      <img
        src={cleanSrc}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(cleanSrc || null)}
        className={`${SIZE_CLASSES[size]} ${radiusClass} shrink-0 object-cover bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700`}
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
