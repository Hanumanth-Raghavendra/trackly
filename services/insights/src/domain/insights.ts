import { formatHour, WEEKDAY_NAMES } from './dates.js';
import type { DayRow, HabitInsight, Heatmap, Procrastination } from './analytics.js';

/**
 * Rule-based "coach": turns analytics into short, specific, actionable cards.
 * Deterministic and free — the optional LLM layer only rewrites the weekly summary.
 */

export type InsightKind = 'positive' | 'warning' | 'tip' | 'neutral';

export interface InsightCard {
  id: string;
  kind: InsightKind;
  icon: string;
  title: string;
  body: string;
  priority: number; // higher = shown first
}

export interface InsightInputs {
  days: DayRow[]; // chronological, ending today
  heatmap: Heatmap;
  procrastination: Procrastination;
  habits: HabitInsight[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (v: number) => `${Math.round(v * 100)}%`;

function weekCompare(days: DayRow[], pick: (d: DayRow) => number) {
  const thisWeek = days.slice(-7);
  const lastWeek = days.slice(-14, -7);
  const a = sum(thisWeek.map(pick));
  const b = sum(lastWeek.map(pick));
  return { current: a, previous: b, change: b > 0 ? (a - b) / b : null };
}

export function generateInsights({ days, heatmap, procrastination, habits }: InsightInputs): InsightCard[] {
  const cards: InsightCard[] = [];

  // 1. Streak risk today — the most actionable thing we can say.
  for (const h of habits.filter((x) => x.risk?.level === 'high').slice(0, 2)) {
    cards.push({
      id: `risk-${h.habitId}`,
      kind: 'warning',
      icon: '⚠️',
      title: `${h.name} is at risk today`,
      body: `${h.risk!.reason} Do it early — even a 2-minute version keeps the habit alive.`,
      priority: 100,
    });
  }
  for (const h of habits.filter((x) => x.risk?.level === 'medium').slice(0, 1)) {
    cards.push({
      id: `streak-${h.habitId}`,
      kind: 'warning',
      icon: '🔥',
      title: `Protect your ${h.name} streak`,
      body: h.risk!.reason,
      priority: 90,
    });
  }

  // 2. Overdue work.
  if (procrastination.overdueOpen > 0) {
    const oldest = procrastination.oldestOverdue ? ` The oldest is "${procrastination.oldestOverdue.title}".` : '';
    cards.push({
      id: 'overdue',
      kind: 'warning',
      icon: '⏰',
      title: `${procrastination.overdueOpen} overdue task${procrastination.overdueOpen === 1 ? '' : 's'}`,
      body: `Reschedule or finish them so they stop draining attention.${oldest}`,
      priority: 80,
    });
  }

  // 3. Peak hours — when to schedule deep work.
  if (heatmap.peakHour !== null && heatmap.totalCompletions >= 10) {
    cards.push({
      id: 'peak-hour',
      kind: 'tip',
      icon: '⚡',
      title: `Your peak hour is around ${formatHour(heatmap.peakHour)}`,
      body: `Over the last ${heatmap.days} days you finished the most work between ${formatHour(heatmap.peakHour)} and ${formatHour((heatmap.peakHour + 1) % 24)}. Protect it for your hardest task.`,
      priority: 60,
    });
  }

  // 4. Strongest weekday.
  if (heatmap.peakWeekday !== null && heatmap.totalCompletions >= 14) {
    const totals = heatmap.weekdayTotals;
    const avg = sum(totals) / 7;
    const best = totals[heatmap.peakWeekday - 1]!;
    if (avg > 0 && best / avg >= 1.15) {
      cards.push({
        id: 'power-day',
        kind: 'positive',
        icon: '📈',
        title: `${WEEKDAY_NAMES[heatmap.peakWeekday - 1]} is your power day`,
        body: `You complete ${Math.round((best / avg - 1) * 100)}% more tasks on ${WEEKDAY_NAMES[heatmap.peakWeekday - 1]}s than on an average day.`,
        priority: 40,
      });
    }
  }

  // 5. Focus trend.
  const focus = weekCompare(days, (d) => d.inputs.focusMinutes);
  if (focus.change !== null && Math.abs(focus.change) >= 0.15 && focus.previous >= 30) {
    const up = focus.change > 0;
    cards.push({
      id: 'focus-trend',
      kind: up ? 'positive' : 'tip',
      icon: up ? '🎧' : '🧭',
      title: `Focus time ${up ? 'up' : 'down'} ${pct(Math.abs(focus.change))} this week`,
      body: up
        ? `${focus.current} minutes vs ${focus.previous} last week. Whatever you changed, keep doing it.`
        : `${focus.current} minutes vs ${focus.previous} last week. Try booking one 25-minute block before lunch.`,
      priority: 50,
    });
  }

  // 6. Task throughput trend.
  const tasks = weekCompare(days, (d) => d.inputs.tasksCompleted);
  if (tasks.change !== null && tasks.change >= 0.2 && tasks.previous >= 5) {
    cards.push({
      id: 'tasks-trend',
      kind: 'positive',
      icon: '🚀',
      title: `${pct(tasks.change)} more tasks done than last week`,
      body: `${tasks.current} tasks completed in the last 7 days vs ${tasks.previous} the week before.`,
      priority: 45,
    });
  }

  // 7. Deadline behaviour.
  if (procrastination.lateRate !== null && procrastination.tasksWithDueDate >= 10 && procrastination.lateRate >= 0.15) {
    const worst = [...procrastination.byPriority]
      .filter((p) => p.withDue >= 3 && p.lateRate !== null)
      .sort((a, b) => (b.lateRate ?? 0) - (a.lateRate ?? 0))[0];
    cards.push({
      id: 'deadlines',
      kind: 'tip',
      icon: '🐢',
      title: `${pct(procrastination.lateRate)} of tasks finish after their deadline`,
      body: worst
        ? `${worst.priority.charAt(0)}${worst.priority.slice(1).toLowerCase()}-priority tasks slip most (${pct(worst.lateRate ?? 0)}). Split them into smaller steps with their own due dates.`
        : 'Split big tasks into smaller steps with their own due dates.',
      priority: 55,
    });
  } else if (procrastination.onTimeRate !== null && procrastination.tasksWithDueDate >= 10 && procrastination.onTimeRate >= 0.9) {
    cards.push({
      id: 'deadlines-good',
      kind: 'positive',
      icon: '🎯',
      title: `${pct(procrastination.onTimeRate)} of deadlines met`,
      body: 'You reliably finish what you schedule. Consider taking on a stretch goal.',
      priority: 30,
    });
  }

  // 8. Over-planning.
  if (procrastination.createdPerDay >= 3 && procrastination.completedPerDay > 0 &&
      procrastination.createdPerDay / procrastination.completedPerDay >= 1.3) {
    cards.push({
      id: 'over-planning',
      kind: 'tip',
      icon: '🧮',
      title: 'You plan more than you finish',
      body: `You add about ${procrastination.createdPerDay} tasks a day but finish ${procrastination.completedPerDay}. Plan ${Math.max(1, Math.round(procrastination.completedPerDay))} must-dos per day and treat the rest as a backlog.`,
      priority: 35,
    });
  }

  // 9. Mood x focus correlation — a genuinely "behaviour-based" observation.
  const moodDays = days.filter((d) => d.moodAvg !== null);
  if (moodDays.length >= 8) {
    const hit = moodDays.filter((d) => d.inputs.focusMinutes >= d.inputs.focusGoal);
    const miss = moodDays.filter((d) => d.inputs.focusMinutes < d.inputs.focusGoal);
    if (hit.length >= 3 && miss.length >= 3) {
      const avg = (xs: DayRow[]) => sum(xs.map((d) => d.moodAvg!)) / xs.length;
      const a = avg(hit);
      const b = avg(miss);
      if (a - b >= 0.3) {
        cards.push({
          id: 'mood-focus',
          kind: 'neutral',
          icon: '💡',
          title: 'Focus days are better days',
          body: `On days you hit your focus goal your mood averages ${a.toFixed(1)}/5, vs ${b.toFixed(1)} when you don't.`,
          priority: 42,
        });
      }
    }
  }

  // 10. Celebrate the best running streak.
  const champion = [...habits].filter((h) => h.unit === 'days').sort((a, b) => b.currentStreak - a.currentStreak)[0];
  if (champion && champion.currentStreak >= 7) {
    cards.push({
      id: `champion-${champion.habitId}`,
      kind: 'positive',
      icon: champion.icon ?? '🏅',
      title: `${champion.currentStreak}-day ${champion.name} streak`,
      body:
        champion.currentStreak >= champion.longestStreak
          ? "That's your personal best. Keep it going!"
          : `Your record is ${champion.longestStreak} days — ${champion.longestStreak - champion.currentStreak} more to beat it.`,
      priority: 38,
    });
  }

  if (cards.length === 0) {
    cards.push({
      id: 'getting-started',
      kind: 'neutral',
      icon: '🌱',
      title: 'Insights unlock as you go',
      body: 'Complete a few tasks, check in habits and run a focus session — patterns appear after about a week.',
      priority: 0,
    });
  }

  return cards.sort((a, b) => b.priority - a.priority);
}
