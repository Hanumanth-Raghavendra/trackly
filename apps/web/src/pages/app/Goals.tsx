import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Check, ChevronDown, Ellipsis, Goal as GoalIcon, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useDeleteGoal, useGoals, useHabits, useProjects, useSaveGoal, useTasks } from '@/api/hooks';
import type { Goal } from '@/api/types';
import { TaskRow } from '@/components/tasks/TaskRow';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { Chip, EmptyState, LaneBar, Skeleton } from '@/components/ui/misc';
import { cn, SWATCHES } from '@/lib/utils';
import { useUi } from '@/stores/ui';

function GoalEditor({ goal, open, onOpenChange }: { goal?: Goal; open: boolean; onOpenChange: (v: boolean) => void }) {
  const save = useSaveGoal();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [color, setColor] = useState(goal?.color ?? SWATCHES[4]!);
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? 'Edit goal' : 'New goal'}
      description="Link tasks and habits to it from their editors; progress updates as you work."
      footer={
        <Button
          loading={save.isPending}
          disabled={!title.trim()}
          onClick={async () => {
            await save.mutateAsync({
              id: goal?.id,
              body: { title: title.trim(), description, color, targetDate: targetDate || undefined, clearTargetDate: goal && !targetDate ? true : undefined },
            });
            toast.success(goal ? 'Goal updated' : 'Goal created');
            onOpenChange(false);
          }}
        >
          {goal ? 'Save changes' : 'Create goal'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Goal">{(p) => <Input {...p} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Run a 10K" maxLength={120} />}</Field>
        <Field label="Why it matters" hint="Optional, but it helps on low-motivation days">
          {(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} className="min-h-20" />}
        </Field>
        <Field label="Target date">{(p) => <Input {...p} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />}</Field>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
          {SWATCHES.map((c) => (
            <button
              key={c}
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
    </Dialog>
  );
}

function GoalItem({ goal }: { goal: Goal }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const save = useSaveGoal();
  const remove = useDeleteGoal();
  const { data: tasks } = useTasks();
  const { data: habits } = useHabits();
  const { data: projects } = useProjects();
  const openTask = useUi((s) => s.openTask);
  const projectMap = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const linkedTasks = (tasks ?? []).filter((t) => t.goalId === goal.id && !t.parentId);
  const openLinked = linkedTasks.filter((t) => t.status !== 'DONE');
  const linkedHabits = (habits ?? []).filter((h) => h.goalId === goal.id);
  const daysLeft = goal.targetDate ? differenceInCalendarDays(parseISO(goal.targetDate), new Date()) : null;
  const done = goal.status === 'COMPLETED';

  return (
    <li className="panel overflow-hidden">
      <div className="flex items-start gap-4 p-5">
        <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: goal.color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={cn('text-lg font-bold', done && 'text-ink-soft')}>{goal.title}</h2>
            {done && <Chip tone="volt">Achieved</Chip>}
            {goal.status === 'ARCHIVED' && <Chip>Archived</Chip>}
          </div>
          {goal.description && <p className="mt-0.5 text-sm text-ink-soft">{goal.description}</p>}
          <div className="mt-3 flex items-center gap-3">
            <LaneBar value={goal.progress.percent / 100} color={goal.color} label={`${goal.title} progress`} />
            <span className="font-display text-2xl num">{goal.progress.percent}%</span>
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 text-[13px] text-ink-soft">
            <span className="num">
              {goal.progress.tasksDone}/{goal.progress.tasksTotal} tasks
            </span>
            {goal.progress.habitCount > 0 && (
              <span className="num">
                {goal.progress.habitCount} habit{goal.progress.habitCount === 1 ? '' : 's'} at {Math.round(goal.progress.habitConsistency * 100)}%
              </span>
            )}
            {goal.targetDate && !done && (
              <span className={cn(daysLeft != null && daysLeft < 0 && 'text-signal')}>
                {daysLeft != null && daysLeft >= 0 ? `${daysLeft} days left` : 'Past target date'} ({format(parseISO(goal.targetDate), 'd MMM yyyy')})
              </span>
            )}
          </p>
        </div>
        <Menu>
          <MenuTrigger className="rounded-lg p-2 text-ink-faint hover:bg-surface-2" aria-label={`Actions for ${goal.title}`}>
            <Ellipsis className="size-5" />
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => setEditing(true)}>Edit</MenuItem>
            {!done && (
              <MenuItem
                icon={<Check />}
                onSelect={async () => {
                  await save.mutateAsync({ id: goal.id, body: { status: 'COMPLETED' } });
                  toast.success('Goal achieved', { description: '+50 XP' });
                }}
              >
                Mark as achieved
              </MenuItem>
            )}
            {goal.status !== 'ACTIVE' && <MenuItem onSelect={() => save.mutate({ id: goal.id, body: { status: 'ACTIVE' } })}>Make active again</MenuItem>}
            {goal.status === 'ACTIVE' && <MenuItem onSelect={() => save.mutate({ id: goal.id, body: { status: 'ARCHIVED' } })}>Archive</MenuItem>}
            <MenuItem danger onSelect={() => setConfirm(true)}>
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-t border-lane px-5 py-2.5 text-left text-sm font-semibold text-ink-soft hover:bg-surface-2"
      >
        <ChevronDown className={cn('size-4 transition-transform', !open && '-rotate-90')} />
        {openLinked.length} open task{openLinked.length === 1 ? '' : 's'}
        {linkedHabits.length > 0 && `, ${linkedHabits.length} habit${linkedHabits.length === 1 ? '' : 's'}`}
      </button>
      {open && (
        <div className="border-t border-lane p-2">
          {openLinked.map((t) => (
            <TaskRow key={t.id} task={t} projects={projectMap} />
          ))}
          {linkedHabits.map((h) => (
            <p key={h.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span aria-hidden>{h.icon}</span> {h.name}
              <span className="text-ink-faint num">{Math.round(h.stats.completionRate30d * 100)}% in 30 days</span>
            </p>
          ))}
          <Button variant="ghost" size="sm" className="mt-1" onClick={() => openTask('new', { goalId: goal.id })}>
            <Plus className="size-4" /> Add a task to this goal
          </Button>
        </div>
      )}
      {editing && <GoalEditor goal={goal} open={editing} onOpenChange={setEditing} />}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this goal?"
        body="Linked tasks and habits stay; they just won't be linked to a goal anymore."
        confirmLabel="Delete goal"
        danger
        onConfirm={() => remove.mutate(goal.id)}
      />
    </li>
  );
}

export default function Goals() {
  const { data: goals, isLoading } = useGoals();
  const [creating, setCreating] = useState(false);
  const active = (goals ?? []).filter((g) => g.status === 'ACTIVE');
  const other = (goals ?? []).filter((g) => g.status !== 'ACTIVE');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl sm:text-6xl">Goals</h1>
          <p className="text-sm text-ink-soft">Progress blends linked tasks (70%) and habit consistency (30%).</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" /> New goal
        </Button>
      </header>
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !goals?.length ? (
        <div className="panel">
          <EmptyState
            icon={<GoalIcon className="size-8" />}
            title="What are you working towards?"
            body="A goal ties tasks and habits together so you can see the bigger picture move."
            action={<Button onClick={() => setCreating(true)}>Create a goal</Button>}
          />
        </div>
      ) : (
        <>
          <ul className="space-y-4">
            {active.map((g) => (
              <GoalItem key={g.id} goal={g} />
            ))}
          </ul>
          {other.length > 0 && (
            <>
              <h2 className="pt-4 text-sm font-bold text-ink-soft">Achieved and archived</h2>
              <ul className="space-y-4">
                {other.map((g) => (
                  <GoalItem key={g.id} goal={g} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {creating && <GoalEditor open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
