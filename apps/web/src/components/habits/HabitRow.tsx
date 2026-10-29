import { Check, Flame, Snowflake } from 'lucide-react';
import { toast } from 'sonner';
import { useHabitCheck } from '@/api/hooks';
import type { Habit, Weekday } from '@/api/types';
import { dayKey, lastNDays } from '@/lib/dates';
import { success, tap } from '@/lib/haptics';
import { cn, pct } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { format } from 'date-fns';

const WEEKDAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export function isScheduledOn(habit: Habit, d: Date) {
  if (habit.frequencyType !== 'SPECIFIC_DAYS') return true;
  const wd = WEEKDAYS[(d.getDay() + 6) % 7]!;
  return habit.daysOfWeek.includes(wd);
}

export function scheduleText(h: Habit) {
  if (h.frequencyType === 'DAILY') return 'Every day';
  if (h.frequencyType === 'WEEKLY_TIMES') return `${h.targetPerWeek}× a week`;
  if (h.daysOfWeek.length === 5 && !h.daysOfWeek.includes('SATURDAY') && !h.daysOfWeek.includes('SUNDAY')) return 'Weekdays';
  return h.daysOfWeek.map((d) => d.charAt(0) + d.slice(1, 3).toLowerCase()).join(', ');
}

/** The big tap target used on Today: one tap checks in for today. */
export function HabitCheckButton({ habit }: { habit: Habit }) {
  const check = useHabitCheck();
  const today = dayKey();
  const done = habit.recentCheckins.includes(today);
  return (
    <button
      type="button"
      aria-pressed={done}
      aria-label={done ? `Undo ${habit.name} for today` : `Check in ${habit.name} for today`}
      onClick={() => {
        if (!done) success();
        else tap();
        check.mutate(
          { habit, day: today, done: !done },
          { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save the check-in') },
        );
      }}
      className={cn(
        'relative grid size-11 shrink-0 place-items-center rounded-full border-2 text-xl transition-colors',
        done ? 'border-transparent' : 'border-dashed bg-surface',
      )}
      style={done ? { background: habit.color } : { borderColor: habit.color }}
    >
      {done ? <Check className="size-5 text-white animate-pop" strokeWidth={3} /> : <span aria-hidden>{habit.icon}</span>}
    </button>
  );
}

export function StreakBadge({ habit }: { habit: Habit }) {
  const s = habit.stats;
  if (s.currentStreak === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-soft num">
      <Flame className={cn('size-4', s.currentStreak >= 7 ? 'text-signal' : 'text-amber')} />
      {s.currentStreak} {s.streakUnit === 'weeks' ? 'wk' : 'd'}
    </span>
  );
}

/** Habit with a 7-day strip; tap any past day to fix a forgotten check-in. */
export function HabitRow({ habit }: { habit: Habit }) {
  const check = useHabitCheck();
  const openHabit = useUi((s) => s.openHabit);
  const days = lastNDays(7);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3.5">
      <HabitCheckButton habit={habit} />
      <button className="min-w-0 flex-1 text-left" onClick={() => openHabit(habit.id)}>
        <span className="block truncate font-semibold">{habit.name}</span>
        <span className="flex flex-wrap items-center gap-x-3 text-[13px] text-ink-soft">
          <span>{scheduleText(habit)}</span>
          <StreakBadge habit={habit} />
          <span className="num">{pct(habit.stats.completionRate30d)} in 30 days</span>
          {habit.freezeTokens > 0 && (
            <span className="inline-flex items-center gap-0.5 text-track" title="Streak freezes available">
              <Snowflake className="size-3.5" /> {habit.freezeTokens}
            </span>
          )}
        </span>
      </button>
      <div className="flex gap-1.5 max-sm:w-full max-sm:justify-between" role="group" aria-label={`${habit.name}, last 7 days`}>
        {days.map((d) => {
          const key = dayKey(d);
          const done = habit.recentCheckins.includes(key);
          const scheduled = isScheduledOn(habit, d);
          const isToday = key === dayKey();
          return (
            <button
              key={key}
              type="button"
              aria-pressed={done}
              aria-label={`${format(d, 'EEEE d MMMM')}: ${done ? 'done' : 'not done'}`}
              onClick={() => {
                tap();
                check.mutate({ habit, day: key, done: !done });
              }}
              className={cn(
                'flex h-12 w-9 flex-col items-center justify-center gap-0.5 rounded-[10px] text-[11px] font-semibold transition-colors',
                done ? 'text-white' : scheduled ? 'bg-surface-2 text-ink-soft hover:bg-lane' : 'bg-transparent text-ink-faint/60',
                isToday && !done && 'ring-1 ring-track ring-inset',
              )}
              style={done ? { background: habit.color } : undefined}
            >
              <span>{format(d, 'EEEEE')}</span>
              <span className="num">{format(d, 'd')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
