import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/domain/dates.js';
import { habitStats, isScheduled, type HabitLike } from '../../src/domain/schedule.js';

// 2026-10-29 is a Thursday.
const TODAY = '2026-10-29';
const back = (...offsets: number[]) => new Set(offsets.map((o) => addDays(TODAY, -o)));
const daily: HabitLike = { frequencyType: 'DAILY', targetPerWeek: 7, daysOfWeek: 127, createdOn: addDays(TODAY, -30) };

describe('habitStats (daily)', () => {
  it('counts consecutive days including today', () => {
    expect(habitStats(daily, back(0, 1, 2, 3), TODAY).currentStreak).toBe(4);
  });

  it('does not break the streak before the day is over', () => {
    const s = habitStats(daily, back(1, 2, 3), TODAY);
    expect(s.currentStreak).toBe(3);
    expect(s.dueToday).toBe(true);
    expect(s.doneToday).toBe(false);
  });

  it('remembers the longest streak', () => {
    const s = habitStats(daily, back(0, 1, 3, 4, 5, 6, 7, 8), TODAY);
    expect(s.currentStreak).toBe(2);
    expect(s.longestStreak).toBe(6);
  });
});

describe('habitStats (specific days)', () => {
  // Monday (1) + Thursday (8) = 9
  const monThu: HabitLike = { frequencyType: 'SPECIFIC_DAYS', targetPerWeek: 2, daysOfWeek: 9, createdOn: addDays(TODAY, -30) };

  it('skips unscheduled days', () => {
    expect(habitStats(monThu, back(0, 3, 7, 10), TODAY).currentStreak).toBe(4);
  });

  it('knows which days are scheduled', () => {
    expect(isScheduled(monThu, TODAY)).toBe(true);
    expect(isScheduled(monThu, addDays(TODAY, 1))).toBe(false);
  });
});

describe('habitStats (weekly target)', () => {
  const threeAWeek: HabitLike = { frequencyType: 'WEEKLY_TIMES', targetPerWeek: 3, daysOfWeek: 127, createdOn: addDays(TODAY, -40) };

  it('counts weeks that met the target', () => {
    const s = habitStats(threeAWeek, back(0, 1, 3, 7, 9, 10, 14), TODAY);
    expect(s.unit).toBe('weeks');
    expect(s.currentStreak).toBe(2);
    expect(s.dueToday).toBe(false);
  });

  it('an unfinished current week does not break the streak', () => {
    const s = habitStats(threeAWeek, back(0, 7, 9, 10), TODAY);
    expect(s.currentStreak).toBe(1);
    expect(s.dueToday).toBe(true);
  });
});
