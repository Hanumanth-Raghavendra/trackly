import { HOURS_LABEL } from '@/lib/dates';
import type { Heatmap } from '@/api/types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM - 11 PM

/**
 * When work gets done: weekday x hour, one sequential hue (track blue), light to dark.
 * A 25-minute focus block counts like one finished task.
 */
export function HourHeatmap({ data }: { data: Heatmap }) {
  const value = (d: number, h: number) => (data.tasks[d]?.[h] ?? 0) + (data.focusMinutes[d]?.[h] ?? 0) / 25;
  let max = 0;
  for (let d = 0; d < 7; d++) for (const h of HOURS) max = Math.max(max, value(d, h));

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-[3px] text-[11px]">
        <caption className="sr-only">Tasks completed and focus time by weekday and hour</caption>
        <thead>
          <tr>
            <th className="w-9" />
            {HOURS.map((h) => (
              <th key={h} scope="col" className="font-medium text-ink-faint">
                {h % 3 === 0 ? HOURS_LABEL(h) : <span className="sr-only">{HOURS_LABEL(h)}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, d) => (
            <tr key={day}>
              <th scope="row" className="pr-1 text-left font-medium text-ink-faint">
                {day}
              </th>
              {HOURS.map((h) => {
                const v = value(d, h);
                const t = max ? v / max : 0;
                const tasks = data.tasks[d]?.[h] ?? 0;
                const mins = data.focusMinutes[d]?.[h] ?? 0;
                return (
                  <td
                    key={h}
                    title={`${day} ${HOURS_LABEL(h)}: ${tasks} task${tasks === 1 ? '' : 's'}, ${mins} focus min`}
                    className="h-6 rounded-[4px]"
                    style={{
                      background: v ? `color-mix(in srgb, var(--track) ${Math.round(12 + t * 88)}%, var(--surface-2))` : 'var(--surface-2)',
                      outline: data.peakHour === h && data.peakWeekday === d + 1 ? '2px solid var(--volt)' : undefined,
                    }}
                  >
                    <span className="sr-only">{`${tasks} tasks, ${mins} minutes`}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-ink-faint" aria-hidden>
        Less
        {[0.1, 0.35, 0.6, 0.85, 1].map((t) => (
          <span key={t} className="size-3 rounded-[3px]" style={{ background: `color-mix(in srgb, var(--track) ${Math.round(12 + t * 88)}%, var(--surface-2))` }} />
        ))}
        More
      </div>
    </div>
  );
}
