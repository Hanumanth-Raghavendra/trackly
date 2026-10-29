import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  levelForXp,
  levelProgress,
  newlyUnlocked,
  xpForFocus,
  xpForHabit,
  xpForLevel,
  xpForTask,
  type AchievementMetrics,
} from '../../src/domain/gamification.js';

describe('levels', () => {
  it('uses a gently increasing curve', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
  });

  it('maps XP to the right level at every boundary', () => {
    for (let level = 1; level <= 30; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      if (level > 1) expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
    expect(levelForXp(-5)).toBe(1);
  });

  it('reports progress within the level', () => {
    const p = levelProgress(200);
    expect(p.level).toBe(2);
    expect(p.levelStartXp).toBe(100);
    expect(p.nextLevelXp).toBe(300);
    expect(p.progress).toBe(0.5);
  });
});

describe('xp rules', () => {
  it('rewards priority and punctuality', () => {
    expect(xpForTask({ priority: 'LOW', dueAt: null, completedAt: '2026-10-29T10:00:00Z' }).delta).toBe(10);
    expect(
      xpForTask({ priority: 'URGENT', dueAt: '2026-10-29T12:00:00Z', completedAt: '2026-10-29T10:00:00Z' }).delta,
    ).toBe(21);
    expect(
      xpForTask({ priority: 'URGENT', dueAt: '2026-10-29T09:00:00Z', completedAt: '2026-10-29T10:00:00Z' }).delta,
    ).toBe(18);
  });

  it('gives nothing for streak freezes', () => {
    expect(xpForHabit(false).delta).toBe(5);
    expect(xpForHabit(true).delta).toBe(0);
  });

  it('scales focus XP with time', () => {
    expect(xpForFocus(25 * 60, true).delta).toBe(5);
    expect(xpForFocus(50 * 60, true).delta).toBe(10);
    expect(xpForFocus(12 * 60, false).delta).toBe(1);
  });
});

describe('achievements', () => {
  const zero: AchievementMetrics = {
    tasksCompleted: 0,
    habitCheckins: 0,
    bestHabitStreakDays: 0,
    focusMinutes: 0,
    goalsCompleted: 0,
    earlyBirdTasks: 0,
    nightOwlTasks: 0,
    maxTasksOnWeekendDay: 0,
    perfectDays: 0,
    level: 1,
  };

  it('unlocks nothing for a new user', () => {
    expect(newlyUnlocked(zero, new Set())).toEqual([]);
  });

  it('unlocks only what was earned and not already held', () => {
    const fresh = newlyUnlocked({ ...zero, tasksCompleted: 12, bestHabitStreakDays: 7 }, new Set(['FIRST_STEPS']));
    expect(fresh.map((a) => a.code).sort()).toEqual(['GETTING_THINGS_DONE', 'ON_FIRE']);
  });

  it('has unique codes', () => {
    const codes = ACHIEVEMENTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
