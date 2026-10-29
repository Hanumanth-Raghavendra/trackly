import type { ReactNode } from 'react';

export interface BarDatum {
  key: string;
  label: ReactNode;
  value: number;
  /** Display text for the value; defaults to the number. */
  display?: string;
  color?: string;
  /** Plain-text name for the tooltip when the label is truncated. */
  title?: string;
}

/**
 * Horizontal bars with direct labels: identity is always in text, never colour alone.
 * Thin marks, rounded data-ends, recessive track.
 */
export function Bars({
  data,
  max,
  label,
  labelWidth = '9rem',
}: {
  data: BarDatum[];
  max?: number;
  label: string;
  /** Upper bound for the label column; long names truncate with a tooltip. */
  labelWidth?: string;
}) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5" aria-label={label}>
      {data.map((d) => (
        <li
          key={d.key}
          className="grid items-center gap-3 text-sm"
          style={{ gridTemplateColumns: `minmax(0, ${labelWidth}) 1fr 3.5rem` }}
        >
          <span className="truncate" title={typeof d.title === 'string' ? d.title : undefined}>
            {d.label}
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(2, (d.value / top) * 100)}%`, background: d.color ?? 'var(--track)' }}
            />
          </span>
          <span className="text-right font-semibold num">{d.display ?? d.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Vertical weekday columns (Mon..Sun) with the peak shown in the deeper step. */
export function WeekdayColumns({ values, peak }: { values: number[]; peak: number | null }) {
  const max = Math.max(1, ...values);
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div className="flex h-36 items-end gap-2" role="img" aria-label={`Tasks completed per weekday: ${names.map((n, i) => `${n} ${values[i]}`).join(', ')}`}>
      {values.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[11px] font-semibold text-ink-soft num">{v}</span>
          <span
            className="w-full max-w-10 rounded-t-[4px]"
            style={{ height: `${Math.max(3, (v / max) * 96)}px`, background: peak === i + 1 ? 'var(--track-deep)' : 'var(--track)', opacity: peak === i + 1 ? 1 : 0.55 }}
          />
          <span className="text-[11px] text-ink-faint">{names[i]}</span>
        </div>
      ))}
    </div>
  );
}
