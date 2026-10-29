import { addDays } from 'date-fns';
import { Plus, Repeat } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useCheckins, useHabitInsights, useHabits } from '@/api/hooks';
import { CalendarHeatmap } from '@/components/charts/CalendarHeatmap';
import { HabitRow } from '@/components/habits/HabitRow';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton, Switch } from '@/components/ui/misc';
import { dayKey, mondayOf } from '@/lib/dates';
import { syncHabitReminders } from '@/lib/native';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';

const WEEKS = 16;
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function WeekdayPattern() {
  const { data } = useHabitInsights(90);
  const rows = (data ?? []).filter((h) => h.weekdayMissRate.some((v) => v !== null));
  if (rows.length === 0) return null;
  return (
    <section className="panel p-5" aria-labelledby="pattern-heading">
      <h2 id="pattern-heading" className="font-bold">
        Where habits slip
      </h2>
      <p className="mt-0.5 text-sm text-ink-soft">How often each scheduled day was missed over the last 8 weeks.</p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr>
            <th className="sr-only">Habit</th>
            {DAY_LETTERS.map((d, i) => (
              <th key={i} className="w-9 pb-2 text-center text-xs font-semibold text-ink-faint">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.habitId}>
              <th scope="row" className="max-w-0 truncate py-1 pr-3 text-left font-medium">
                <span aria-hidden className="mr-1.5">
                  {h.icon}
                </span>
                {h.name}
              </th>
              {h.weekdayMissRate.map((rate, i) => (
                <td key={i} className="p-0.5">
                  <span
                    title={rate == null ? 'Not scheduled' : `Missed ${Math.round(rate * 100)}%`}
                    className={cn('grid h-8 place-items-center rounded-md text-[11px] font-semibold num', rate == null ? 'text-ink-faint' : rate >= 0.5 ? 'text-white' : 'text-ink')}
                    style={{
                      background:
                        rate == null ? 'transparent' : rate >= 0.5 ? 'var(--signal)' : `color-mix(in srgb, var(--signal) ${Math.round(rate * 90)}%, var(--surface-2))`,
                    }}
                  >
                    {rate == null ? '·' : `${Math.round(rate * 100)}`}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function Habits() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: habits, isLoading } = useHabits(showArchived);
  const openHabit = useUi((s) => s.openHabit);
  const from = dayKey(addDays(mondayOf(), -7 * (WEEKS - 1)));
  const { data: checkins } = useCheckins(from, dayKey());

  useEffect(() => {
    if (habits) void syncHabitReminders(habits);
  }, [habits]);

  const active = (habits ?? []).filter((h) => !h.archived);
  const archived = (habits ?? []).filter((h) => h.archived);

  const heat = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of checkins ?? []) if (!c.freeze) counts.set(c.day, (counts.get(c.day) ?? 0) + 1);
    const total = Math.max(1, active.length);
    return new Map([...counts].map(([k, v]) => [k, Math.min(1, v / total)]));
  }, [checkins, active.length]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl sm:text-6xl">Habits</h1>
          <p className="text-sm text-ink-soft">Tap a day to check in or fix a missed one.</p>
        </div>
        <Button onClick={() => openHabit('new')}>
          <Plus className="size-4" /> New habit
        </Button>
      </header>

      <section className="panel px-4 sm:px-5" aria-label="Your habits">
        {isLoading ? (
          <div className="space-y-3 py-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <EmptyState
            icon={<Repeat className="size-8" />}
            title="Start with one small habit"
            body="Something you can do in two minutes on a bad day. Streaks, reminders and patterns follow from there."
            action={<Button onClick={() => openHabit('new')}>Create a habit</Button>}
          />
        ) : (
          <div className="divide-y divide-lane">
            {active.map((h) => (
              <HabitRow key={h.id} habit={h} />
            ))}
          </div>
        )}
      </section>

      {active.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="panel p-5" aria-labelledby="heat-heading">
            <h2 id="heat-heading" className="font-bold">
              Consistency map
            </h2>
            <p className="mt-0.5 mb-4 text-sm text-ink-soft">Each square is a day; the stronger the blue, the more habits you kept.</p>
            <CalendarHeatmap weeks={WEEKS} values={heat} label={`Habit check-ins over the last ${WEEKS} weeks`} />
          </section>
          <WeekdayPattern />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Switch checked={showArchived} onCheckedChange={setShowArchived} label="Show archived habits" />
        <span className="text-sm text-ink-soft">Show archived habits</span>
      </div>
      {showArchived && archived.length > 0 && (
        <section className="panel px-4 opacity-80" aria-label="Archived habits">
          <div className="divide-y divide-lane">
            {archived.map((h) => (
              <HabitRow key={h.id} habit={h} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
