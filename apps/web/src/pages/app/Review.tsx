import { addDays, addWeeks, format } from 'date-fns';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAiWeeklySummary, useInsightsConfig, useWeeklyReview } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Chip, Skeleton } from '@/components/ui/misc';
import { dayKey, mondayOf, parseDay } from '@/lib/dates';
import { cn, minutesLabel, pct } from '@/lib/utils';

function Delta({ now, before, unit = '', against }: { now: number; before: number; unit?: string; against: string }) {
  if (!before && !now) return null;
  const diff = now - before;
  if (diff === 0) return <span className="text-xs text-ink-faint">same as {against}</span>;
  return (
    <span className={cn('text-xs', diff > 0 ? 'text-ink-soft' : 'text-ink-faint')}>
      {diff > 0 ? '+' : ''}
      {diff}
      {unit} vs {against}
    </span>
  );
}

export default function Review() {
  const [week, setWeek] = useState(() => mondayOf());
  const weekKey = dayKey(week);
  const isCurrent = weekKey === dayKey(mondayOf());
  const { data: r, isLoading } = useWeeklyReview(weekKey);
  const { data: config } = useInsightsConfig();
  const ai = useAiWeeklySummary();
  const maxScore = 100;
  // A running week is compared with the same days of last week, so the numbers are fair.
  const against = r?.inProgress ? 'same days last week' : 'last week';
  const slots = Array.from({ length: 7 }, (_, i) => {
    const date = dayKey(addDays(week, i));
    return { date, day: r?.days.find((d) => d.date === date) ?? null };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl sm:text-6xl">Weekly review</h1>
          <p className="text-sm text-ink-soft">
            {format(week, 'd MMM')} to {format(addWeeks(week, 1).getTime() - 86_400_000, 'd MMM yyyy')}
            {isCurrent && ' (this week, so far)'}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="secondary" size="icon" aria-label="Previous week" onClick={() => setWeek((w) => addWeeks(w, -1))}>
            <ChevronLeft className="size-5" />
          </Button>
          <Button variant="secondary" size="icon" aria-label="Next week" disabled={isCurrent} onClick={() => setWeek((w) => addWeeks(w, 1))}>
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </header>

      {isLoading || !r ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <section className="rounded-[var(--radius-panel)] bg-track-deep p-6 text-white sm:p-8 dark:bg-track-soft dark:text-ink" aria-labelledby="coach-summary">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="coach-summary" className="font-bold text-volt dark:text-track">
                Coach's summary
              </h2>
              {config?.ai.enabled && (
                <Button
                  variant="volt"
                  size="sm"
                  loading={ai.isPending}
                  onClick={() =>
                    ai.mutate(weekKey, { onError: (e) => toast.error(e instanceof Error ? e.message : 'AI is unavailable right now') })
                  }
                >
                  <Sparkles className="size-4" /> {r.ai ? 'Rewrite with AI' : 'Write it with AI'}
                </Button>
              )}
            </div>
            <p className="mt-3 max-w-[70ch] text-lg leading-relaxed whitespace-pre-line">{r.ai?.summary ?? r.coachSummary}</p>
            {r.ai && <p className="mt-3 text-xs text-white/60 dark:text-ink-faint">Written by {r.ai.provider} from your weekly numbers.</p>}
          </section>

          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Week totals">
            <div className="panel p-5">
              <p className="text-xs text-ink-faint">Average score</p>
              <p className="font-display text-5xl num">{r.totals.averageScore}</p>
              <Delta now={r.totals.averageScore} before={r.previous.averageScore} against={against} />
            </div>
            <div className="panel p-5">
              <p className="text-xs text-ink-faint">Tasks done</p>
              <p className="font-display text-5xl num">{r.totals.tasksCompleted}</p>
              <Delta now={r.totals.tasksCompleted} before={r.previous.tasksCompleted} against={against} />
            </div>
            <div className="panel p-5">
              <p className="text-xs text-ink-faint">Focus</p>
              <p className="font-display text-5xl num">{minutesLabel(r.totals.focusMinutes)}</p>
              <Delta now={r.totals.focusMinutes} before={r.previous.focusMinutes} unit="m" against={against} />
            </div>
            <div className="panel p-5">
              <p className="text-xs text-ink-faint">Habits kept</p>
              <p className="font-display text-5xl num">{pct(r.totals.habitAdherence)}</p>
              <span className="text-xs text-ink-soft num">
                {r.totals.habitsDone} of {r.totals.habitsDue} check-ins
              </span>
            </div>
          </section>

          <section className="panel p-5 sm:p-6" aria-labelledby="days-heading">
            <h2 id="days-heading" className="font-bold">
              Day by day
            </h2>
            <div className="mt-5 grid grid-cols-7 items-end gap-2">
              {slots.map(({ date, day: d }) => (
                <div key={date} className="flex flex-col items-center gap-1.5">
                  <span className="text-xs font-semibold num">{d ? d.score : ''}</span>
                  {d ? (
                    <span
                      className={cn('w-full max-w-12 rounded-t-[4px]', r.bestDay?.date === d.date ? 'bg-track-deep dark:bg-volt' : 'bg-track/60')}
                      style={{ height: `${Math.max(4, (d.score / maxScore) * 140)}px` }}
                      title={`${d.tasksCompleted} tasks, ${d.habitsDone} habits, ${d.focusMinutes} focus min`}
                    />
                  ) : (
                    <span className="h-[140px] w-full max-w-12 rounded-t-[4px] border border-dashed border-lane-strong" title="Still to come" />
                  )}
                  <span className={cn('text-xs', date === dayKey() ? 'font-semibold text-ink' : 'text-ink-faint')}>
                    {date === dayKey() ? 'Today' : format(parseDay(date), 'EEE')}
                  </span>
                </div>
              ))}
            </div>
            {r.bestDay && <p className="mt-4 text-sm text-ink-soft">Best day: {r.bestDay.weekday}, with a score of {r.bestDay.score}.</p>}
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="panel p-5 sm:p-6">
              <h2 className="font-bold">What went well</h2>
              {r.wins.length ? (
                <ul className="mt-3 space-y-2">
                  {r.wins.map((w) => (
                    <li key={w} className="border-l-2 border-volt pl-3">
                      {w}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink-faint">Quiet week. That's allowed.</p>
              )}
              {r.achievements.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {r.achievements.map((a) => (
                    <Chip key={a.code} tone="volt">
                      {a.icon} {a.title}
                    </Chip>
                  ))}
                </div>
              )}
            </section>
            <section className="panel p-5 sm:p-6">
              <h2 className="font-bold">{r.inProgress ? 'For the rest of the week' : 'Try next week'}</h2>
              <ul className="mt-3 space-y-2">
                {r.suggestions.map((s) => (
                  <li key={s} className="border-l-2 border-track pl-3">
                    {s}
                  </li>
                ))}
              </ul>
              {r.topTags.length > 0 && (
                <p className="mt-4 text-sm text-ink-soft">
                  Most of your effort went to {r.topTags.slice(0, 3).map((t) => `#${t.tag}`).join(', ')}.
                </p>
              )}
              <p className="mt-2 text-sm text-ink-soft">
                You earned <span className="font-semibold text-ink num">{r.totals.xpEarned} XP</span> this week.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
