import { Check, Flag, ListChecks, Repeat } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useToggleTask } from '@/api/hooks';
import type { Project, Task } from '@/api/types';
import { Chip } from '@/components/ui/misc';
import { dueLabel } from '@/lib/dates';
import { success, tap } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';

export function TaskCheckbox({ task, className }: { task: Task; className?: string }) {
  const { toggle } = useToggleTask();
  const [popped, setPopped] = useState(false);
  const done = task.status === 'DONE';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`}
      onClick={async (e) => {
        e.stopPropagation();
        if (!done) {
          setPopped(true);
          success();
        } else tap();
        try {
          const res = await toggle(task);
          if (res.nextOccurrence) toast('Next one scheduled', { description: dueLabel(res.nextOccurrence.dueAt)?.text });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not update the task');
        }
      }}
      onAnimationEnd={() => setPopped(false)}
      className={cn(
        'grid size-[22px] shrink-0 place-items-center rounded-full border-2 transition-colors',
        done ? 'border-volt bg-volt text-[#101b45]' : 'border-lane-strong hover:border-track',
        task.priority === 'URGENT' && !done && 'border-signal',
        popped && 'animate-pop',
        className,
      )}
    >
      {done && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}

export function TaskRow({
  task,
  subtasks = [],
  projects,
  showProject = true,
  className,
}: {
  task: Task;
  subtasks?: Task[];
  projects?: Map<string, Project>;
  showProject?: boolean;
  className?: string;
}) {
  const openTask = useUi((s) => s.openTask);
  const done = task.status === 'DONE';
  const due = done ? null : dueLabel(task.dueAt);
  const project = task.projectId ? projects?.get(task.projectId) : undefined;
  const subDone = subtasks.filter((s) => s.status === 'DONE').length;

  return (
    <div
      className={cn(
        'group flex items-start gap-3 rounded-[var(--radius-row)] px-3 py-2.5 transition-colors hover:bg-surface-2',
        className,
      )}
    >
      <TaskCheckbox task={task} className="mt-0.5" />
      <button className="min-w-0 flex-1 text-left" onClick={() => openTask(task.id)}>
        <span className={cn('block text-[15px] leading-snug', done && 'text-ink-faint line-through decoration-ink-faint/60')}>
          {task.title}
        </span>
        {(due || project || task.tags.length > 0 || subtasks.length > 0 || task.recurrence || task.status === 'IN_PROGRESS' ||
          task.priority === 'HIGH' || task.priority === 'URGENT') && !done && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {task.status === 'IN_PROGRESS' && <Chip tone="track">In progress</Chip>}
            {due && <Chip tone={due.tone === 'overdue' ? 'signal' : due.tone === 'today' ? 'amber' : 'neutral'}>{due.text}</Chip>}
            {(task.priority === 'URGENT' || task.priority === 'HIGH') && (
              <Chip tone={task.priority === 'URGENT' ? 'signal' : 'neutral'}>
                <Flag className="size-3" /> {task.priority === 'URGENT' ? 'Urgent' : 'High'}
              </Chip>
            )}
            {subtasks.length > 0 && (
              <Chip>
                <ListChecks className="size-3" /> {subDone}/{subtasks.length}
              </Chip>
            )}
            {task.recurrence && (
              <Chip>
                <Repeat className="size-3" /> {task.recurrence.toLowerCase()}
              </Chip>
            )}
            {showProject && project && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
                <span className="size-2 rounded-full" style={{ background: project.color }} />
                {project.name}
              </span>
            )}
            {task.tags.slice(0, 3).map((t) => (
              <span key={t} className="text-xs text-ink-faint">
                #{t}
              </span>
            ))}
          </span>
        )}
      </button>
    </div>
  );
}
