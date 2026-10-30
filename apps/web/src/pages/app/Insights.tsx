import { format, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import {
  useBreakdown,
  useFocusStats,
  useHabitInsights,
  useHeatmap,
  useInsightCards,
  useProcrastination,
  useProjects,
  useScores,
} from '@/api/hooks';
import type { InsightCard } from '@/api/types';
import { Bars, WeekdayColumns } from '@/components/charts/Bars';
import { HourHeatmap } from '@/components/charts/HourHeatmap';
import { ScoreTrend } from '@/components/charts/ScoreTrend';
import { EmptyState, LaneBar, Segmented, Skeleton } from '@/components/ui/misc';
import { HOURS_LABEL } from '@/lib/dates';
import { cn, minutesLabel, pct, PRIORITY_LABEL } from '@/lib/utils';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function Section({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('panel min-w-0 p-5 sm:p-6', className)}>
      <h2 className="font-bold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="font-display text-4xl num">{value}</p>
      {note && <p className="text-xs text-ink-soft">{note}</p>}
    </div>
  );
}

const CARD_BORDER: Record<InsightCard['kind'], string> = {
  warning: 'border-signal',
  tip: 'border-track',
  positive: 'border-volt',
  neutral: 'border-lane-strong',
};

export default function Insights() {
  const [range, setRange] = useState<'30' | '90'>('30');
  const days = Number(range);
  const scores = useScores(days);
  const heat = useHeatmap(days);
  const proc = useProcrastination(days);
  const habits = useHabitInsights(days);
  const breakdown = useBreakdown(days);
  const focus = useFocusStats(days);
  const cards = useInsightCards();
  const { data: projects } = useProjects();

  const projectNames = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const avgScore = scores.data?.length ? Math.round(scores.data.reduce((s, d) => s + d.score, 0) / scores.data.length) : null;
  const best = scores.data?.reduce((b, d) => (d.score > (b?.score ?? -1) ? d : b), scores.data[0]);
  const hasData = (scores.data ?? []).some((d) => d.tasksCompleted + d.habitsDone + d.focusMinutes > 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl sm:text-6xl">Insights</h1>
          <p className="text-sm text-ink-soft">Patterns in how you actually work, from your own data.</p>
        </div>
        <Segmented
          label="Range"
          value={range}
          onChange={setRange}
          options={[
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
          ]}
        />
      </header>

      {scores.isLoading ? (
        <Skeleton className="h-72" />
      ) : !hasData ? (
        <div className="panel">
          <EmptyState title="Not enough data yet" body="Complete tasks, check in habits and log focus for about a week. The patterns show up here." />
        </div>
      ) : (
        <>
          <Section title="Daily score" subtitle="Tasks, habits, focus and punctuality rolled into one number per day.">
            <div className="mb-5 grid grid-cols-3 gap-4">
              <Stat label="Average" value={avgScore == null ? '—' : String(avgScore)} />
              <Stat label="Best day" value={best ? String(best.score) : '—'} note={best ? format(parseISO(best.date), 'EEE d MMM') : undefined} />
              <Stat label="Days scored 70+" value={String((scores.data ?? []).filter((d) => d.score >= 70).length)} />
            </div>
            <ScoreTrend days={scores.data ?? []} />
          </Section>

          {cards.data && cards.data.length > 0 && (
            <section aria-labelledby="notes-heading">
              <h2 id="notes-heading" className="mb-3 text-lg font-bold">
                What the coach noticed
              </h2>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {cards.data.map((c) => (
                  <li key={c.id} className={cn('rounded-r-[var(--radius-row)] border-l-[3px] bg-surface py-3 pr-4 pl-4', CARD_BORDER[c.kind])}>
                    <p className="font-semibold">
                      <span aria-hidden className="mr-1.5">
                        {c.icon}
                      </span>
                      {c.title}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">{c.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
            <Section
              title="When you get things done"
              subtitle={
                heat.data?.peakHour != null
                  ? `Peak: ${heat.data.peakWeekday ? `${WEEKDAYS[heat.data.peakWeekday - 1]}s around ` : 'around '}${HOURS_LABEL(heat.data.peakHour).replace('a', ' AM').replace('p', ' PM')}. Stronger blue means more done.`
                  : 'Darker squares = more tasks finished and focus time logged.'
              }
            >
              {heat.data ? <HourHeatmap data={heat.data} /> : <Skeleton className="h-48" />}
            </Section>
            <Section title="By weekday" subtitle="Tasks completed per day of the week.">
              {heat.data ? <WeekdayColumns values={heat.data.weekdayTotals} peak={heat.data.peakWeekday} /> : <Skeleton className="h-36" />}
            </Section>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Section title="Deadlines" subtitle="How close to the deadline you usually finish.">
              {proc.data ? (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <Stat label="On time" value={pct(proc.data.onTimeRate)} />
                    <Stat label="Avg. delay when late" value={proc.data.avgLateHours == null ? '—' : `${Math.round(proc.data.avgLateHours)}h`} />
                    <Stat label="Overdue now" value={String(proc.data.overdueOpen)} />
                  </div>
                  {proc.data.index != null && (
                    <div className="mt-5">
                      <div className="mb-1.5 flex justify-between text-xs text-ink-soft">
                        <span>Time used before finishing</span>
                        <span className="font-semibold text-ink num">{proc.data.index}% of the window</span>
                      </div>
                      <LaneBar value={proc.data.index / 150} color="var(--track)" label="Share of available time used" />
                      <div className="mt-1 flex justify-between text-[11px] text-ink-faint">
                        <span>Right away</span>
                        <span>At the deadline</span>
                        <span>Late</span>
                      </div>
                    </div>
                  )}
                  {proc.data.byPriority.some((p) => p.withDue > 0) && (
                    <div className="mt-6">
                      <p className="mb-3 text-sm font-semibold">Finished late, by priority</p>
                      <Bars
                        label="Late rate by priority"
                        max={1}
                        data={proc.data.byPriority
                          .filter((p) => p.withDue > 0)
                          .map((p) => ({ key: p.priority, label: PRIORITY_LABEL[p.priority], value: p.lateRate ?? 0, display: pct(p.lateRate) }))}
                      />
                    </div>
                  )}
                </>
              ) : (
                <Skeleton className="h-48" />
              )}
            </Section>

            <Section title="Habit consistency" subtitle={`Share of scheduled days done in the last 30 days.`}>
              {habits.data?.length ? (
                <Bars
                  label="Habit consistency"
                  labelWidth="13rem"
                  max={1}
                  data={habits.data.map((h) => ({
                    key: h.habitId,
                    label: (
                      <>
                        <span aria-hidden className="mr-1">
                          {h.icon}
                        </span>
                        {h.name}
                      </>
                    ),
                    title: h.name,
                    value: h.completionRate30d,
                    display: pct(h.completionRate30d),
                    color: h.color ?? undefined,
                  }))}
                />
              ) : (
                <p className="text-sm text-ink-faint">No habits yet.</p>
              )}
            </Section>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Section title="Focus" subtitle={`Last ${days} days`}>
              {focus.data ? (
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Total" value={minutesLabel(focus.data.totalMinutes)} />
                  <Stat label="Sessions" value={String(focus.data.sessions)} />
                  <Stat label="Finished" value={pct(focus.data.completionRate)} />
                  <Stat label="Avg. length" value={focus.data.avgSessionMinutes ? `${focus.data.avgSessionMinutes}m` : '—'} />
                </div>
              ) : (
                <Skeleton className="h-32" />
              )}
            </Section>
            <Section title="Top tags" subtitle="Completed tasks by tag.">
              {breakdown.data?.tags.length ? (
                <Bars label="Completed tasks by tag" data={breakdown.data.tags.slice(0, 6).map((t) => ({ key: t.tag, label: `#${t.tag}`, value: t.count }))} />
              ) : (
                <p className="text-sm text-ink-faint">Tag tasks with #words to see this.</p>
              )}
            </Section>
            <Section title="Projects" subtitle="Completed tasks by project.">
              {breakdown.data?.projects.length ? (
                <Bars
                  label="Completed tasks by project"
                  data={breakdown.data.projects.slice(0, 6).map((p) => {
                    const project = p.projectId ? projectNames.get(p.projectId) : undefined;
                    return { key: p.projectId ?? 'none', label: project?.name ?? 'No project', value: p.count, color: project?.color };
                  })}
                />
              ) : (
                <p className="text-sm text-ink-faint">No completed tasks yet.</p>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
