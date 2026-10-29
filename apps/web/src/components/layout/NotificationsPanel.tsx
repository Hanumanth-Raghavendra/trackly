import { BellRing } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useClearNotifications, useMarkNotificationsRead, useNotifications } from '@/api/hooks';
import type { AppNotification } from '@/api/types';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { ago } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';

const LINKS: Record<string, string> = {
  habit_reminder: '/app/habits',
  task_due: '/app/today',
  daily_plan: '/app/today',
  achievement: '/app/achievements',
  level_up: '/app/achievements',
};

export function NotificationsPanel() {
  const open = useUi((s) => s.notificationsOpen);
  const setOpen = useUi((s) => s.setNotifications);
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const clear = useClearNotifications();
  const navigate = useNavigate();

  const go = (n: AppNotification) => {
    if (!n.read) markRead.mutate([n.id]);
    const to = LINKS[n.type];
    if (to) {
      setOpen(false);
      navigate(to);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Notifications"
      footer={
        data && data.items.length > 0 ? (
          <>
            <button className="mr-auto text-sm font-semibold text-ink-faint hover:text-signal" onClick={() => clear.mutate()}>
              Clear all
            </button>
            <button
              className="h-9 rounded-[var(--radius-control)] px-3 text-sm font-semibold text-track hover:bg-track-soft disabled:opacity-40"
              disabled={!data.unread}
              onClick={() => markRead.mutate(undefined)}
            >
              Mark all as read
            </button>
          </>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={<BellRing className="size-8" />}
          title="You're all caught up"
          body="Habit reminders, due-soon alerts and achievements show up here."
        />
      ) : (
        <ul className="-mx-2">
          {data.items.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => go(n)}
                className="flex w-full gap-3 rounded-[var(--radius-row)] px-2 py-3 text-left hover:bg-surface-2"
              >
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-track')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm', !n.read && 'font-semibold')}>{n.title}</span>
                  <span className="block text-sm text-ink-soft">{n.body}</span>
                  <span className="mt-0.5 block text-xs text-ink-faint">{ago(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
