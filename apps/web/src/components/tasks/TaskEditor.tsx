import { format, parseISO } from 'date-fns';
import { Plus, Sparkles, Trash } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  useAiBreakdown,
  useCreateTask,
  useDeleteTask,
  useGoals,
  useInsightsConfig,
  useProjects,
  useTasks,
  useUpdateTask,
} from '@/api/hooks';
import type { NewTask, Priority, Recurrence, Task, TaskStatus } from '@/api/types';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Segmented } from '@/components/ui/misc';
import { useUi } from '@/stores/ui';
import { TaskCheckbox } from './TaskRow';

const toLocalInput = (iso: string | null | undefined) => (iso ? format(parseISO(iso), "yyyy-MM-dd'T'HH:mm") : '');
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

interface Draft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueAt: string;
  estimateMinutes: string;
  recurrence: Recurrence | '';
  projectId: string;
  goalId: string;
  tags: string;
}

function toDraft(t: Partial<Task & NewTask>): Draft {
  return {
    title: t.title ?? '',
    description: t.description ?? '',
    status: t.status ?? 'TODO',
    priority: t.priority ?? 'MEDIUM',
    dueAt: toLocalInput(t.dueAt),
    estimateMinutes: t.estimateMinutes ? String(t.estimateMinutes) : '',
    recurrence: t.recurrence ?? '',
    projectId: t.projectId ?? '',
    goalId: t.goalId ?? '',
    tags: (t.tags ?? []).join(', '),
  };
}

