/**
 * The daily Productivity Score (0-100) — explainable by design: every point can be traced to a
 * component the user understands ("4 of 5 habits", "45 of 60 focus minutes").
 *
 *   tasks       35%  completed vs. a realistic daily target (what was due, min 3, max 8)
 *   habits      35%  habits done vs. habits due today
 *   focus       20%  focus minutes vs. the user's daily focus goal
 *   timeliness  10%  share of completed tasks finished on or before their due time
 *
 * Components with nothing to measure (e.g. no habits yet) drop out and the rest are re-weighted,
 * so a new user isn't punished for features they haven't started using.
 */

export interface DayInputs {
  tasksCompleted: number;
  tasksCompletedOnTime: number;
  tasksDue: number;
  habitsDone: number;
  habitsDue: number;
  habitsConfigured: number;
  focusMinutes: number;
  focusGoal: number;
}

export type ComponentKey = 'tasks' | 'habits' | 'focus' | 'timeliness';

export interface ScoreComponent {
  key: ComponentKey;
  label: string;
  weight: number; // effective weight after re-weighting, 0-1
  ratio: number; // 0-1
  points: number; // contribution to the final score
  detail: string;
}

export interface DayScore {
  score: number;
  label: string;
  components: ScoreComponent[];
}

const BASE_WEIGHTS: Record<ComponentKey, number> = { tasks: 0.35, habits: 0.35, focus: 0.2, timeliness: 0.1 };

export function taskTarget(tasksDue: number): number {
  return Math.min(8, Math.max(3, tasksDue));
}

export function scoreLabel(score: number): string {
  if (score >= 85) return 'Outstanding';
  if (score >= 70) return 'Strong day';
  if (score >= 50) return 'Solid progress';
  if (score >= 25) return 'Warming up';
  return 'Fresh start';
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function scoreDay(i: DayInputs): DayScore {
  const parts: Omit<ScoreComponent, 'weight' | 'points'>[] = [];
  const target = taskTarget(i.tasksDue);

  parts.push({
    key: 'tasks',
    label: 'Tasks',
    ratio: clamp01(i.tasksCompleted / target),
    detail: `${i.tasksCompleted} of ${target} planned tasks`,
  });
  if (i.habitsConfigured > 0 && i.habitsDue > 0) {
    parts.push({
      key: 'habits',
      label: 'Habits',
      ratio: clamp01(i.habitsDone / i.habitsDue),
      detail: `${Math.min(i.habitsDone, i.habitsDue)} of ${i.habitsDue} habits`,
    });
  }
  if (i.focusGoal > 0) {
    parts.push({
      key: 'focus',
      label: 'Focus',
      ratio: clamp01(i.focusMinutes / i.focusGoal),
      detail: `${Math.round(i.focusMinutes)} of ${i.focusGoal} focus minutes`,
    });
  }
  if (i.tasksCompleted > 0) {
    parts.push({
      key: 'timeliness',
      label: 'On time',
      ratio: clamp01(i.tasksCompletedOnTime / i.tasksCompleted),
      detail: `${i.tasksCompletedOnTime} of ${i.tasksCompleted} finished on time`,
    });
  }

  const totalWeight = parts.reduce((s, p) => s + BASE_WEIGHTS[p.key], 0);
  const components: ScoreComponent[] = parts.map((p) => {
    const weight = BASE_WEIGHTS[p.key] / totalWeight;
    return { ...p, weight: round(weight, 3), points: round(weight * p.ratio * 100, 1) };
  });
  const score = Math.round(components.reduce((s, c) => s + (c.weight * c.ratio * 100), 0));
  return { score, label: scoreLabel(score), components };
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
