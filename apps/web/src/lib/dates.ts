import {
  addDays,
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isSameDay,
  parseISO,
  startOfWeek,
} from 'date-fns';

/** Local calendar day as YYYY-MM-DD (habit check-ins are per local day). */
export const dayKey = (d: Date = new Date()) => format(d, 'yyyy-MM-dd');

export const parseDay = (key: string) => parseISO(`${key}T00:00:00`);

export const mondayOf = (d: Date = new Date()) => startOfWeek(d, { weekStartsOn: 1 });

export const lastNDays = (n: number, end: Date = new Date()) =>
  Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));

export function dueLabel(dueAt: string | null, now = new Date()): { text: string; tone: 'overdue' | 'today' | 'soon' | 'later' } | null {
  if (!dueAt) return null;
  const due = parseISO(dueAt);
  const days = differenceInCalendarDays(due, now);
  const time = format(due, due.getMinutes() ? 'h:mm a' : 'h a');
  if (due < now && !isSameDay(due, now)) {
    const late = Math.abs(days);
    return { text: late === 1 ? 'Yesterday' : `${late} days late`, tone: 'overdue' };
  }
  if (isSameDay(due, now)) return { text: due < now ? `Was due ${time}` : `Today ${time}`, tone: due < now ? 'overdue' : 'today' };
  if (days === 1) return { text: `Tomorrow ${time}`, tone: 'soon' };
  if (days < 7) return { text: format(due, 'EEE h a'), tone: 'soon' };
  return { text: format(due, 'd MMM'), tone: 'later' };
}

export const ago = (iso: string) => formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });

export const shortDate = (key: string) => format(parseDay(key), 'd MMM');

export const weekdayShort = (key: string) => format(parseDay(key), 'EEEEE');

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const HOURS_LABEL = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
