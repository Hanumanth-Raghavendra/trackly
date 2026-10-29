import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { core, insights } from './client';
import type {
  Breakdown,
  Checkin,
  CompleteResult,
  FocusSession,
  FocusStats,
  Gamification,
  Goal,
  GoalStatus,
  Habit,
  HabitInput,
  HabitInsight,
  Heatmap,
  InsightCard,
  InsightsConfig,
  AppNotification,
  NewTask,
  Overview,
  Procrastination,
  Project,
  ScoreDay,
  Task,
  User,
  WeeklyReview,
} from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => count < 2 && (err as { status?: number }).status !== 401,
      refetchOnWindowFocus: true,
    },
  },
});

export const keys = {
  me: ['me'] as const,
  tasks: ['tasks'] as const,
  projects: ['projects'] as const,
  habits: ['habits'] as const,
  checkins: (from: string, to: string) => ['checkins', from, to] as const,
  goals: ['goals'] as const,
  focus: ['focus'] as const,
  overview: ['insights', 'overview'] as const,
  analytics: (name: string, days: number) => ['insights', 'analytics', name, days] as const,
  cards: ['insights', 'cards'] as const,
  review: (weekStart: string) => ['insights', 'review', weekStart] as const,
  gamification: ['insights', 'gamification'] as const,
  notifications: ['insights', 'notifications'] as const,
  config: ['insights-config'] as const,
};

/**
 * The insights service updates asynchronously from the outbox. Socket.IO "sync" events refresh
 * it in real time; this delayed invalidation is the fallback when sockets aren't connected.
 */
function refreshInsightsSoon(qc: QueryClient) {
  setTimeout(() => void qc.invalidateQueries({ queryKey: ['insights'] }), 1500);
}

// ---------------------------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------------------------

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => core.get<User>('/api/v1/users/me') });

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<User, 'displayName' | 'timezone' | 'focusGoalMinutes'>>) =>
      core.patch<User>('/api/v1/users/me', body),
    onSuccess: (user) => {
      qc.setQueryData(keys.me, user);
      refreshInsightsSoon(qc);
    },
  });
}

export const useChangePassword = () =>
  useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      core.put<void>('/api/v1/users/me/password', body),
  });

export const useDeleteAccount = () => useMutation({ mutationFn: () => core.del('/api/v1/users/me') });

// ---------------------------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------------------------

export const useTasks = () => useQuery({ queryKey: keys.tasks, queryFn: () => core.get<Task[]>('/api/v1/tasks') });

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (task: NewTask) => core.post<Task>('/api/v1/tasks', task),
    onSuccess: (task) => {
      qc.setQueryData<Task[]>(keys.tasks, (old) => (old ? [...old, task] : [task]));
      refreshInsightsSoon(qc);
    },
  });
}

/** Optimistic patch: the UI updates instantly and rolls back if the server says no. */
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Task> }) =>
      core.patch<CompleteResult>(`/api/v1/tasks/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: keys.tasks });
      const previous = qc.getQueryData<Task[]>(keys.tasks);
      qc.setQueryData<Task[]>(keys.tasks, (old) =>
        old?.map((t) =>
          t.id === id
            ? {
                ...t,
                ...patch,
                completedAt:
                  patch.status === 'DONE' ? new Date().toISOString() : patch.status ? null : t.completedAt,
              }
            : t,
        ),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(keys.tasks, ctx.previous),
    onSuccess: (res) => {
      qc.setQueryData<Task[]>(keys.tasks, (old) => {
        const list = old?.map((t) => (t.id === res.task.id ? res.task : t)) ?? [res.task];
        return res.nextOccurrence ? [...list, res.nextOccurrence] : list;
      });
      refreshInsightsSoon(qc);
      if (res.task.goalId) void qc.invalidateQueries({ queryKey: keys.goals });
    },
  });
}

export function useToggleTask() {
  const update = useUpdateTask();
  return {
    ...update,
    toggle: (task: Task) =>
      update.mutateAsync({ id: task.id, patch: { status: task.status === 'DONE' ? 'TODO' : 'DONE' } }),
  };
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => core.del(`/api/v1/tasks/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: keys.tasks });
      const previous = qc.getQueryData<Task[]>(keys.tasks);
      qc.setQueryData<Task[]>(keys.tasks, (old) => old?.filter((t) => t.id !== id && t.parentId !== id));
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(keys.tasks, ctx.previous),
    onSettled: () => refreshInsightsSoon(qc),
  });
}

