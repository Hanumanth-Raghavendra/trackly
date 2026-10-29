import * as chrono from 'chrono-node';
import type { NewTask, Priority, Project, Recurrence } from '@/api/types';

/**
 * Natural-language quick add, parsed entirely on the device (free, instant, works offline):
 *
 *   "Submit report fri 5pm #work !high @Learning every week ~45m"
 *
 *   date/time  -> chrono-node ("tomorrow", "next mon 9am", "in 3 days")
 *   #tag       -> tags
 *   !priority  -> !low !med !high !urgent (or !1..!4)
 *   @project   -> matched against existing project names
 *   every ...  -> recurrence (day, weekday, week, month)
 *   ~45m / ~2h -> time estimate
 */
export interface ParsedTask extends NewTask {
  tokens: { kind: 'date' | 'tag' | 'priority' | 'project' | 'recurrence' | 'estimate'; text: string }[];
}

const PRIORITIES: Record<string, Priority> = {
  low: 'LOW', '4': 'LOW',
  med: 'MEDIUM', medium: 'MEDIUM', '3': 'MEDIUM',
  high: 'HIGH', '2': 'HIGH',
  urgent: 'URGENT', '1': 'URGENT',
};

const RECURRENCE: [RegExp, Recurrence][] = [
  [/\bevery\s*(?:day|daily)\b|\bdaily\b/i, 'DAILY'],
  [/\bevery\s*weekdays?\b|\bweekdays\b/i, 'WEEKDAYS'],
  [/\bevery\s*week\b|\bweekly\b/i, 'WEEKLY'],
  [/\bevery\s*month\b|\bmonthly\b/i, 'MONTHLY'],
];

export function parseQuickAdd(input: string, projects: Project[] = [], now = new Date()): ParsedTask {
  let text = ` ${input} `;
  const tokens: ParsedTask['tokens'] = [];
  const result: ParsedTask = { title: '', tokens };

  // Tags
  const tags: string[] = [];
  text = text.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_m, pre, tag: string) => {
    tags.push(tag.toLowerCase());
    tokens.push({ kind: 'tag', text: `#${tag}` });
    return pre;
  });
  if (tags.length) result.tags = tags;

  // Priority
  text = text.replace(/(^|\s)!(low|med|medium|high|urgent|[1-4])\b/i, (_m, pre, p: string) => {
    result.priority = PRIORITIES[p.toLowerCase()];
    tokens.push({ kind: 'priority', text: `!${p}` });
    return pre;
  });

  // Project (longest matching name wins, so "@Side project" beats "@Side")
  const sorted = [...projects].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const re = new RegExp(`(^|\\s)@${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i');
    if (re.test(text)) {
      text = text.replace(re, '$1');
      result.projectId = p.id;
      tokens.push({ kind: 'project', text: `@${p.name}` });
      break;
    }
  }

  // Estimate
  text = text.replace(/(^|\s)~(\d+)\s*(m|min|h|hr)\b/i, (_m, pre, n: string, unit: string) => {
    const minutes = Number(n) * (unit.toLowerCase().startsWith('h') ? 60 : 1);
    if (minutes > 0 && minutes <= 1440) {
      result.estimateMinutes = minutes;
      tokens.push({ kind: 'estimate', text: `~${n}${unit}` });
    }
    return pre;
  });

  // Recurrence
  for (const [re, rec] of RECURRENCE) {
    const m = text.match(re);
    if (m) {
      result.recurrence = rec;
      tokens.push({ kind: 'recurrence', text: m[0].trim() });
      text = text.replace(re, ' ');
      break;
    }
  }

  // Date/time
  const parsed = chrono.parse(text, now, { forwardDate: true })[0];
  if (parsed) {
    const date = parsed.start.date();
    if (!parsed.start.isCertain('hour')) date.setHours(18, 0, 0, 0); // a date without a time means "by end of day"
    result.dueAt = date.toISOString();
    tokens.push({ kind: 'date', text: parsed.text });
    text = text.slice(0, parsed.index) + text.slice(parsed.index + parsed.text.length);
  } else if (result.recurrence) {
    const first = new Date(now);
    first.setHours(18, 0, 0, 0);
    if (first < now) first.setDate(first.getDate() + 1);
    result.dueAt = first.toISOString();
  }

  result.title = text.replace(/\s+/g, ' ').trim();
  return result;
}
