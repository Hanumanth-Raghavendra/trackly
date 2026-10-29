// Types mirroring the core API (Spring Boot) and insights API (Node) responses.

export interface User {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  focusGoalMinutes: number;
  demo: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
  refreshToken?: string;
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type Recurrence = 'DAILY' | 'WEEKDAYS' | 'WEEKLY' | 'MONTHLY';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  tags: string[];
  dueAt: string | null;
  estimateMinutes: number | null;
  position: number;
  recurrence: Recurrence | null;
  projectId: string | null;
  goalId: string | null;
  parentId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewTask {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  tags?: string[];
  dueAt?: string | null;
  estimateMinutes?: number | null;
  recurrence?: Recurrence | null;
  projectId?: string | null;
  goalId?: string | null;
  parentId?: string | null;
}

export interface CompleteResult {
  task: Task;
  nextOccurrence: Task | null;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  createdAt: string;
}

export type Frequency = 'DAILY' | 'WEEKLY_TIMES' | 'SPECIFIC_DAYS';
export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export interface HabitStats {
  currentStreak: number;
  longestStreak: number;
  streakUnit: 'days' | 'weeks';
  completionRate30d: number;
  totalCheckins: number;
  doneToday: boolean;
  dueToday: boolean;
  doneThisWeek: number;
}

export interface Habit {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  frequencyType: Frequency;
  targetPerWeek: number;
  daysOfWeek: Weekday[];
  reminderTime: string | null;
  goalId: string | null;
  freezeTokens: number;
  archived: boolean;
  position: number;
  createdAt: string;
  stats: HabitStats;
  recentCheckins: string[];
}

export interface HabitInput {
  name: string;
  description?: string | null;
  icon?: string;
  color?: string;
  frequencyType?: Frequency;
  targetPerWeek?: number;
  daysOfWeek?: Weekday[];
  reminderTime?: string | null;
  goalId?: string | null;
}

export interface Checkin {
  habitId: string;
  day: string;
  note: string | null;
  mood: number | null;
  freeze: boolean;
}

export type GoalStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  color: string;
  targetDate: string | null;
  status: GoalStatus;
  completedAt: string | null;
  createdAt: string;
  progress: { percent: number; tasksTotal: number; tasksDone: number; habitCount: number; habitConsistency: number };
}

export interface FocusSession {
  id: string;
  taskId: string | null;
  startedAt: string;
  endedAt: string;
  plannedMinutes: number;
  actualSeconds: number;
  completed: boolean;
  note: string | null;
}

// ---- insights ----

export interface ScoreComponent {
  key: 'tasks' | 'habits' | 'focus' | 'timeliness';
  label: string;
  weight: number;
  ratio: number;
  points: number;
  detail: string;
}

export interface DayScore {
  score: number;
  label: string;
  components: ScoreComponent[];
}

export interface LevelProgress {
  xp: number;
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
  progress: number;
  title: string;
}

export interface InsightCard {
  id: string;
  kind: 'positive' | 'warning' | 'tip' | 'neutral';
  icon: string;
  title: string;
  body: string;
  priority: number;
}

export interface Overview {
  date: string;
  timezone: string;
  score: DayScore;
  yesterdayScore: number | null;
  weekAverage: number;
  today: {
    tasksCompleted: number;
    tasksDue: number;
    habitsDone: number;
    habitsDue: number;
    focusMinutes: number;
    focusGoal: number;
  };
  activeStreak: number;
  level: LevelProgress;
  overdue: number;
  atRiskHabits: { habitId: string; name: string; level: 'high' | 'medium'; reason: string }[];
  insights: InsightCard[];
  trend: { date: string; score: number }[];
}

export interface ScoreDay {
  date: string;
  score: number;
  label: string;
  components: ScoreComponent[];
  tasksCompleted: number;
  tasksDue: number;
  habitsDone: number;
  habitsDue: number;
  focusMinutes: number;
  moodAvg: number | null;
}

export interface Heatmap {
  days: number;
  tasks: number[][];
  focusMinutes: number[][];
  peakHour: number | null;
  peakWeekday: number | null;
  weekdayTotals: number[];
  totalCompletions: number;
}

export interface Procrastination {
  days: number;
  tasksWithDueDate: number;
  onTimeRate: number | null;
  lateRate: number | null;
  index: number | null;
  avgLateHours: number | null;
  avgDaysToComplete: number | null;
  byPriority: { priority: Priority; withDue: number; late: number; lateRate: number | null }[];
  overdueOpen: number;
  oldestOverdue: { title: string; dueAt: string } | null;
  createdPerDay: number;
  completedPerDay: number;
}

export interface HabitInsight {
  habitId: string;
  name: string;
  icon: string | null;
  color: string | null;
  frequencyType: Frequency;
  currentStreak: number;
  longestStreak: number;
  unit: 'days' | 'weeks';
  completionRate30d: number;
  doneToday: boolean;
  dueToday: boolean;
  weekdayMissRate: (number | null)[];
  moodAvg: number | null;
  doneDays: string[];
  risk: { level: 'high' | 'medium'; reason: string } | null;
}

export interface Breakdown {
  days: number;
  tags: { tag: string; count: number }[];
  projects: { projectId: string | null; count: number }[];
  priorities: { priority: Priority; count: number }[];
}

export interface FocusStats {
  days: number;
  totalMinutes: number;
  sessions: number;
  completionRate: number | null;
  avgSessionMinutes: number | null;
}

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  days: { date: string; score: number; tasksCompleted: number; habitsDone: number; focusMinutes: number }[];
  totals: {
    tasksCompleted: number;
    tasksOnTime: number;
    focusMinutes: number;
    focusSessions: number;
    habitsDone: number;
    habitsDue: number;
    habitAdherence: number | null;
    averageScore: number;
    xpEarned: number;
  };
  previous: { tasksCompleted: number; focusMinutes: number; averageScore: number; habitAdherence: number | null };
  inProgress: boolean;
  comparedDays: number;
  bestDay: { date: string; weekday: string; score: number } | null;
  topTags: { tag: string; count: number }[];
  achievements: { code: string; title: string; icon: string }[];
  wins: string[];
  suggestions: string[];
  coachSummary: string;
  ai: { summary: string; provider: string; generatedAt: string } | null;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
  unlockedAt: string | null;
}

export interface Gamification extends LevelProgress {
  achievements: Achievement[];
  recentXp: { reason: string; delta: number; at: string }[];
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface InsightsConfig {
  ai: { enabled: boolean; provider: string; model: string | null };
  push: { enabled: boolean; vapidPublicKey: string | null };
}

export interface Problem {
  status: number;
  code: string;
  detail: string;
  errors?: Record<string, string>;
}
