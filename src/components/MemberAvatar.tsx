import { useState } from 'react';
import { cn } from '@project/components/lib/utils';

const SIZES = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
} as const;

/**
 * A crew member's picture, which is a URL they set in Settings. Falls back to
 * their initials when unset or if the link is broken (so a dead link never
 * shows a broken-image icon).
 */
export default function MemberAvatar({ url, firstName, lastName, size = 'md', className }: {
  url?: string;
  firstName?: string | null;
  lastName?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const base = cn(
    'shrink-0 rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center',
    SIZES[size],
    className,
  );
  if (url && !broken) {
    return <img src={url} alt="" onError={() => setBroken(true)} className={cn(base, 'object-cover ring-1 ring-border')} />;
  }
  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
  return <span className={base}>{initials}</span>;
}
