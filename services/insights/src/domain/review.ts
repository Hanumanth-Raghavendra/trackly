import { parallel, type Queryable } from '../db.js';
import { addDays, daysBetween, WEEKDAY_NAMES, weekdayOf } from './dates.js';
import { dailyRows, type DayRow, type UserContext } from './analytics.js';
import { achievementByCode } from './gamification.js';

/** A Monday-to-Sunday review: numbers, comparisons, wins and suggestions (all rule-based). */
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
  /** True while the week is still running; comparisons then use the same days of last week. */
  inProgress: boolean;
  /** How many days of each week the comparison covers (7 for a finished week). */
  comparedDays: number;
  bestDay: { date: string; weekday: string; score: number } | null;
  topTags: { tag: string; count: number }[];
  achievements: { code: string; title: string; icon: string }[];
  wins: string[];
  suggestions: string[];
  coachSummary: string;
}

function totals(rows: DayRow[]) {
  const t = rows.reduce(
    (acc, r) => {
      acc.tasksCompleted += r.inputs.tasksCompleted;
      acc.tasksOnTime += r.inputs.tasksCompletedOnTime;
      acc.focusMinutes += r.inputs.focusMinutes;
      acc.focusSessions += r.focusSessions;
      acc.habitsDone += Math.min(r.inputs.habitsDone, r.inputs.habitsDue);
      acc.habitsDue += r.inputs.habitsDue;
      acc.scoreSum += r.score.score;
      return acc;
    },
    { tasksCompleted: 0, tasksOnTime: 0, focusMinutes: 0, focusSessions: 0, habitsDone: 0, habitsDue: 0, scoreSum: 0 },
  );
  return {
    ...t,
    habitAdherence: t.habitsDue ? Math.round((t.habitsDone / t.habitsDue) * 1000) / 1000 : null,
    averageScore: rows.length ? Math.round(t.scoreSum / rows.length) : 0,
  };
}

const change = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 100));

