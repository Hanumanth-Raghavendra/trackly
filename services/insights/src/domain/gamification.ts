/**
 * Gamification rules: XP per action, levels, and the achievement catalogue.
 * Pure functions here; persistence lives in the consumer.
 */

export const PRIORITY_BONUS: Record<string, number> = { LOW: 0, MEDIUM: 2, HIGH: 5, URGENT: 8 };

export interface XpAward {
  delta: number;
  reason: string;
}

export function xpForTask(task: { priority: string; dueAt: string | null; completedAt: string | null }): XpAward {
  let delta = 10 + (PRIORITY_BONUS[task.priority] ?? 0);
  let reason = 'Task completed';
  if (task.dueAt && task.completedAt && new Date(task.completedAt) <= new Date(task.dueAt)) {
    delta += 3;
    reason = 'Task completed on time';
  }
  return { delta, reason };
}

export function xpForHabit(freeze: boolean): XpAward {
  return freeze ? { delta: 0, reason: 'Streak freeze used' } : { delta: 5, reason: 'Habit checked in' };
}

export function xpForFocus(actualSeconds: number, completed: boolean): XpAward {
  const minutes = actualSeconds / 60;
  return completed
    ? { delta: Math.max(1, Math.round(minutes / 5)), reason: 'Focus session completed' }
    : { delta: Math.floor(minutes / 10), reason: 'Partial focus session' };
}

export const GOAL_XP: XpAward = { delta: 50, reason: 'Goal achieved' };

/** XP needed to reach a level: 0, 100, 300, 600, 1000, 1500 ... (50·n·(n-1)). */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelForXp(xp: number): number {
  if (xp <= 0) return 1;
  return Math.floor((1 + Math.sqrt(1 + (4 * xp) / 50)) / 2);
}

export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    xp,
    level,
    levelStartXp: current,
    nextLevelXp: next,
    progress: Math.round(((xp - current) / (next - current)) * 1000) / 1000,
    title: levelTitle(level),
  };
}

export function levelTitle(level: number): string {
  if (level >= 20) return 'Legend';
  if (level >= 15) return 'Grandmaster';
  if (level >= 10) return 'Master';
  if (level >= 7) return 'Expert';
  if (level >= 5) return 'Pro';
  if (level >= 3) return 'Apprentice';
  return 'Rookie';
}

/** Aggregates the achievement rules are evaluated against. */
export interface AchievementMetrics {
  tasksCompleted: number;
  habitCheckins: number;
  bestHabitStreakDays: number;
  focusMinutes: number;
  goalsCompleted: number;
  earlyBirdTasks: number; // completed before 7:00 local
  nightOwlTasks: number; // completed at or after 23:00 local
  maxTasksOnWeekendDay: number;
  perfectDays: number;
  level: number;
}

export interface AchievementDef {
  code: string;
  title: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
  test: (m: AchievementMetrics) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'FIRST_STEPS', title: 'First Steps', description: 'Complete your first task', icon: '👣', tier: 'bronze', test: (m) => m.tasksCompleted >= 1 },
  { code: 'GETTING_THINGS_DONE', title: 'Getting Things Done', description: 'Complete 10 tasks', icon: '✅', tier: 'bronze', test: (m) => m.tasksCompleted >= 10 },
  { code: 'CENTURION', title: 'Centurion', description: 'Complete 100 tasks', icon: '💯', tier: 'silver', test: (m) => m.tasksCompleted >= 100 },
  { code: 'TASK_LEGEND', title: 'Task Legend', description: 'Complete 500 tasks', icon: '🏆', tier: 'gold', test: (m) => m.tasksCompleted >= 500 },
  { code: 'HABIT_FORMED', title: 'Habit Formed', description: 'Check in a habit for the first time', icon: '🌱', tier: 'bronze', test: (m) => m.habitCheckins >= 1 },
  { code: 'ON_FIRE', title: 'On Fire', description: 'Reach a 7-day habit streak', icon: '🔥', tier: 'silver', test: (m) => m.bestHabitStreakDays >= 7 },
  { code: 'UNSTOPPABLE', title: 'Unstoppable', description: 'Reach a 30-day habit streak', icon: '⚡', tier: 'gold', test: (m) => m.bestHabitStreakDays >= 30 },
  { code: 'DEEP_DIVER', title: 'Deep Diver', description: 'Log your first hour of focus', icon: '🎧', tier: 'bronze', test: (m) => m.focusMinutes >= 60 },
  { code: 'FLOW_STATE', title: 'Flow State', description: 'Log 10 hours of focus', icon: '🌊', tier: 'silver', test: (m) => m.focusMinutes >= 600 },
  { code: 'MONK_MODE', title: 'Monk Mode', description: 'Log 50 hours of focus', icon: '🧘', tier: 'gold', test: (m) => m.focusMinutes >= 3000 },
  { code: 'GOAL_GETTER', title: 'Goal Getter', description: 'Achieve a goal', icon: '🎯', tier: 'silver', test: (m) => m.goalsCompleted >= 1 },
  { code: 'EARLY_BIRD', title: 'Early Bird', description: 'Finish a task before 7 AM', icon: '🌅', tier: 'bronze', test: (m) => m.earlyBirdTasks >= 1 },
  { code: 'NIGHT_OWL', title: 'Night Owl', description: 'Finish a task after 11 PM', icon: '🦉', tier: 'bronze', test: (m) => m.nightOwlTasks >= 1 },
  { code: 'WEEKEND_WARRIOR', title: 'Weekend Warrior', description: 'Finish 5 tasks on a weekend day', icon: '🛡️', tier: 'silver', test: (m) => m.maxTasksOnWeekendDay >= 5 },
  { code: 'PERFECT_DAY', title: 'Perfect Day', description: 'Do every due habit and finish 3+ tasks in one day', icon: '🌟', tier: 'silver', test: (m) => m.perfectDays >= 1 },
  { code: 'LEVEL_5', title: 'Rising Star', description: 'Reach level 5', icon: '⭐', tier: 'silver', test: (m) => m.level >= 5 },
  { code: 'LEVEL_10', title: 'Master of Momentum', description: 'Reach level 10', icon: '👑', tier: 'gold', test: (m) => m.level >= 10 },
];

export function newlyUnlocked(metrics: AchievementMetrics, already: Set<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !already.has(a.code) && a.test(metrics));
}

export function achievementByCode(code: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.code === code);
}
