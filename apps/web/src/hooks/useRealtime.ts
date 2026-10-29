import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { keys } from '@/api/hooks';
import { SOCKET_URL } from '@/lib/platform';
import { useSession } from '@/stores/session';

const ENTITY_KEYS: Record<string, readonly unknown[][]> = {
  tasks: [keys.tasks as unknown as unknown[]],
  habits: [keys.habits as unknown as unknown[], ['checkins']],
  focus: [keys.focus as unknown as unknown[]],
  goals: [keys.goals as unknown as unknown[]],
  user: [keys.me as unknown as unknown[]],
  insights: [['insights']],
};

/** Hidden tabs let go of the socket so free-tier servers (and the database) can sleep. */
const HIDDEN_DISCONNECT_MS = 2 * 60 * 1000;

/**
 * Live sync across tabs and devices: the insights service emits "sync" after it processes
 * changes, and we refetch exactly the data that changed. Also shows XP and achievement toasts.
 */
export function useRealtime() {
  const qc = useQueryClient();
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const socket: Socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: (cb) => cb({ token: useSession.getState().accessToken }),
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 30_000,
    });

    socket.on('sync', ({ entities }: { entities: string[] }) => {
      for (const e of entities) {
        for (const key of ENTITY_KEYS[e] ?? []) void qc.invalidateQueries({ queryKey: key });
      }
    });
    socket.on('xp', (x: { delta: number; reason: string }) => {
      if (x.delta > 0) toast(`+${x.delta} XP`, { description: x.reason, duration: 1800, id: 'xp' });
    });
    socket.on('achievement', (a: { title: string; description: string; icon: string }) => {
      toast.success(`${a.icon} ${a.title}`, { description: a.description, duration: 6000 });
      void qc.invalidateQueries({ queryKey: keys.gamification });
    });
    socket.on('level_up', (l: { level: number; title: string }) => {
      toast.success(`Level ${l.level} — ${l.title}`, { description: 'New level reached. Keep the pace.', duration: 6000 });
    });
    socket.on('notification', () => void qc.invalidateQueries({ queryKey: keys.notifications }));
    socket.on('connect_error', () => {
      // The access token may have expired between reconnects; the next refresh fixes it.
    });

    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenTimer = setTimeout(() => socket.disconnect(), HIDDEN_DISCONNECT_MS);
      } else {
        if (hiddenTimer) clearTimeout(hiddenTimer);
        if (socket.disconnected) {
          socket.connect();
          void qc.invalidateQueries();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      socket.disconnect();
    };
  }, [status, qc]);
}
