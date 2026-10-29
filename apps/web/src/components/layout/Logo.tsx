import { cn } from '@/lib/utils';

/** The mark is a tiny running track: two lane lines and a volt runner. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 24" className={cn('h-6 w-10', className)} aria-hidden>
      <rect x="1" y="1" width="38" height="22" rx="11" fill="var(--track)" />
      <rect x="6" y="6" width="28" height="12" rx="6" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.5" />
      <circle cx="29" cy="6" r="3.2" fill="var(--volt)" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      {!compact && <span className="font-display text-[26px] tracking-tight">Trackly</span>}
    </span>
  );
}