export function TaskEditor() {
  const editor = useUi((s) => s.taskEditor)!;
  const close = useUi((s) => s.closeTask);
  const { data: tasks } = useTasks();
  const { data: projects } = useProjects();
  const { data: goals } = useGoals();
  const { data: config } = useInsightsConfig();
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const breakdown = useAiBreakdown();

  const isNew = editor.id === 'new';
  const task = isNew ? undefined : tasks?.find((t) => t.id === editor.id);
  const subtasks = useMemo(
    () => (task ? (tasks ?? []).filter((t) => t.parentId === task.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []),
    [tasks, task],
  );
  const [draft, setDraft] = useState<Draft>(() => toDraft(task ?? editor.defaults ?? {}));
  const [newSub, setNewSub] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isNew && !task) return null;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const payload = () => ({
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    priority: draft.priority,
    dueAt: fromLocalInput(draft.dueAt),
    estimateMinutes: draft.estimateMinutes ? Number(draft.estimateMinutes) : null,
    recurrence: draft.recurrence || null,
    projectId: draft.projectId || null,
    goalId: draft.goalId || null,
    tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
  });

  const save = async () => {
    if (!draft.title.trim()) {
      setError('Give the task a title');
      return;
    }
    try {
      if (isNew) {
        await create.mutateAsync({ ...payload(), status: draft.status, parentId: editor.defaults?.parentId ?? null });
        toast.success('Task added');
      } else {
        await update.mutateAsync({ id: task!.id, patch: { ...payload(), status: draft.status } as Partial<Task> });
        toast.success('Changes saved');
      }
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  const addSubtask = async (title: string) => {
    if (!task || !title.trim()) return;
    await create.mutateAsync({ title: title.trim(), parentId: task.id, projectId: task.projectId, goalId: task.goalId });
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => !o && close()}
        title={isNew ? 'New task' : 'Edit task'}
        wide
        footer={
          <>
            {!isNew && (
              <Button variant="ghost" className="mr-auto text-signal hover:text-signal" onClick={() => setConfirmDelete(true)}>
                <Trash className="size-4" /> Delete
              </Button>
            )}
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={create.isPending || update.isPending}>
              {isNew ? 'Add task' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" error={error ?? undefined}>
            {(p) => (
              <Input {...p} autoFocus={isNew} value={draft.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />
            )}
          </Field>

          <div className="flex flex-wrap gap-4">
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-ink-soft">Status</p>
              <Segmented
                label="Status"
                value={draft.status}
                onChange={(v) => set('status', v)}
                options={[
                  { value: 'TODO', label: 'To do' },
                  { value: 'IN_PROGRESS', label: 'Doing' },
                  { value: 'DONE', label: 'Done' },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-ink-soft">Priority</p>
              <Segmented
                label="Priority"
                value={draft.priority}
                onChange={(v) => set('priority', v)}
                options={[
                  { value: 'LOW', label: 'Low' },
                  { value: 'MEDIUM', label: 'Medium' },
                  { value: 'HIGH', label: 'High' },
                  { value: 'URGENT', label: 'Urgent' },
                ]}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Due">
              {(p) => <Input {...p} type="datetime-local" value={draft.dueAt} onChange={(e) => set('dueAt', e.target.value)} />}
            </Field>
            <Field label="Repeats" hint={draft.recurrence && !draft.dueAt ? 'Set a due date so the next one can be scheduled' : undefined}>
              {(p) => (
                <Select {...p} value={draft.recurrence} onChange={(e) => set('recurrence', e.target.value as Recurrence | '')}>
                  <option value="">Doesn't repeat</option>
                  <option value="DAILY">Every day</option>
                  <option value="WEEKDAYS">Every weekday</option>
                  <option value="WEEKLY">Every week</option>
                  <option value="MONTHLY">Every month</option>
                </Select>
              )}
            </Field>
            <Field label="Project">
              {(p) => (
                <Select {...p} value={draft.projectId} onChange={(e) => set('projectId', e.target.value)}>
                  <option value="">No project</option>
                  {projects?.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Goal">
              {(p) => (
                <Select {...p} value={draft.goalId} onChange={(e) => set('goalId', e.target.value)}>
                  <option value="">Not linked to a goal</option>
                  {goals?.filter((g) => g.status === 'ACTIVE' || g.id === draft.goalId).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Estimate (minutes)">
              {(p) => (
                <Input {...p} type="number" min={1} max={1440} inputMode="numeric" value={draft.estimateMinutes} onChange={(e) => set('estimateMinutes', e.target.value)} />
              )}
            </Field>
            <Field label="Tags" hint="Separate with commas">
              {(p) => <Input {...p} value={draft.tags} onChange={(e) => set('tags', e.target.value)} placeholder="work, java" />}
            </Field>
          </div>

          <Field label="Notes">
            {(p) => <Textarea {...p} value={draft.description} onChange={(e) => set('description', e.target.value)} maxLength={5000} />}
          </Field>

          {!isNew && !task!.parentId && (
            <section className="lane-t pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold">Subtasks</h3>
                {config?.ai.enabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={breakdown.isPending}
                    onClick={async () => {
                      try {
                        const res = await breakdown.mutateAsync({ title: draft.title, description: draft.description || undefined });
                        setSuggestions(res.subtasks);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'AI is unavailable right now');
                      }
                    }}
                  >
                    <Sparkles className="size-4 text-track" /> Break it down
                  </Button>
                )}
              </div>
              <ul className="space-y-0.5">
                {subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-[10px] px-2 py-1.5 hover:bg-surface-2">
                    <TaskCheckbox task={s} />
                    <span className={s.status === 'DONE' ? 'text-ink-faint line-through' : ''}>{s.title}</span>
                    <button
                      className="ml-auto rounded p-1 text-ink-faint opacity-0 group-hover:opacity-100 hover:text-signal focus:opacity-100 [li:hover_&]:opacity-100"
                      aria-label={`Delete subtask ${s.title}`}
                      onClick={() => remove.mutate(s.id)}
                    >
                      <Trash className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              {suggestions.length > 0 && (
                <div className="mt-2 rounded-[var(--radius-row)] border border-dashed border-track/50 bg-track-soft/50 p-3">
                  <p className="mb-2 text-xs font-semibold text-ink-soft">Suggested steps</p>
                  <ul className="space-y-1 text-sm">
                    {suggestions.map((s) => (
                      <li key={s} className="flex items-center gap-2">
                        <span className="flex-1">{s}</span>
                        <button className="text-xs font-semibold text-track" onClick={() => void addSubtask(s).then(() => setSuggestions((x) => x.filter((y) => y !== s)))}>
                          Add
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={async () => {
                      for (const s of suggestions) await addSubtask(s);
                      setSuggestions([]);
                    }}
                  >
                    Add all {suggestions.length}
                  </Button>
                </div>
              )}
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addSubtask(newSub).then(() => setNewSub(''));
                }}
              >
                <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Add a subtask" aria-label="New subtask" />
                <Button type="submit" variant="secondary" size="icon" aria-label="Add subtask" disabled={!newSub.trim()}>
                  <Plus className="size-4" />
                </Button>
              </form>
            </section>
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this task?"
        body={subtasks.length ? `Its ${subtasks.length} subtasks will be deleted too.` : 'This can’t be undone.'}
        confirmLabel="Delete task"
        danger
        onConfirm={() => {
          remove.mutate(task!.id);
          close();
          toast('Task deleted');
        }}
      />
    </>
  );
}
