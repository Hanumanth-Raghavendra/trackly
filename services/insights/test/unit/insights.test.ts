import { describe, expect, it } from 'vitest';
import type { DayRow, HabitInsight, Heatmap, Procrastination } from '../../src/domain/analytics.js';
import { generateInsights } from '../../src/domain/insights.js';
import { scoreDay } from '../../src/domain/score.js';

function day(date: string, tasks: number, focus: number, mood: number | null = null): DayRow {
  const inputs = {
    tasksCompleted: tasks,
    tasksCompletedOnTime: tasks,
    tasksDue: 3,
    habitsDone: 1,
    habitsDue: 2,
    habitsConfigured: 2,
    focusMinutes: focus,
    focusGoal: 60,
  };
  return { date, inputs, focusSessions: focus > 0 ? 1 : 0, moodAvg: mood, score: scoreDay(inputs) };
}

const emptyHeatmap: Heatmap = {
  days: 28,
  tasks: [],
  focusMinutes: [],
  peakHour: null,
  peakWeekday: null,
  weekdayTotals: [0, 0, 0, 0, 0, 0, 0],
  totalCompletions: 0,
};

const calmProcrastination: Procrastination = {
  days: 28,
  tasksWithDueDate: 0,
  onTimeRate: null,
  lateRate: null,
  index: null,
  avgLateHours: null,
  avgDaysToComplete: null,
  byPriority: [],
  overdueOpen: 0,
  oldestOverdue: null,
  createdPerDay: 0,
  completedPerDay: 0,
};

describe('generateInsights', () => {
  it('has a friendly default for brand new users', () => {
    const cards = generateInsights({ days: [], heatmap: emptyHeatmap, procrastination: calmProcrastination, habits: [] });
    expect(cards).toHaveLength(1);
    expect(cards[0]!.id).toBe('getting-started');
  });

  it('puts streak risk and overdue work first', () => {
    const risky: HabitInsight = {
      habitId: 'h1',
      name: 'Gym',
      icon: '🏋️',
      color: null,
      frequencyType: 'SPECIFIC_DAYS',
      currentStreak: 3,
      longestStreak: 9,
      unit: 'days',
      completionRate30d: 0.6,
      doneToday: false,
      dueToday: true,
      weekdayMissRate: [0.1, 0.1, 0.7, 0.1, 0.1, null, null],
      moodAvg: null,
      doneDays: [],
      risk: { level: 'high', reason: 'You usually skip this on Wednesdays (70% of the time).' },
    };
    const cards = generateInsights({
      days: [],
      heatmap: { ...emptyHeatmap, peakHour: 10, totalCompletions: 40 },
      procrastination: { ...calmProcrastination, overdueOpen: 2, oldestOverdue: { title: 'Pay rent', dueAt: '' } },
      habits: [risky],
    });
    expect(cards.map((c) => c.id).slice(0, 3)).toEqual(['risk-h1', 'overdue', 'peak-hour']);
    expect(cards[1]!.body).toContain('Pay rent');
    expect(cards[2]!.title).toContain('10 AM');
  });

  it('spots week-over-week focus changes', () => {
    const days = [
      ...Array.from({ length: 7 }, (_, i) => day(`2026-10-${10 + i}`, 3, 20)),
      ...Array.from({ length: 7 }, (_, i) => day(`2026-10-${17 + i}`, 3, 60)),
    ];
    const cards = generateInsights({ days, heatmap: emptyHeatmap, procrastination: calmProcrastination, habits: [] });
    const focus = cards.find((c) => c.id === 'focus-trend');
    expect(focus?.title).toBe('Focus time up 200% this week');
  });

  it('correlates mood with focus', () => {
    const days = [
      ...Array.from({ length: 5 }, (_, i) => day(`2026-10-${10 + i}`, 3, 90, 4.5)),
      ...Array.from({ length: 5 }, (_, i) => day(`2026-10-${15 + i}`, 3, 10, 3)),
    ];
    const cards = generateInsights({ days, heatmap: emptyHeatmap, procrastination: calmProcrastination, habits: [] });
    expect(cards.find((c) => c.id === 'mood-focus')?.body).toContain('4.5/5');
  });
});
