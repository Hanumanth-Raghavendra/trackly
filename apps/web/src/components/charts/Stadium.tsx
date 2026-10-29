import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Trackly's signature: progress drawn as a lap around a stadium-shaped running track.
 * Used for the daily score and the focus timer. `value` is 0-1.
 */
export function Stadium({
  value,
  children,
  className,
  animate = true,
  color = 'var(--volt)',
  label,
}: {
  value: number;
  children?: ReactNode;
  className?: string;
  animate?: boolean;
  color?: string;
  label: string;
}) {
  const W = 340;
  const H = 180;
  const lanes = [0, 12, 24]; // inset of each lane line from the outer edge
  const runnerLane = 30;
  const target = Math.max(0, Math.min(1, value));
  // The one orchestrated motion in the app: the lap fills when the score first appears.
  const [entered, setEntered] = useState(
    () => !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const shown = entered ? target : 0;
  const pathRef = useRef<SVGRectElement>(null);
  const [runner, setRunner] = useState<{ x: number; y: number } | null>(null);
  const gradientId = useId();

  useEffect(() => {
    if (entered) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [entered]);

  useLayoutEffect(() => {
    const el = pathRef.current;
    if (!el || typeof el.getTotalLength !== 'function') return;
    const total = el.getTotalLength();
    const p = el.getPointAtLength(total * target);
    setRunner({ x: p.x, y: p.y });
  }, [target]);

  const inner = (inset: number) => ({
    x: inset + 1,
    y: inset + 1,
    width: W - 2 * inset - 2,
    height: H - 2 * inset - 2,
    rx: (H - 2 * inset - 2) / 2,
  });

  return (
    <div className={cn('relative w-full', className)} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1">
            <stop offset="0" stopColor="var(--track)" />
            <stop offset="1" stopColor="var(--track-deep)" />
          </linearGradient>
        </defs>
        {/* infield */}
        <rect {...inner(lanes[2]! + 18)} fill="var(--track-soft)" />
        {/* lane lines */}
        {lanes.map((inset) => (
          <rect key={inset} {...inner(inset)} fill="none" stroke="var(--lane-strong)" strokeWidth={1.25} />
        ))}
        {/* the lap: a full-length base lane and the volt progress on top */}
        <rect {...inner(runnerLane)} fill="none" stroke="var(--surface-2)" strokeWidth={12} />
        <rect
          ref={pathRef}
          {...inner(runnerLane)}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${shown * 100} 100`}
          style={{ transition: 'stroke-dasharray 1100ms cubic-bezier(.2,.8,.2,1)' }}
        />
        {/* start line */}
        <line
          x1={inner(runnerLane).rx + runnerLane + 1}
          x2={inner(runnerLane).rx + runnerLane + 1}
          y1={1}
          y2={runnerLane + 14}
          stroke="var(--ink)"
          strokeWidth={2}
          opacity={0.35}
        />
        {runner && target > 0.02 && (
          <circle
            cx={runner.x}
            cy={runner.y}
            r={8}
            fill={`url(#${gradientId})`}
            stroke="var(--surface)"
            strokeWidth={3}
            style={{ opacity: shown === target ? 1 : 0, transition: 'opacity 300ms 900ms' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
