import { Archive, Trash } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useCreateHabit, useDeleteHabit, useGoals, useHabits, useUpdateHabit } from '@/api/hooks';
import type { Frequency, Habit, Weekday } from '@/api/types';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/misc';
import { cn, SWATCHES } from '@/lib/utils';
import { useUi } from '@/stores/ui';

const ICONS = ['✅', '📚', '🏋️', '🏃', '🧘', '💧', '💻', '✍️', '🎸', '🥗', '😴', '📞', '🧹', '💊', '🌿', '🎯', '☀️', '🧠'];
const DAYS: { value: Weekday; label: string }[] = [
  { value: 'MONDAY', label: 'M' },
  { value: 'TUESDAY', label: 'T' },
  { value: 'WEDNESDAY', label: 'W' },
  { value: 'THURSDAY', label: 'T' },
  { value: 'FRIDAY', label: 'F' },
  { value: 'SATURDAY', label: 'S' },
  { value: 'SUNDAY', label: 'S' },
];

export function HabitEditor() {
  const editor = useUi((s) => s.habitEditor)!;
  const close = useUi((s) => s.closeHabit);
  const { data: habits } = useHabits(true);
  const { data: goals } = useGoals();
  const create = useCreateHabit();
  const update = useUpdateHabit();
  const remove = useDeleteHabit();
  const isNew = editor.id === 'new';
  const habit: Habit | undefined = habits?.find((h) => h.id === editor.id);

  const [name, setName] = useState(habit?.name ?? '');
  const [icon, setIcon] = useState(habit?.icon ?? '✅');
  const [color, setColor] = useState(habit?.color ?? SWATCHES[6]!);
  const [frequency, setFrequency] = useState<Frequency>(habit?.frequencyType ?? 'DAILY');
  const [target, setTarget] = useState(habit?.targetPerWeek && habit.frequencyType === 'WEEKLY_TIMES' ? habit.targetPerWeek : 3);
  const [days, setDays] = useState<Weekday[]>(habit?.frequencyType === 'SPECIFIC_DAYS' ? habit.daysOfWeek : ['MONDAY', 'WEDNESDAY', 'FRIDAY']);
  const [reminder, setReminder] = useState(habit?.reminderTime?.slice(0, 5) ?? '');
  const [goalId, setGoalId] = useState(habit?.goalId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!isNew && !habit) return null;

  const save = async () => {
    if (!name.trim()) return setError('Give the habit a name');
    if (frequency === 'SPECIFIC_DAYS' && days.length === 0) return setError('Pick at least one day');
    const body = {
      name: name.trim(),
      icon,
      color,
      frequencyType: frequency,
      targetPerWeek: frequency === 'WEEKLY_TIMES' ? target : undefined,
      daysOfWeek: frequency === 'SPECIFIC_DAYS' ? days : undefined,
      reminderTime: reminder ? `${reminder}:00` : null,
      goalId: goalId || null,
    };
    try {
      if (isNew) {
        await create.mutateAsync(body);
        toast.success('Habit created', { description: 'Check it in from Today or the Habits page.' });
      } else {
        await update.mutateAsync({
          id: habit!.id,
          patch: { ...body, clearReminder: !reminder, reminderTime: reminder ? `${reminder}:00` : undefined, clearGoal: !goalId, goalId: goalId || undefined },
        });
        toast.success('Habit updated');
      }
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the habit');
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => !o && close()}
        title={isNew ? 'New habit' : 'Edit habit'}
        footer={
          <>
            {!isNew && (
              <>
                <Button variant="ghost" className="text-signal hover:text-signal" onClick={() => setConfirmDelete(true)} aria-label="Delete habit">
                  <Trash className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  className="mr-auto"
                  onClick={async () => {
                    await update.mutateAsync({ id: habit!.id, patch: { archived: !habit!.archived } });
                    toast(habit!.archived ? 'Habit restored' : 'Habit archived', { description: 'History is kept either way.' });
                    close();
                  }}
                >
                  <Archive className="size-4" /> {habit!.archived ? 'Restore' : 'Archive'}
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={create.isPending || update.isPending}>
              {isNew ? 'Create habit' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Name" error={error ?? undefined}>
            {(p) => <Input {...p} autoFocus={isNew} value={name} onChange={(e) => setName(e.target.value)} placeholder="Read 20 pages" maxLength={80} />}
          </Field>

          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-soft">Icon</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
              {ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={icon === i}
                  onClick={() => setIcon(i)}
                  className={cn('grid size-10 place-items-center rounded-[10px] text-xl', icon === i ? 'bg-track-soft ring-2 ring-track' : 'bg-surface-2 hover:bg-lane')}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-soft">Colour</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn('size-8 rounded-full ring-offset-2 ring-offset-surface', color === c && 'ring-2 ring-ink')}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-soft">How often</p>
            <Segmented
              label="Frequency"
              value={frequency}
              onChange={setFrequency}
              options={[
                { value: 'DAILY', label: 'Every day' },
                { value: 'SPECIFIC_DAYS', label: 'Some days' },
                { value: 'WEEKLY_TIMES', label: 'X times a week' },
              ]}
            />
            {frequency === 'SPECIFIC_DAYS' && (
              <div className="mt-3 flex gap-1.5" role="group" aria-label="Days of the week">
                {DAYS.map((d) => {
                  const on = days.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={on}
                      aria-label={d.value.toLowerCase()}
                      onClick={() => setDays((x) => (on ? x.filter((v) => v !== d.value) : [...x, d.value]))}
                      className={cn('grid size-10 place-items-center rounded-full text-sm font-bold', on ? 'bg-track text-white dark:text-bg' : 'bg-surface-2 text-ink-soft')}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            )}
            {frequency === 'WEEKLY_TIMES' && (
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={7}
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  className="w-48 accent-[var(--track)]"
                  aria-label="Times per week"
                />
                <span className="font-display text-2xl num">{target}×</span>
                <span className="text-sm text-ink-soft">a week, any days</span>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reminder" hint="Sent as a notification if it isn't done yet">
              {(p) => <Input {...p} type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} />}
            </Field>
            <Field label="Goal">
              {(p) => (
                <Select {...p} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                  <option value="">Not linked to a goal</option>
                  {goals?.filter((g) => g.status === 'ACTIVE' || g.id === goalId).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this habit?"
        body="All of its check-ins and streaks are deleted too. Archive it instead to keep the history."
        confirmLabel="Delete habit"
        danger
        onConfirm={() => {
          remove.mutate(habit!.id);
          close();
        }}
      />
    </>
  );
}
