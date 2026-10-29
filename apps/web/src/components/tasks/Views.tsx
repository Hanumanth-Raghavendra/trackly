import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { Project, Task } from '@/api/types';
import { Button } from '@/components/ui/button';
import { mondayOf } from '@/lib/dates';
import { cn, PRIORITY_ORDER } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { TaskRow } from './TaskRow';

interface ViewProps {
  tasks: Task[];
  projects: Map<string, Project>;
  subtasksOf: Map<string, Task[]>;
}

function Group({ title, count, children, defaultOpen = true, tone }: { title: string; count: number; children: ReactNode; defaultOpen?: boolean; tone?: 'signal' }) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <section>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 py-2 text-left">
        <ChevronDown className={cn('size-4 text-ink-faint transition-transform', !open && '-rotate-90')} />
        <h3 className={cn('text-sm font-bold', tone === 'signal' && 'text-signal')}>{title}</h3>
        <span className="text-sm text-ink-faint num">{count}</span>
      </button>
      {open && <div className="panel divide-y divide-lane p-1.5">{children}</div>}
    </section>
  );
}

/** List grouped by when things are due — the view most people live in. */
export function ListView({ tasks, projects, subtasksOf }: ViewProps) {
  const groups = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    const week = addDays(today, 7);
    const open = tasks.filter((t) => t.status !== 'DONE');
    const byDue = (a: Task, b: Task) => (a.dueAt ?? '').localeCompare(b.dueAt ?? '') || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    const due = (t: Task) => (t.dueAt ? parseISO(t.dueAt) : null);
    return {
      overdue: open.filter((t) => due(t) && due(t)! < today).sort(byDue),
      today: open.filter((t) => due(t) && due(t)! >= today && due(t)! < tomorrow).sort(byDue),
      week: open.filter((t) => due(t) && due(t)! >= tomorrow && due(t)! < week).sort(byDue),
      later: open.filter((t) => due(t) && due(t)! >= week).sort(byDue),
      someday: open.filter((t) => !t.dueAt).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.position - b.position),
      done: tasks.filter((t) => t.status === 'DONE').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, 30),
    };
  }, [tasks]);

  const rows = (list: Task[]) => list.map((t) => <TaskRow key={t.id} task={t} subtasks={subtasksOf.get(t.id)} projects={projects} className="rounded-[10px]" />);

  return (
    <div className="space-y-3">
      <Group title="Overdue" count={groups.overdue.length} tone="signal">{rows(groups.overdue)}</Group>
      <Group title="Today" count={groups.today.length}>{rows(groups.today)}</Group>
      <Group title="Next 7 days" count={groups.week.length}>{rows(groups.week)}</Group>
      <Group title="Later" count={groups.later.length}>{rows(groups.later)}</Group>
      <Group title="No date" count={groups.someday.length}>{rows(groups.someday)}</Group>
      <Group title="Recently completed" count={groups.done.length} defaultOpen={false}>{rows(groups.done)}</Group>
    </div>
  );
}

/** Month calendar of due dates. Click an empty spot to add a task on that day. */
export function CalendarView({ tasks }: ViewProps) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const { openTask, openQuickAdd } = useUi();
  const start = mondayOf(month);
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueAt) continue;
      const key = format(parseISO(t.dueAt), 'yyyy-MM-dd');
      m.set(key, [...(m.get(key) ?? []), t]);
    }
    return m;
  }, [tasks]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-lane px-4 py-3">
        <h3 className="font-display text-3xl">{format(month, 'MMMM yyyy')}</h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft className="size-5" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-lane text-center text-xs font-semibold text-ink-faint">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-2">
            <span className="max-sm:hidden">{d}</span>
            <span className="sm:hidden">{d[0]}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const list = (byDay.get(key) ?? []).sort((a, b) => Number(a.status === 'DONE') - Number(b.status === 'DONE'));
          return (
            <div
              key={key}
              className={cn('min-h-20 border-r border-b border-lane p-1 text-left sm:min-h-28 [&:nth-child(7n)]:border-r-0', !isSameMonth(d, month) && 'bg-surface-2/50')}
            >
              <button
                onClick={() => openQuickAdd({ dueAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18).toISOString() })}
                aria-label={`Add a task on ${format(d, 'd MMMM')}`}
                className={cn(
                  'mb-1 grid size-7 place-items-center rounded-full text-xs font-semibold num hover:bg-surface-2',
                  isToday(d) ? 'bg-track text-white dark:text-bg' : isSameMonth(d, month) ? 'text-ink' : 'text-ink-faint',
                )}
              >
                {format(d, 'd')}
              </button>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTask(t.id)}
                    className={cn(
                      'block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] sm:text-xs',
                      t.status === 'DONE' ? 'text-ink-faint line-through' : t.priority === 'URGENT' ? 'bg-signal-soft text-signal' : 'bg-track-soft text-track-deep',
                    )}
                  >
                    {t.title}
                  </button>
                ))}
                {list.length > 3 && <p className="px-1.5 text-[11px] text-ink-faint">+{list.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Eisenhower matrix. Urgent = due within 48 hours (or overdue) or marked urgent.
 * Important = high/urgent priority, or linked to a goal.
 */
export function MatrixView({ tasks, projects, subtasksOf }: ViewProps) {
  const quadrants = useMemo(() => {
    const soon = new Date().getTime() + 48 * 3600_000;
    const open = tasks.filter((t) => t.status !== 'DONE');
    const urgent = (t: Task) => t.priority === 'URGENT' || (!!t.dueAt && parseISO(t.dueAt).getTime() <= soon);
    const important = (t: Task) => t.priority === 'HIGH' || t.priority === 'URGENT' || !!t.goalId;
    return [
      { title: 'Do first', hint: 'Urgent and important', tone: 'border-signal', list: open.filter((t) => urgent(t) && important(t)) },
      { title: 'Schedule', hint: 'Important, not urgent', tone: 'border-track', list: open.filter((t) => !urgent(t) && important(t)) },
      { title: 'Quick wins', hint: 'Urgent, less important', tone: 'border-amber', list: open.filter((t) => urgent(t) && !important(t)) },
      { title: 'Later', hint: 'Neither — or drop it', tone: 'border-lane-strong', list: open.filter((t) => !urgent(t) && !important(t)) },
    ];
  }, [tasks]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {quadrants.map((q) => (
        <section key={q.title} className={cn('panel border-t-4 p-2', q.tone)}>
          <div className="flex items-baseline justify-between px-2 pt-1 pb-2">
            <h3 className="font-bold">
              {q.title} <span className="font-normal text-ink-faint num">{q.list.length}</span>
            </h3>
            <span className="text-xs text-ink-faint">{q.hint}</span>
          </div>
          <div className="scrollbar-thin max-h-80 overflow-y-auto">
            {q.list.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-ink-faint">Nothing here.</p>
            ) : (
              q.list.slice(0, 50).map((t) => <TaskRow key={t.id} task={t} subtasks={subtasksOf.get(t.id)} projects={projects} />)
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export { isSameDay };
