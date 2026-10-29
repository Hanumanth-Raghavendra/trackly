import { describe, expect, it } from 'vitest';
import { scoreDay, scoreLabel, taskTarget, type DayInputs } from '../../src/domain/score.js';

const base: DayInputs = {
  tasksCompleted: 0,
  tasksCompletedOnTime: 0,
  tasksDue: 0,
  habitsDone: 0,
  habitsDue: 0,
  habitsConfigured: 0,
  focusMinutes: 0,
  focusGoal: 60,
};

describe('scoreDay', () => {
  it('gives 100 for a perfect day', () => {
    const s = scoreDay({
      ...base,
      tasksCompleted: 5,
      tasksCompletedOnTime: 5,
      tasksDue: 5,
      habitsDone: 4,
      habitsDue: 4,
      habitsConfigured: 4,
      focusMinutes: 60,
    });
    expect(s.score).toBe(100);
    expect(s.label).toBe('Outstanding');
    expect(s.components.map((c) => c.key)).toEqual(['tasks', 'habits', 'focus', 'timeliness']);
  });

  it('re-weights when the user has no habits yet', () => {
    const s = scoreDay({ ...base, tasksCompleted: 3, tasksCompletedOnTime: 3, focusMinutes: 60 });
    expect(s.components.find((c) => c.key === 'habits')).toBeUndefined();
    expect(s.score).toBe(100);
    const weights = s.components.reduce((sum, c) => sum + c.weight, 0);
    expect(weights).toBeCloseTo(1, 2);
  });

  it('explains every point', () => {
    const s = scoreDay({
      ...base,
      tasksCompleted: 2,
      tasksCompletedOnTime: 1,
      tasksDue: 4,
      habitsDone: 1,
      habitsDue: 2,
      habitsConfigured: 3,
      focusMinutes: 30,
    });
    const points = s.components.reduce((sum, c) => sum + c.points, 0);
    expect(Math.abs(points - s.score)).toBeLessThanOrEqual(1);
    expect(s.components.find((c) => c.key === 'tasks')!.detail).toBe('2 of 4 due today');
    expect(s.components.find((c) => c.key === 'habits')!.detail).toBe('1 of 2 habits');
  });

  it('says when the task target is the daily floor rather than the due list', () => {
    const s = scoreDay({ ...base, tasksCompleted: 0, tasksCompletedOnTime: 0, tasksDue: 1 });
    expect(s.components.find((c) => c.key === 'tasks')!.detail).toBe('0 of 3 (daily target)');
  });

  it('never exceeds 100 when over-achieving', () => {
    const s = scoreDay({ ...base, tasksCompleted: 20, tasksCompletedOnTime: 20, focusMinutes: 300 });
    expect(s.score).toBe(100);
  });

  it('is zero for an empty day', () => {
    expect(scoreDay(base).score).toBe(0);
  });
});

describe('helpers', () => {
  it('keeps the daily task target realistic', () => {
    expect(taskTarget(0)).toBe(3);
    expect(taskTarget(5)).toBe(5);
    expect(taskTarget(20)).toBe(8);
  });

  it('labels scores', () => {
    expect(scoreLabel(90)).toBe('Outstanding');
    expect(scoreLabel(72)).toBe('Strong day');
    expect(scoreLabel(55)).toBe('Solid progress');
    expect(scoreLabel(30)).toBe('Warming up');
    expect(scoreLabel(5)).toBe('Fresh start');
  });
});
