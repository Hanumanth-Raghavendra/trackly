import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useUpdateTask } from '@/api/hooks';
import type { Project, Task, TaskStatus } from '@/api/types';
import { cn } from '@/lib/utils';
import { TaskRow } from './TaskRow';

const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: 'TODO', title: 'To do' },
  { status: 'IN_PROGRESS', title: 'In progress' },
  { status: 'DONE', title: 'Done' },
];

function SortableCard({ task, subtasks, projects }: { task: Task; subtasks: Task[]; projects: Map<string, Project> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { task } });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative rounded-[var(--radius-row)] border border-lane bg-surface', isDragging && 'opacity-40')}
    >
      <TaskRow task={task} subtasks={subtasks} projects={projects} className="pr-8" />
      <button
        {...attributes}
        {...listeners}
        aria-label={`Move ${task.title}`}
        className="absolute top-2.5 right-1.5 cursor-grab touch-none rounded p-1 text-ink-faint opacity-60 hover:bg-surface-2 hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
    </div>
  );
}

function Column({
  status,
  title,
  tasks,
  subtasksOf,
  projects,
}: {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  subtasksOf: Map<string, Task[]>;
  projects: Map<string, Project>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}`, data: { status } });
  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      className={cn(
        'flex min-h-40 w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-[var(--radius-panel)] bg-surface-2/70 p-2 md:w-auto md:max-w-none',
        isOver && 'ring-2 ring-track ring-inset',
      )}
    >
      <h3 className="flex items-center justify-between px-2 pt-1 pb-2 text-sm font-bold">
        {title} <span className="font-normal text-ink-faint num">{tasks.length}</span>
      </h3>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2">
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} subtasks={subtasksOf.get(t.id) ?? []} projects={projects} />
          ))}
          {tasks.length === 0 && <p className="px-2 py-6 text-center text-sm text-ink-faint">Drop tasks here</p>}
        </div>
      </SortableContext>
    </section>
  );
}

/** Kanban board. Positions are floats, so a move writes one row (midpoint between neighbours). */
export function Board({ tasks, projects, subtasksOf }: { tasks: Task[]; projects: Map<string, Project>; subtasksOf: Map<string, Task[]> }) {
  const update = useUpdateTask();
  const [active, setActive] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = useMemo(() => {
    const byStatus = new Map<TaskStatus, Task[]>(COLUMNS.map((c) => [c.status, []]));
    for (const t of tasks) byStatus.get(t.status)?.push(t);
    byStatus.get('TODO')!.sort((a, b) => a.position - b.position);
    byStatus.get('IN_PROGRESS')!.sort((a, b) => a.position - b.position);
    // Done: most recent first, last 20 only.
    byStatus.set(
      'DONE',
      byStatus.get('DONE')!.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, 20),
    );
    return byStatus;
  }, [tasks]);

  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current?.task as Task) ?? null);

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const task = e.active.data.current?.task as Task | undefined;
    if (!task || !e.over) return;
    const overTask = e.over.data.current?.task as Task | undefined;
    const target: TaskStatus = overTask ? overTask.status : (e.over.data.current?.status as TaskStatus);
    if (!target) return;

    const list = (columns.get(target) ?? []).filter((t) => t.id !== task.id);
    let index = overTask ? list.findIndex((t) => t.id === overTask.id) : list.length;
    if (index < 0) index = list.length;
    // Moving down within the same column lands after the hovered card.
    if (overTask && task.status === target) {
      const oldIdx = (columns.get(target) ?? []).findIndex((t) => t.id === task.id);
      const newIdx = (columns.get(target) ?? []).findIndex((t) => t.id === overTask.id);
      if (oldIdx < newIdx) index += 1;
    }
    const before = list[index - 1]?.position;
    const after = list[index]?.position;
    const position = before == null && after == null ? 1000 : before == null ? after! - 1000 : after == null ? before + 1000 : (before + after) / 2;

    if (task.status === target && task.position === position) return;
    update.mutate(
      { id: task.id, patch: { status: target, position } },
      { onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not move the task') },
    );
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {COLUMNS.map((c) => (
          <Column key={c.status} status={c.status} title={c.title} tasks={columns.get(c.status)!} subtasksOf={subtasksOf} projects={projects} />
        ))}
      </div>
      <DragOverlay>
        {active && (
          <div className="rotate-1 rounded-[var(--radius-row)] border border-track bg-surface shadow-xl">
            <TaskRow task={active} projects={projects} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
