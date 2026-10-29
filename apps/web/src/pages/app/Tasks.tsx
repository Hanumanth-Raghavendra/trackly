import { CalendarDays, Grid2x2, List, Plus, SquareKanban } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useCreateProject, useProjects, useTasks } from '@/api/hooks';
import type { Task } from '@/api/types';
import { Board } from '@/components/tasks/Board';
import { CalendarView, ListView, MatrixView } from '@/components/tasks/Views';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, Segmented, Skeleton } from '@/components/ui/misc';
import { cn, SWATCHES } from '@/lib/utils';
import { useUi } from '@/stores/ui';

type View = 'list' | 'board' | 'calendar' | 'matrix';

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateProject();
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]!);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New project"
      footer={
        <Button
          loading={create.isPending}
          disabled={!name.trim()}
          onClick={async () => {
            await create.mutateAsync({ name: name.trim(), color });
            setName('');
            onOpenChange(false);
          }}
        >
          Create project
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Name">{(p) => <Input {...p} autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}</Field>
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

export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'list';
  const projectFilter = params.get('project') ?? '';
  const [query, setQuery] = useState('');
  const [newProject, setNewProject] = useState(false);
  const { data: tasks, isLoading } = useTasks();
  const { data: projects } = useProjects();
  const openQuickAdd = useUi((s) => s.openQuickAdd);

  const projectMap = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const { visible, subtasksOf } = useMemo(() => {
    const subs = new Map<string, Task[]>();
    for (const t of tasks ?? []) if (t.parentId) subs.set(t.parentId, [...(subs.get(t.parentId) ?? []), t]);
    const q = query.trim().toLowerCase();
    const visible = (tasks ?? []).filter(
      (t) =>
        !t.parentId &&
        (!projectFilter || t.projectId === projectFilter) &&
        (!q || t.title.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q.replace(/^#/, '')))),
    );
    return { visible, subtasksOf: subs };
  }, [tasks, query, projectFilter]);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const openCount = visible.filter((t) => t.status !== 'DONE').length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl sm:text-6xl">Tasks</h1>
          <p className="text-sm text-ink-soft">{openCount} open</p>
        </div>
        <Button onClick={() => openQuickAdd(projectFilter ? { projectId: projectFilter } : undefined)}>
          <Plus className="size-4" /> Add task
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="View"
          value={view}
          onChange={(v) => set('view', v === 'list' ? '' : v)}
          options={[
            { value: 'list', label: 'List', icon: <List className="size-4" /> },
            { value: 'board', label: 'Board', icon: <SquareKanban className="size-4" /> },
            { value: 'calendar', label: 'Calendar', icon: <CalendarDays className="size-4" /> },
            { value: 'matrix', label: 'Matrix', icon: <Grid2x2 className="size-4" /> },
          ]}
        />
        <Select
          aria-label="Filter by project"
          value={projectFilter}
          onChange={(e) => (e.target.value === '__new' ? setNewProject(true) : set('project', e.target.value))}
          className="h-10 w-auto min-w-40"
        >
          <option value="">All projects</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="__new">+ New project…</option>
        </Select>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title or #tag"
          aria-label="Filter tasks"
          className="w-full sm:w-56"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : (tasks ?? []).length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No tasks yet"
            body='Press Q anywhere and type something like "Finish report friday 5pm #work".'
            action={<Button onClick={() => openQuickAdd()}>Add your first task</Button>}
          />
        </div>
      ) : view === 'board' ? (
        <Board tasks={visible} projects={projectMap} subtasksOf={subtasksOf} />
      ) : view === 'calendar' ? (
        <CalendarView tasks={visible} projects={projectMap} subtasksOf={subtasksOf} />
      ) : view === 'matrix' ? (
        <MatrixView tasks={visible} projects={projectMap} subtasksOf={subtasksOf} />
      ) : (
        <ListView tasks={visible} projects={projectMap} subtasksOf={subtasksOf} />
      )}
      <NewProjectDialog open={newProject} onOpenChange={setNewProject} />
    </div>
  );
}
