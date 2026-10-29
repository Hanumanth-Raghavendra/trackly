import { useCallback, useEffect, useRef, useState } from 'react';

export type Phase = 'idle' | 'focus' | 'break';

export interface TimerState {
  phase: Phase;
  /** When the current run (re)started, ms epoch. */
  startedAt: number;
  /** Original start of the session (for the recorded startedAt). */
  sessionStart: number;
  durationMs: number;
  /** Remaining time captured when paused; null while running. */
  pausedRemaining: number | null;
  taskId: string | null;
  completedToday: number;
}

const KEY = 'trackly.focusTimer';
const idle = (completedToday = 0): TimerState => ({
  phase: 'idle',
  startedAt: 0,
  sessionStart: 0,
  durationMs: 0,
  pausedRemaining: null,
  taskId: null,
  completedToday,
});

function load(): TimerState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...idle(), ...(JSON.parse(raw) as TimerState) } : idle();
  } catch {
    return idle();
  }
}

export interface TimerActions {
  persist: (s: TimerState) => void;
  reset: (completedToday?: number) => void;
}

/**
 * A Pomodoro timer that survives reloads and background tabs: it stores *when* it started,
 * not how many ticks happened, and derives the remaining time from the clock.
 */
export function useFocusTimer(onFinish: (s: TimerState, actions: TimerActions) => void) {
  const [state, setState] = useState<TimerState>(load);
  const [now, setNow] = useState(() => Date.now());
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  });

  const persist = useCallback((s: TimerState) => {
    setState(s);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // private mode: timer still works for this tab
    }
  }, []);

  const remaining =
    state.phase === 'idle'
      ? 0
      : state.pausedRemaining ?? Math.max(0, state.durationMs - (now - state.startedAt));

  useEffect(() => {
    if (state.phase === 'idle' || state.pausedRemaining !== null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [state.phase, state.pausedRemaining]);

  useEffect(() => {
    if (state.phase !== 'idle' && state.pausedRemaining === null && remaining <= 0) {
      finishRef.current(state, { persist, reset: (c = state.completedToday) => persist(idle(c)) });
    }
  }, [remaining, state, persist]);

  return {
    state,
    remaining,
    progress: state.durationMs ? 1 - remaining / state.durationMs : 0,
    running: state.phase !== 'idle' && state.pausedRemaining === null,
    start: (phase: Exclude<Phase, 'idle'>, minutes: number, taskId: string | null) => {
      const t = Date.now();
      setNow(t);
      persist({ ...state, phase, startedAt: t, sessionStart: t, durationMs: minutes * 60_000, pausedRemaining: null, taskId });
    },
    pause: () => persist({ ...state, pausedRemaining: remaining }),
    resume: () => {
      const t = Date.now();
      setNow(t);
      persist({ ...state, startedAt: t - (state.durationMs - (state.pausedRemaining ?? 0)), pausedRemaining: null });
    },
    reset: (completedToday = state.completedToday) => persist(idle(completedToday)),
    setTask: (taskId: string | null) => persist({ ...state, taskId }),
    persist,
  };
}

export function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** A soft two-note chime made with Web Audio — no audio files to ship. */
export function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.25 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.65);
    });
  } catch {
    // audio blocked: the visual + notification still fire
  }
}