export async function buildWeeklyReview(q: Queryable, ctx: UserContext, weekStart: string, today: string): Promise<WeeklyReview> {
  const weekEnd = addDays(weekStart, 6);
  const lastDay = weekEnd < today ? weekEnd : today < weekStart ? weekStart : today; // don't score the future
  const inProgress = lastDay < weekEnd;
  // A week in progress is compared like-for-like: Mon-Thu against last Mon-Thu, not a full week.
  const comparedDays = daysBetween(weekStart, lastDay) + 1;
  const [rows, prevRows, xp, tags, achievements] = await parallel(q, [
    () => dailyRows(q, ctx, weekStart, lastDay),
    () => dailyRows(q, ctx, addDays(weekStart, -7), addDays(weekStart, comparedDays - 8)),
    () => q.query<{ xp: number }>(
      `SELECT coalesce(sum(delta), 0)::int AS xp FROM insights.xp_ledger
        WHERE user_id = $1 AND (earned_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`,
      [ctx.userId, ctx.timezone, weekStart, weekEnd],
    ),
    () => q.query<{ tag: string; n: number }>(
      `SELECT tag, count(*)::int AS n FROM insights.tasks, unnest(tags) AS tag
        WHERE user_id = $1 AND (completed_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
        GROUP BY tag ORDER BY n DESC, tag LIMIT 5`,
      [ctx.userId, ctx.timezone, weekStart, weekEnd],
    ),
    () => q.query<{ code: string }>(
      `SELECT code FROM insights.achievements
        WHERE user_id = $1 AND (unlocked_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
        ORDER BY unlocked_at`,
      [ctx.userId, ctx.timezone, weekStart, weekEnd],
    )]);

  const cur = totals(rows);
  const prev = totals(prevRows);
  const best = [...rows].sort((a, b) => b.score.score - a.score.score)[0];

  const wins: string[] = [];
  const suggestions: string[] = [];
  const taskChange = change(cur.tasksCompleted, prev.tasksCompleted);
  const focusChange = change(cur.focusMinutes, prev.focusMinutes);

  if (cur.tasksCompleted > 0) {
    wins.push(
      `Completed ${cur.tasksCompleted} task${cur.tasksCompleted === 1 ? '' : 's'}` +
        (taskChange !== null && taskChange > 0 ? ` — ${taskChange}% more than ${inProgress ? 'this time last week' : 'last week'}` : ''),
    );
  }
  if (cur.habitAdherence !== null && cur.habitAdherence >= 0.8) {
    wins.push(`Kept ${Math.round(cur.habitAdherence * 100)}% of your habit check-ins`);
  }
  if (cur.focusMinutes >= 60) {
    wins.push(
      `Focused for ${Math.floor(cur.focusMinutes / 60)}h ${cur.focusMinutes % 60}m` +
        (focusChange !== null && focusChange > 0 ? ` (+${focusChange}%)` : ''),
    );
  }
  if (best && best.score.score >= 70) {
    wins.push(`Best day: ${WEEKDAY_NAMES[weekdayOf(best.date) - 1]} with a score of ${best.score.score}`);
  }

  if (cur.habitAdherence !== null && cur.habitAdherence < 0.6) {
    suggestions.push('Habit adherence dipped — shrink one habit to a 2-minute version for a few days.');
  }
  if (focusChange !== null && focusChange <= -20) {
    suggestions.push(
      inProgress
        ? 'Focus time is behind last week. Block two 25-minute sessions in your calendar for the next few days.'
        : 'Focus time dropped. Block two 25-minute sessions in your calendar before Monday.',
    );
  }
  if (cur.tasksCompleted > 0 && cur.tasksOnTime / cur.tasksCompleted < 0.75) {
    suggestions.push('Several tasks finished late. Add due dates to the next step, not just the final deadline.');
  }
  // Today isn't over yet, so it can't count as an empty day.
  const zeroDays = rows.filter(
    (r) => r.date !== today && r.inputs.tasksCompleted + r.inputs.habitsDone + r.inputs.focusMinutes === 0,
  );
  if (zeroDays.length >= 2) {
    suggestions.push(`${zeroDays.length} days had no activity. Plan one tiny task for those days to keep momentum.`);
  }
  if (suggestions.length === 0) {
    suggestions.push(
      inProgress
        ? 'Keep this rhythm, and pick one stretch task that moves a goal forward before Sunday.'
        : 'Keep the same rhythm next week, and pick one stretch task that moves a goal forward.',
    );
  }

  const coachSummary =
    cur.tasksCompleted + cur.habitsDone + cur.focusMinutes === 0
      ? 'A quiet week. Start small: one task, one habit, one focus session — momentum builds from there.'
      : `You averaged a productivity score of ${cur.averageScore}` +
        (prev.averageScore ? ` (${inProgress ? 'same days last week' : 'last week'}: ${prev.averageScore})` : '') +
        `. ${wins[0] ? `Highlight: ${wins[0].charAt(0).toLowerCase()}${wins[0].slice(1)}.` : ''} ` +
        `${inProgress ? 'For the rest of the week' : 'Next week'}: ${suggestions[0]!.charAt(0).toLowerCase()}${suggestions[0]!.slice(1)}`;

  return {
    weekStart,
    weekEnd,
    days: rows.map((r) => ({
      date: r.date,
      score: r.score.score,
      tasksCompleted: r.inputs.tasksCompleted,
      habitsDone: r.inputs.habitsDone,
      focusMinutes: r.inputs.focusMinutes,
    })),
    totals: {
      tasksCompleted: cur.tasksCompleted,
      tasksOnTime: cur.tasksOnTime,
      focusMinutes: cur.focusMinutes,
      focusSessions: cur.focusSessions,
      habitsDone: cur.habitsDone,
      habitsDue: cur.habitsDue,
      habitAdherence: cur.habitAdherence,
      averageScore: cur.averageScore,
      xpEarned: xp.rows[0]?.xp ?? 0,
    },
    previous: {
      tasksCompleted: prev.tasksCompleted,
      focusMinutes: prev.focusMinutes,
      averageScore: prev.averageScore,
      habitAdherence: prev.habitAdherence,
    },
    inProgress,
    comparedDays,
    bestDay: best ? { date: best.date, weekday: WEEKDAY_NAMES[weekdayOf(best.date) - 1]!, score: best.score.score } : null,
    topTags: tags.rows.map((t) => ({ tag: t.tag, count: t.n })),
    achievements: achievements.rows
      .map((a) => achievementByCode(a.code))
      .filter((a) => a !== undefined)
      .map((a) => ({ code: a.code, title: a.title, icon: a.icon })),
    wins,
    suggestions,
    coachSummary: coachSummary.trim(),
  };
}
