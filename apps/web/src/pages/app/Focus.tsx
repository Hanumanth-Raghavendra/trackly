import { format, isToday, parseISO } from 'date-fns';
import { Coffee, Pause, Play, RotateCcw, Square, Trash } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useDeleteFocus, useFocusSessions, useFocusStats, useMe, useRecordFocus, useTasks } from '@/api/hooks';
import { Stadium } from '@/components/charts/Stadium';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { EmptyState, LaneBar, Segmented } from '@/components/ui/misc';
import { chime, formatClock, useFocusTimer, type TimerState } from '@/hooks/useFocusTimer';
import { cancelFocusEnd, scheduleFocusEnd } from '@/lib/native';
import { minutesLabel } from '@/lib/utils';

const PRESETS = [15, 25, 50] as const;

function notify(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    new Notification(title, { body, icon: '/icons/icon-192.png' });
  }
}

export default function Focus() {
  const { data: tasks } = useTasks();
  const { data: sessions } = useFocusSessions();
  const { data: stats } = useFocusStats(30);
  const { data: me } = useMe();
  const record = useRecordFocus();
  const remove = useDeleteFocus();
  const [minutes, setMinutes] = useState<number>(25);

  const openTasks = (tasks ?? []).filter((t) => t.status !== 'DONE' && !t.parentId);
  const taskTitle = (id: string | null) => (id ? tasks?.find((t) => t.id === id)?.title : null);

  const save = (s: TimerState, completed: boolean) => {
    const elapsedMs = s.durationMs - (s.pausedRemaining ?? Math.max(0, s.durationMs - (Date.now() - s.startedAt)));
    if (elapsedMs < 60_000) return; // under a minute isn't a session
    record.mutate(
      {
        taskId: s.taskId,
        startedAt: new Date(s.sessionStart).toISOString(),
        endedAt: new Date(s.sessionStart + elapsedMs).toISOString(),
        plannedMinutes: Math.round(s.durationMs / 60_000),
        completed,
      },
      { onError: () => toast.error('Could not save the session') },
    );
  };

  const timer = useFocusTimer((s, actions) => {
    chime();
    void cancelFocusEnd();
    if (s.phase === 'focus') {
      save(s, true);
      const done = s.completedToday + 1;
      const longBreak = done % 4 === 0;
      toast.success('Session complete', { description: longBreak ? 'Four in a row — take 15 minutes.' : 'Take a 5-minute break.' });
      notify('Focus session complete', 'Time for a break.');
      const t = Date.now();
      actions.persist({
        ...s,
        phase: 'break',
        startedAt: t,
        sessionStart: t,
        durationMs: (longBreak ? 15 : 5) * 60_000,
        pausedRemaining: null,
        completedToday: done,
      });
    } else {
      notify('Break over', 'Ready for the next round?');
      actions.reset();
    }
  });

  const { state, remaining, progress, running } = timer;
  const isBreak = state.phase === 'break';

  const today = useMemo(() => (sessions ?? []).filter((s) => isToday(parseISO(s.startedAt))), [sessions]);
  const todayMinutes = Math.round(today.reduce((sum, s) => sum + s.actualSeconds, 0) / 60);
  const goal = me?.focusGoalMinutes ?? 60;

  const start = async () => {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    timer.start('focus', minutes, state.taskId);
    await scheduleFocusEnd(new Date(Date.now() + minutes * 60_000), 'Focus session complete');
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-5xl sm:text-6xl">Focus</h1>
        <p className="text-sm text-ink-soft">One task, one timer. Sessions count towards your daily score.</p>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className="panel p-5 sm:p-8" aria-label="Focus timer">
          <Stadium
            value={state.phase === 'idle' ? 0 : progress}
            animate={false}
            color={isBreak ? 'var(--track)' : 'var(--volt)'}
            label={state.phase === 'idle' ? 'Timer not running' : `${formatClock(remaining)} remaining`}
          >
            <span className="font-display text-[clamp(56px,14vw,96px)] leading-none num" aria-live="off">
              {formatClock(state.phase === 'idle' ? minutes * 60_000 : remaining)}
            </span>
            <span className="mt-1 text-sm font-semibold text-ink-soft">
              {state.phase === 'idle' ? 'Ready' : isBreak ? 'Break' : state.pausedRemaining !== null ? 'Paused' : 'Focusing'}
            </span>
          </Stadium>

          <div className="mx-auto mt-6 max-w-md space-y-4">
            {state.phase === 'idle' ? (
              <>
                <div className="flex justify-center">
                  <Segmented
                    label="Session length"
                    value={String(minutes)}
                    onChange={(v) => setMinutes(Number(v))}
                    options={PRESETS.map((p) => ({ value: String(p), label: `${p} min` }))}
                  />
                </div>
                <Select aria-label="Task to focus on" value={state.taskId ?? ''} onChange={(e) => timer.setTask(e.target.value || null)}>
                  <option value="">No specific task</option>
                  {openTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </Select>
                <Button size="lg" variant="volt" className="w-full" onClick={() => void start()}>
                  <Play className="size-5" /> Start focusing
                </Button>
              </>
            ) : (
              <>
                {taskTitle(state.taskId) && !isBreak && (
                  <p className="text-center text-sm text-ink-soft">
                    Working on <span className="font-semibold text-ink">{taskTitle(state.taskId)}</span>
                  </p>
                )}
                <div className="flex justify-center gap-2">
                  {running ? (
                    <Button variant="secondary" size="lg" onClick={timer.pause}>
                      <Pause className="size-5" /> Pause
                    </Button>
                  ) : (
                    <Button variant="secondary" size="lg" onClick={timer.resume}>
                      <Play className="size-5" /> Resume
                    </Button>
                  )}
                  {isBreak ? (
                    <Button variant="ghost" size="lg" onClick={() => timer.reset()}>
                      <Coffee className="size-5" /> Skip break
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="lg"
                      onClick={() => {
                        save(state, false);
                        void cancelFocusEnd();
                        timer.reset();
                        toast('Session stopped', { description: 'Partial time was still logged.' });
                      }}
                    >
                      <Square className="size-5" /> Stop
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="panel p-5" aria-labelledby="today-focus">
            <h2 id="today-focus" className="font-bold">
              Today
            </h2>
            <p className="mt-2 font-display text-5xl num">
              {minutesLabel(todayMinutes)} <span className="text-2xl text-ink-faint">of {minutesLabel(goal)}</span>
            </p>
            <LaneBar value={todayMinutes / goal} className="mt-3" label="Daily focus goal" />
            {stats && (
              <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-xs text-ink-faint">30 days</dt>
                  <dd className="font-display text-2xl num">{minutesLabel(stats.totalMinutes)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-faint">Sessions</dt>
                  <dd className="font-display text-2xl num">{stats.sessions}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-faint">Finished</dt>
                  <dd className="font-display text-2xl num">{stats.completionRate == null ? '—' : `${Math.round(stats.completionRate * 100)}%`}</dd>
                </div>
              </dl>
            )}
          </section>

          <section className="panel p-2" aria-labelledby="recent-focus">
            <h2 id="recent-focus" className="px-3 pt-3 pb-1 font-bold">
              Recent sessions
            </h2>
            {!sessions?.length ? (
              <EmptyState icon={<RotateCcw className="size-7" />} title="No sessions yet" body="Your finished and partial sessions appear here." />
            ) : (
              <ul className="divide-y divide-lane">
                {sessions.slice(0, 8).map((s) => (
                  <li key={s.id} className="group flex items-center gap-3 px-3 py-2.5">
                    <span className={`size-2.5 rounded-full ${s.completed ? 'bg-volt' : 'bg-lane-strong'}`} aria-label={s.completed ? 'Completed' : 'Stopped early'} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{taskTitle(s.taskId) ?? 'Focus session'}</span>
                      <span className="text-xs text-ink-faint">{format(parseISO(s.startedAt), 'EEE d MMM, h:mm a')}</span>
                    </span>
                    <span className="text-sm font-semibold num">{minutesLabel(Math.round(s.actualSeconds / 60))}</span>
                    <button
                      className="rounded p-1 text-ink-faint opacity-0 group-hover:opacity-100 hover:text-signal focus:opacity-100"
                      aria-label="Delete session"
                      onClick={() => remove.mutate(s.id)}
                    >
                      <Trash className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
