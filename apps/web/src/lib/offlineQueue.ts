import type { NewTask } from '@/api/types';

/**
 * Offline quick-capture: tasks added without a connection are queued locally and sent as soon
 * as the device is back online, so an idea is never lost on a bad network.
 */
const KEY = 'trackly.offlineTasks';

function save(list: NewTask[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the task stays in memory for this session only.
  }
}

export function queueTask(task: NewTask) {
  const list = pending();
  list.push({ ...task, queuedAt: new Date().toISOString() } as NewTask);
  save(list);
}

export function pending(): NewTask[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as NewTask[];
  } catch {
    return [];
  }
}

/** Sends queued tasks one by one; anything that fails stays queued for the next attempt. */
export async function flushQueue(send: (t: NewTask) => Promise<unknown>): Promise<number> {
  const list = pending();
  if (list.length === 0) return 0;
  const remaining: NewTask[] = [];
  let sent = 0;
  for (const t of list) {
    const { queuedAt: _q, ...task } = t as NewTask & { queuedAt?: string };
    try {
      await send(task);
      sent++;
    } catch {
      remaining.push(t);
    }
  }
  save(remaining);
  return sent;
}
