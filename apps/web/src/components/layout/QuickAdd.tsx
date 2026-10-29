import { CornerDownLeft } from 'lucide-react';
import { Dialog as RDialog } from 'radix-ui';
import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { useCreateTask, useProjects } from '@/api/hooks';
import { Chip, Kbd } from '@/components/ui/misc';
import { dueLabel } from '@/lib/dates';
import { success } from '@/lib/haptics';
import { queueTask } from '@/lib/offlineQueue';
import { parseQuickAdd } from '@/lib/quickAdd';
import { PRIORITY_LABEL } from '@/lib/utils';
import { useUi } from '@/stores/ui';

const PLACEHOLDER = 'Send invoice friday 5pm #work !high';

export function QuickAdd() {
  const open = useUi((s) => s.quickAddOpen);
  const defaults = useUi((s) => s.quickAddDefaults);
  const { closeQuickAdd, openTask } = useUi();
  const [text, setText] = useState('');
  const { data: projects } = useProjects();
  const create = useCreateTask();
  const parsed = useMemo(() => parseQuickAdd(text, projects ?? []), [text, projects]);
  const project = projects?.find((p) => p.id === parsed.projectId);
  const due = dueLabel(parsed.dueAt ?? null);

  const submit = async (e: FormEvent, keepOpen = false) => {
    e.preventDefault();
    if (!parsed.title) return;
    const { tokens: _tokens, ...task } = parsed;
    const payload = { ...defaults, ...task };
    try {
      await create.mutateAsync(payload);
      success();
      toast.success('Task added', { description: payload.title });
      setText('');
      if (!keepOpen) closeQuickAdd();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NETWORK') {
        queueTask(payload);
        toast('Saved offline', { description: "It'll sync when you're back online." });
        setText('');
        closeQuickAdd();
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not add the task');
      }
    }
  };

  return (
    <RDialog.Root open={open} onOpenChange={(o) => (o ? undefined : closeQuickAdd())}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-[#0a1230]/45 backdrop-blur-[2px]" />
        <RDialog.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-24px)] max-w-xl -translate-x-1/2 rounded-[var(--radius-panel)] border border-lane bg-surface p-2 text-ink shadow-2xl animate-rise">
          <RDialog.Title className="sr-only">Add a task</RDialog.Title>
          <RDialog.Description className="sr-only">
            Type a task in plain language. Dates, #tags, !priority, @project and "every week" are detected automatically.
          </RDialog.Description>
          <form onSubmit={(e) => void submit(e)}>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(e, true);
              }}
              placeholder={`Try: ${PLACEHOLDER}`}
              aria-label="Task"
              className="h-14 w-full rounded-[14px] bg-transparent px-4 text-[17px] outline-none placeholder:text-ink-faint"
            />
            <div className="flex min-h-10 flex-wrap items-center gap-1.5 px-3 pb-2">
              {due && <Chip tone={due.tone === 'overdue' ? 'signal' : 'track'}>{due.text}</Chip>}
              {parsed.priority && <Chip tone={parsed.priority === 'URGENT' || parsed.priority === 'HIGH' ? 'signal' : 'neutral'}>{PRIORITY_LABEL[parsed.priority]} priority</Chip>}
              {project && (
                <Chip>
                  <span className="size-2 rounded-full" style={{ background: project.color }} />
                  {project.name}
                </Chip>
              )}
              {parsed.tags?.map((t) => <Chip key={t}>#{t}</Chip>)}
              {parsed.recurrence && <Chip tone="volt">Repeats {parsed.recurrence.toLowerCase()}</Chip>}
              {parsed.estimateMinutes && <Chip>{parsed.estimateMinutes} min</Chip>}
              {!text && <span className="text-xs text-ink-faint">Dates, #tags, !priority, @project and "every week" are picked up as you type.</span>}
            </div>
            <div className="flex items-center justify-between border-t border-lane px-3 pt-2">
              <button
                type="button"
                className="text-[13px] font-semibold text-track hover:underline"
                onClick={() => {
                  const { tokens: _t, ...task } = parsed;
                  closeQuickAdd();
                  openTask('new', { ...defaults, ...task });
                }}
              >
                Open full editor
              </button>
              <div className="flex items-center gap-3 text-xs text-ink-faint">
                <span className="hidden items-center gap-1 sm:flex">
                  <Kbd>Ctrl</Kbd>
                  <Kbd>↵</Kbd> add another
                </span>
                <button
                  type="submit"
                  disabled={!parsed.title || create.isPending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] bg-track px-3.5 text-sm font-semibold text-white disabled:opacity-40 dark:text-bg"
                >
                  Add task <CornerDownLeft className="size-4" />
                </button>
              </div>
            </div>
          </form>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