// ---------------------------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------------------------

export const useProjects = () =>
  useQuery({ queryKey: keys.projects, queryFn: () => core.get<Project[]>('/api/v1/projects') });

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { name: string; color?: string }) => core.post<Project>('/api/v1/projects', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => core.del(`/api/v1/projects/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.projects });
      void qc.invalidateQueries({ queryKey: keys.tasks });
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------------------------

export const useHabits = (includeArchived = false) =>
  useQuery({
    queryKey: [...keys.habits, includeArchived],
    queryFn: () => core.get<Habit[]>(`/api/v1/habits?includeArchived=${includeArchived}`),
  });

export const useCheckins = (from: string, to: string) =>
  useQuery({
    queryKey: keys.checkins(from, to),
    queryFn: () => core.get<Checkin[]>(`/api/v1/habits/checkins?from=${from}&to=${to}`),
  });

function replaceHabit(qc: QueryClient, habit: Habit) {
  qc.setQueriesData<Habit[]>({ queryKey: keys.habits }, (old) => old?.map((h) => (h.id === habit.id ? habit : h)));
}

export function useCreateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (h: HabitInput) => core.post<Habit>('/api/v1/habits', h),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.habits });
      refreshInsightsSoon(qc);
    },
  });
}

export function useUpdateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      core.patch<Habit>(`/api/v1/habits/${id}`, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.habits });
      refreshInsightsSoon(qc);
    },
  });
}

export function useDeleteHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => core.del(`/api/v1/habits/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.habits });
      refreshInsightsSoon(qc);
    },
  });
}

/** Check in / undo with an optimistic flip so the tap feels instant. */
export function useHabitCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ habit, day, done, mood }: { habit: Habit; day: string; done: boolean; mood?: number }) =>
      done
        ? core.put<Habit>(`/api/v1/habits/${habit.id}/checkins/${day}`, mood ? { mood } : {})
        : core.del<Habit>(`/api/v1/habits/${habit.id}/checkins/${day}`),
    onMutate: async ({ habit, day, done }) => {
      await qc.cancelQueries({ queryKey: keys.habits });
      const snapshot = qc.getQueriesData<Habit[]>({ queryKey: keys.habits });
      qc.setQueriesData<Habit[]>({ queryKey: keys.habits }, (old) =>
        old?.map((h) =>
          h.id !== habit.id
            ? h
            : {
                ...h,
                recentCheckins: done
                  ? [...new Set([...h.recentCheckins, day])].sort()
                  : h.recentCheckins.filter((d) => d !== day),
              },
        ),
      );
      return { snapshot };
    },
    onError: (_e, _v, ctx) => ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSuccess: (habit) => {
      replaceHabit(qc, habit);
      void qc.invalidateQueries({ queryKey: ['checkins'] });
      void qc.invalidateQueries({ queryKey: keys.goals });
      refreshInsightsSoon(qc);
    },
  });
}

export function useFreezeDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ habitId, day }: { habitId: string; day: string }) =>
      core.post<Habit>(`/api/v1/habits/${habitId}/freeze/${day}`),
    onSuccess: (habit) => {
      replaceHabit(qc, habit);
      refreshInsightsSoon(qc);
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Goals & focus
// ---------------------------------------------------------------------------------------------

export const useGoals = () => useQuery({ queryKey: keys.goals, queryFn: () => core.get<Goal[]>('/api/v1/goals') });

export function useSaveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
      id ? core.patch<Goal>(`/api/v1/goals/${id}`, body) : core.post<Goal>('/api/v1/goals', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.goals });
      refreshInsightsSoon(qc);
    },
  });
}

