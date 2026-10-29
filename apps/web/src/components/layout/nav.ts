import { ChartColumn, Goal, House, ListChecks, NotebookPen, Repeat, Settings, Timer, Trophy, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone's bottom bar; the rest live under "More". */
  primary?: boolean;
  shortcut?: string;
}

export const NAV: NavItem[] = [
  { to: '/app/today', label: 'Today', icon: House, primary: true, shortcut: 'g t' },
  { to: '/app/tasks', label: 'Tasks', icon: ListChecks, primary: true, shortcut: 'g k' },
  { to: '/app/habits', label: 'Habits', icon: Repeat, primary: true, shortcut: 'g h' },
  { to: '/app/focus', label: 'Focus', icon: Timer, primary: true, shortcut: 'g f' },
  { to: '/app/goals', label: 'Goals', icon: Goal, shortcut: 'g g' },
  { to: '/app/insights', label: 'Insights', icon: ChartColumn, shortcut: 'g i' },
  { to: '/app/review', label: 'Weekly review', icon: NotebookPen, shortcut: 'g r' },
  { to: '/app/achievements', label: 'Achievements', icon: Trophy, shortcut: 'g a' },
];

export const SETTINGS_NAV: NavItem = { to: '/app/settings', label: 'Settings', icon: Settings, shortcut: 'g s' };
