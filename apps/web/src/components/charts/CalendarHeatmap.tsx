import { addDays, format } from 'date-fns';
import { dayKey, mondayOf } from '@/lib/dates';

const LEVELS = [0.25, 0.5, 0.75, 1];

function fill(v: number, color: string) {
  return `color-mix(in srgb, ${color} ${Math.round(30 + v * 70)}%, transparent)`;
}

/**
 * Contribution-style heatmap: one column per week (Monday on top), one square per day.
 * Columns stretch to the container so the map always fills its card.
 * `values` maps 'YYYY-MM-DD' to an intensity in 0-1.
 */
export function CalendarHeatmap({
  weeks = 16,
  values,
  color = 'var(--track)',
  label,
  unit = 'habits done',
}: {
  weeks?: number;
  values: Map<string, number>;
  color?: string;
  label: string;
  unit?: string;
}) {
  const start = addDays(mondayOf(), -7 * (weeks - 1));
  const today = dayKey();
  const columns = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
  );
  // A month label sits above the first column that starts in that month.
  const months = columns.map((col, i) => {
    const first = col[0]!;
    const prev = i > 0 ? columns[i - 1]![0]! : null;
    return !prev || prev.getMonth() !== first.getMonth() ? format(first, 'MMM') : '';
  });

  return (
    <figure className="m-0">
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `auto repeat(${weeks}, minmax(0, 1fr))`, gridTemplateRows: '14px' }}
        role="img"
        aria-label={label}
      >
        {['Mon', 'Wed', 'Fri'].map((d, i) => (
          <span
            key={d}
            className="flex items-center pr-1 text-[10px] leading-none text-ink-faint"
            style={{ gridColumn: 1, gridRow: 2 + i * 2 }}
          >
            {d}
          </span>
        ))}
        {columns.map((col, w) => [
          <span
            key={`m${w}`}
            className="whitespace-nowrap text-[10px] leading-none text-ink-faint"
            style={{ gridColumn: w + 2, gridRow: 1 }}
          >
            {months[w]}
          </span>,
          ...col.map((d, i) => {
            const key = dayKey(d);
            const future = key > today;
            const v = values.get(key) ?? 0;
            return (
              <span
                key={key}
                title={future ? undefined : `${format(d, 'EEE d MMM')}: ${v ? `${Math.round(v * 100)}% of ${unit}` : 'nothing'}`}
                className="aspect-square w-full rounded-[3px]"
                style={{
                  gridColumn: w + 2,
                  gridRow: i + 2,
                  background: future ? 'transparent' : v > 0 ? fill(v, color) : 'var(--surface-2)',
                }}
              />
            );
          }),
        ])}
      </div>
      <figcaption className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-ink-faint">
        Less
        <span className="size-3 rounded-[3px] bg-surface-2" />
        {LEVELS.map((l) => (
          <span key={l} className="size-3 rounded-[3px]" style={{ background: fill(l, color) }} />
        ))}
        More
      </figcaption>
    </figure>
  );
}
