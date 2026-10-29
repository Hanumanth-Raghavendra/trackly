import { endOfDay, format, isToday, parseISO } from 'date-fns';
import { ChevronDown, Plus, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useHabits, useOverview, useProjects, useTasks } from '@/api/hooks';
import type { InsightCard, Task } from '@/api/types';
import { Stadium } from '@/components/charts/Stadium';
import { HabitCheckButton, StreakBadge } from '@/components/habits/HabitRow';
import { TaskRow } from '@/components/tasks/TaskRow';
import { Button } from '@/components/ui/button';
import { EmptyState, LaneBar, Skeleton } from '@/components/ui/misc';
import { greeting } from '@/lib/dates';
import { cn, PRIORITY_ORDER } from '@/lib/utils';
import { useSession } from '@/stores/session';
import { useUi } from '@/stores/ui';

const KIND_STYLE: Record<InsightCard['kind'], string> = {
  warning: 'border-signal',
  tip: 'border-track',
  positive: 'border-volt',
  neutral: 'border-lane-strong',
};

function ScorePanel() {
  const { data: o, isLoading } = useOverview();
  if (isLoading || !o) return <Skeleton className="h-[420px] rounded-[var(--radius-panel)]" />;
  const delta = o.yesterdayScore == null ? null : o.score.score - o.yesterdayScore;

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="score-heading">
      <h2 id="score-heading" className="sr-only">
        Today's score
      </h2>
      <Stadium value={o.score.score / 100} label={`Today's productivity score is ${o.score.score} out of 100`}>
        <span className="font-display text-[clamp(64px,16vw,88px)] leading-none num">{o.score.score}</span>
        <span className="text-sm font-semibold text-ink-soft">{o.score.label}</span>
      </Stadium>
      <div className="mt-4 flex justify-center gap-6 text-center text-xs text-ink-faint">
        <span>
          Yesterday{' '}
          <span className="font-semibold text-ink num">{o.yesterdayScore ?? '—'}</span>
          {delta != null && delta !== 0 && (
            <span className={cn('ml-1 num', delta > 0 ? 'text-ink-soft' : 'text-ink-faint')}>
              ({delta > 0 ? '+' : ''}
              {delta})
            </span>
          )}
        </span>
        <span>
          7-day average <span className="font-semibold text-ink num">{o.weekAverage}</span>
        </span>
      </div>
      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">Where today's points come from</caption>
        <tbody>
          {o.score.components.map((c) => (
            <tr key={c.key} className="lane-t">
              <th scope="row" className="w-24 py-2.5 text-left font-semibold">
                {c.label}
              </th>
              <td className="py-2.5 text-ink-soft">{c.detail}</td>
              <td className="py-2.5 text-right font-condensed font-bold num">
                {Math.round(c.points)}
                <span className="font-normal text-ink-faint">/{Math.round(c.weight * 100)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CoachNotes() {
  const { data: o, isLoading } = useOverview();
  if (isLoading) return <Skeleton className="h-64 rounded-[var(--radius-panel)]" />;
  if (!o) return null;
  return (
    <section aria-labelledby="coach-heading">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="coach-heading" className="text-lg font-bold">
          Coach's notes
        </h2>
        <Link to="/app/insights" className="text-sm font-semibold text-track hover:underline">
          All insights
        </Link>
      </div>
      <ul className="space-y-3">
        {o.insights.map((c) => (
          <li key={c.id} className={cn('rounded-r-[var(--radius-row)] border-l-[3px] bg-surface py-3 pr-4 pl-4', KIND_STYLE[c.kind])}>
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
  );
}

function sortForToday(a: Task, b: Task) {
  const ad = a.dueAt ? parseISO(a.dueAt).getTime() : Infinity;
  const bd = b.dueAt ? parseISO(b.dueAt).getTime() : Infinity;
  if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1;
  if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1;
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || ad - bd;
}

function TodayTasks() {
  const { data: tasks, isLoading } = useTasks();
  const { data: projects } = useProjects();
  const openQuickAdd = useUi((s) => s.openQuickAdd);
  const [showDone, setShowDone] = useState(false);
  const projectMap = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);

  const { open, done, subtasksOf } = useMemo(() => {
    const end = endOfDay(new Date()).getTime();
    const all = tasks ?? [];
    const subs = new Map<string, Task[]>();
    for (const t of all) if (t.parentId) subs.set(t.parentId, [...(subs.get(t.parentId) ?? []), t]);
    const top = all.filter((t) => !t.parentId);
    return {
      open: top
        .filter((t) => t.status !== 'DONE' && (t.status === 'IN_PROGRESS' || (t.dueAt && parseISO(t.dueAt).getTime() <= end)))
        .sort(sortForToday),
      done: all.filter((t) => t.status === 'DONE' && t.completedAt && isToday(parseISO(t.completedAt))),
      subtasksOf: subs,
    };
  }, [tasks]);

  return (
    <section aria-labelledby="today-tasks">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="today-tasks" className="text-lg font-bold">
          Today's plan
          {open.length > 0 && <span className="ml-2 text-base font-normal text-ink-faint num">{open.length}</span>}
        </h2>
        <Button variant="ghost" size="sm" onClick={() => openQuickAdd({ dueAt: endOfDay(new Date()).toISOString() })}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
      <div className="panel p-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : open.length === 0 ? (
          <EmptyState
            title="Nothing due today"
            body="Add what matters most, or pull something forward from your task list."
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link to="/app/tasks">Open tasks</Link>
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-lane">
            {open.map((t) => (
              <TaskRow key={t.id} task={t} subtasks={subtasksOf.get(t.id)} projects={projectMap} className="rounded-none first:rounded-t-[14px] last:rounded-b-[14px]" />
            ))}
          </div>
        )}
        {done.length > 0 && (
          <div className="lane-t mt-1 pt-1">
            <button
              onClick={() => setShowDone((v) => !v)}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-surface-2"
              aria-expanded={showDone}
            >
              <ChevronDown className={cn('size-4 transition-transform', !showDone && '-rotate-90')} />
              Done today <span className="num text-ink-faint">{done.length}</span>
            </button>
            {showDone && done.map((t) => <TaskRow key={t.id} task={t} projects={projectMap} />)}
          </div>
        )}
      </div>
    </section>
  );
}

function TodayHabits() {
  const { data: habits, isLoading } = useHabits();
  const { data: o } = useOverview();
  const openHabit = useUi((s) => s.openHabit);
  const due = (habits ?? []).filter((h) => h.stats.dueToday || h.stats.doneToday);
  const risk = new Map((o?.atRiskHabits ?? []).map((r) => [r.habitId, r]));

  return (
    <section aria-labelledby="today-habits">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="today-habits" className="text-lg font-bold">
          Habits
          {due.length > 0 && (
            <span className="ml-2 text-base font-normal text-ink-faint num">
              {due.filter((h) => h.stats.doneToday).length}/{due.length}
            </span>
          )}
        </h2>
        <Link to="/app/habits" className="text-sm font-semibold text-track hover:underline">
          Manage
        </Link>
      </div>
      <div className="panel divide-y divide-lane px-4">
        {isLoading ? (
          <div className="space-y-2 py-4">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : due.length === 0 ? (
          <EmptyState
            title="No habits for today"
            body="Small daily habits are where streaks and consistency come from."
            action={
              <Button variant="secondary" size="sm" onClick={() => openHabit('new')}>
                Create a habit
              </Button>
            }
          />
        ) : (
          due.map((h) => (
            <div key={h.id} className="flex items-center gap-3 py-3">
              <HabitCheckButton habit={h} />
              <div className="min-w-0 flex-1">
                <p className={cn('truncate font-semibold', h.stats.doneToday && 'text-ink-soft')}>{h.name}</p>
                {risk.get(h.id) && !h.stats.doneToday ? (
                  <p className="text-[13px] text-signal">{risk.get(h.id)!.reason}</p>
                ) : (
                  <StreakBadge habit={h} />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function FocusStrip() {
  const { data: o } = useOverview();
  if (!o) return null;
  const { focusMinutes, focusGoal } = o.today;
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[var(--radius-panel)] bg-track-deep p-5 text-white dark:bg-track-soft dark:text-ink">
      <Timer className="size-6 text-volt" />
      <div className="min-w-48 flex-1">
        <p className="font-semibold">
          {focusMinutes >= focusGoal ? 'Focus goal reached' : `${focusGoal - focusMinutes} focus minutes to your goal`}
        </p>
        <LaneBar value={focusMinutes / focusGoal} className="mt-2 bg-white/15 dark:bg-surface" label="Focus goal progress" />
      </div>
      <Button asChild variant="volt">
        <Link to="/app/focus">Start a session</Link>
      </Button>
    </section>
  );
}

export default function Today() {
  const user = useSession((s) => s.user);
  const { data: o } = useOverview();
  const firstName = user?.displayName.split(' ')[0];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">{format(new Date(), 'EEEE, d MMMM')}</p>
          <h1 className="font-display text-5xl sm:text-6xl">
            {greeting()}, {firstName}
          </h1>
        </div>
        {o && o.activeStreak > 1 && (
          <p className="text-sm text-ink-soft">
            Active <span className="font-display text-2xl text-ink num">{o.activeStreak}</span> days in a row
          </p>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <ScorePanel />
        <div className="space-y-8">
          <CoachNotes />
          <FocusStrip />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <TodayTasks />
        <TodayHabits />
      </div>
    </div>
  );
}
