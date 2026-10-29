import { format, parseISO } from 'date-fns';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ScoreDay } from '@/api/types';

interface Point {
  date: string;
  score: number;
  avg: number;
}

function withRollingAverage(days: ScoreDay[], window = 7): Point[] {
  return days.map((d, i) => {
    const slice = days.slice(Math.max(0, i - window + 1), i + 1);
    return { date: d.date, score: d.score, avg: Math.round(slice.reduce((s, x) => s + x.score, 0) / slice.length) };
  });
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  return (
    <div className="rounded-[10px] border border-lane bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-ink">{format(parseISO(p.date), 'EEE d MMM')}</p>
      <p className="text-ink-soft">
        Score <span className="font-semibold text-ink num">{p.score}</span>
      </p>
      <p className="text-ink-soft">
        7-day average <span className="font-semibold text-ink num">{p.avg}</span>
      </p>
    </div>
  );
}

/** Daily score (area) with a dashed 7-day average; one axis, 0-100. */
export function ScoreTrend({ days }: { days: ScoreDay[] }) {
  const data = withRollingAverage(days);
  return (
    <figure>
      <div className="mb-2 flex gap-4 text-xs text-ink-soft" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-track/30 ring-2 ring-track ring-inset" /> Daily score
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-ink-soft" /> 7-day average
        </span>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
            <defs>
              <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--track)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--track)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--lane)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => format(parseISO(d), 'd MMM')}
              tick={{ fill: 'var(--ink-faint)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: 'var(--ink-faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--lane-strong)', strokeWidth: 1 }} />
            <Area type="monotone" dataKey="score" stroke="var(--track)" strokeWidth={2} fill="url(#scoreFill)" activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
            <Line type="monotone" dataKey="avg" stroke="var(--ink-soft)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Daily productivity score over the last {days.length} days. Latest: {days.at(-1)?.score ?? 0}.
      </figcaption>
    </figure>
  );
}
