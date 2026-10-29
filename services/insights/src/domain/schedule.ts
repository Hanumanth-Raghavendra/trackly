import { addDays, daysBetween, weekStart, weekdayOf } from './dates.js';

/**
 * Habit schedule + streak maths. Mirrors the core API's HabitStreakCalculator so both services
 * agree; insights needs it for streak-risk alerts and achievements.
 */
export type Frequency = 'DAILY' | 'WEEKLY_TIMES' | 'SPECIFIC_DAYS';

export interface HabitLike {
  frequencyType: Frequency;
  targetPerWeek: number;
  daysOfWeek: number; // bitmask Mon=1 ... Sun=64
  createdOn: string; // YYYY-MM-DD in the user's timezone
}

export interface HabitStats {
  currentStreak: number;
  longestStreak: number;
  unit: 'days' | 'weeks';
  completionRate30d: number;
  doneToday: boolean;
  dueToday: boolean;
}

export function isDaySet(mask: number, weekday: number): boolean {
  return (mask & (1 << (weekday - 1))) !== 0;
}

export function isScheduled(h: Pick<HabitLike, 'frequencyType' | 'daysOfWeek'>, day: string): boolean {
  if (h.frequencyType === 'SPECIFIC_DAYS') return isDaySet(h.daysOfWeek, weekdayOf(day));
  return true;
}

function countInWeek(done: Set<string>, monday: string): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (done.has(addDays(monday, i))) n++;
  return n;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function habitStats(h: HabitLike, done: Set<string>, today: string): HabitStats {
  let start = h.createdOn;
  for (const d of done) if (d < start) start = d;
  if (start > today) start = today;
  const doneToday = done.has(today);

  if (h.frequencyType === 'WEEKLY_TIMES') {
    const target = Math.max(1, h.targetPerWeek);
    const thisWeek = weekStart(today);
    const firstWeek = weekStart(start);
    let current = 0;
    for (let w = thisWeek; w >= firstWeek; w = addDays(w, -7)) {
      if (countInWeek(done, w) >= target) current++;
      else if (w !== thisWeek) break;
    }
    let longest = 0;
    let run = 0;
    for (let w = firstWeek; w <= thisWeek; w = addDays(w, 7)) {
      if (countInWeek(done, w) >= target) {
        run++;
        longest = Math.max(longest, run);
      } else if (w !== thisWeek) run = 0;
    }
    const windowStart = start > addDays(today, -27) ? start : addDays(today, -27);
    const days = daysBetween(windowStart, today) + 1;
    const expected = target * (days / 7);
    let hits = 0;
    for (const d of done) if (d >= windowStart && d <= today) hits++;
    return {
      currentStreak: current,
      longestStreak: Math.max(longest, current),
      unit: 'weeks',
      completionRate30d: expected <= 0 ? 0 : round3(Math.min(1, hits / expected)),
      doneToday,
      dueToday: countInWeek(done, thisWeek) < target,
    };
  }

  let current = 0;
  for (let d = today; d >= start; d = addDays(d, -1)) {
    if (!isScheduled(h, d)) continue;
    if (done.has(d)) current++;
    else if (d !== today) break;
  }
  let longest = 0;
  let run = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (!isScheduled(h, d)) continue;
    if (done.has(d)) {
      run++;
      longest = Math.max(longest, run);
    } else if (d !== today) run = 0;
  }
  const windowStart = start > addDays(today, -29) ? start : addDays(today, -29);
  let scheduled = 0;
  let hit = 0;
  for (let d = windowStart; d <= today; d = addDays(d, 1)) {
    if (!isScheduled(h, d) || (d === today && !doneToday)) continue;
    scheduled++;
    if (done.has(d)) hit++;
  }
  return {
    currentStreak: current,
    longestStreak: Math.max(longest, current),
    unit: 'days',
    completionRate30d: scheduled === 0 ? (doneToday ? 1 : 0) : round3(hit / scheduled),
    doneToday,
    dueToday: isScheduled(h, today),
  };
}