export function useSetGoalStatus() {
  const save = useSaveGoal();
  return (id: string, status: GoalStatus) => save.mutateAsync({ id, body: { status } });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => core.del(`/api/v1/goals/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.goals });
      void qc.invalidateQueries({ queryKey: keys.tasks });
      void qc.invalidateQueries({ queryKey: keys.habits });
    },
  });
}

export const useFocusSessions = () =>
  useQuery({ queryKey: keys.focus, queryFn: () => core.get<FocusSession[]>('/api/v1/focus/sessions') });

export function useRecordFocus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: {
      taskId: string | null;
      startedAt: string;
      endedAt: string;
      plannedMinutes: number;
      completed: boolean;
      note?: string;
    }) => core.post<FocusSession>('/api/v1/focus/sessions', s),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.focus });
      refreshInsightsSoon(qc);
    },
  });
}

export function useDeleteFocus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => core.del(`/api/v1/focus/sessions/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.focus });
      refreshInsightsSoon(qc);
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------------------------

export const useInsightsConfig = () =>
  useQuery({
    queryKey: keys.config,
    queryFn: () => insights.get<InsightsConfig>('/config'),
    staleTime: 10 * 60_000,
  });

export const useOverview = () =>
  useQuery({ queryKey: keys.overview, queryFn: () => insights.get<Overview>('/overview') });

export const useScores = (days: number) =>
  useQuery({
    queryKey: keys.analytics('scores', days),
    queryFn: () => insights.get<ScoreDay[]>(`/analytics/scores?days=${days}`),
  });

export const useHeatmap = (days: number) =>
  useQuery({
    queryKey: keys.analytics('heatmap', days),
    queryFn: () => insights.get<Heatmap>(`/analytics/heatmap?days=${days}`),
  });

export const useProcrastination = (days: number) =>
  useQuery({
    queryKey: keys.analytics('procrastination', days),
    queryFn: () => insights.get<Procrastination>(`/analytics/procrastination?days=${days}`),
  });

export const useHabitInsights = (days: number) =>
  useQuery({
    queryKey: keys.analytics('habits', days),
    queryFn: () => insights.get<HabitInsight[]>(`/analytics/habits?days=${days}`),
  });

export const useBreakdown = (days: number) =>
  useQuery({
    queryKey: keys.analytics('breakdown', days),
    queryFn: () => insights.get<Breakdown>(`/analytics/breakdown?days=${days}`),
  });

export const useFocusStats = (days: number) =>
  useQuery({
    queryKey: keys.analytics('focus', days),
    queryFn: () => insights.get<FocusStats>(`/analytics/focus?days=${days}`),
  });

export const useInsightCards = () =>
  useQuery({ queryKey: keys.cards, queryFn: () => insights.get<InsightCard[]>('/insights') });

export const useWeeklyReview = (weekStart: string) =>
  useQuery({
    queryKey: keys.review(weekStart),
    queryFn: () => insights.get<WeeklyReview>(`/reviews/weekly?weekStart=${weekStart}`),
  });

export function useAiWeeklySummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (weekStart: string) =>
      insights.post<{ summary: string; provider: string }>('/ai/weekly-summary', { weekStart }),
    onSuccess: (_d, weekStart) => qc.invalidateQueries({ queryKey: keys.review(weekStart) }),
  });
}

export const useAiBreakdown = () =>
  useMutation({
    mutationFn: (body: { title: string; description?: string }) =>
      insights.post<{ subtasks: string[]; provider: string }>('/ai/breakdown', body),
  });

export const useGamification = () =>
  useQuery({ queryKey: keys.gamification, queryFn: () => insights.get<Gamification>('/gamification') });

export const useNotifications = () =>
  useQuery({
    queryKey: keys.notifications,
    queryFn: () => insights.get<{ items: AppNotification[]; unread: number }>('/notifications'),
  });

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => insights.post<void>('/notifications/read', ids ? { ids } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

export function useClearNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => insights.del('/notifications'),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}
