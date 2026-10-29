import { CodeXml, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Stadium } from '@/components/charts/Stadium';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { API_URL, GITHUB_URL, INSIGHTS_URL } from '@/lib/platform';
import { useSession } from '@/stores/session';
import { startDemo } from './Auth';

const SPLITS = [
  { label: 'Tasks', detail: '5 of 6 planned', points: 29, max: 35 },
  { label: 'Habits', detail: '4 of 4 kept', points: 35, max: 35 },
  { label: 'Focus', detail: '50 of 60 min', points: 17, max: 20 },
  { label: 'On time', detail: '4 of 5 by the deadline', points: 8, max: 10 },
];

const COACH_NOTES = [
  'You usually skip Morning workout on Wednesdays (70% of the time). Today’s a Wednesday — do it before 9.',
  'Your peak hour is around 10 AM. You finish twice as much there as after lunch.',
  'On days you hit your focus goal, your mood averages 4.1/5, versus 3.2 when you don’t.',
  'You add about 6 tasks a day but finish 4. Plan 4 must-dos and keep the rest as a backlog.',
];

const FEATURES = [
  ['Tasks four ways', 'Board, list, calendar and a priority matrix over the same tasks, with subtasks and repeating tasks.'],
  ['Type it like you’d say it', '“Send invoice fri 5pm #work !high” becomes a task with a due date, tag and priority.'],
  ['Habits that forgive', 'Daily, specific days or X times a week. Streak freezes cover the odd missed day.'],
  ['Focus sessions', 'A Pomodoro timer linked to the task you’re working on. Every minute feeds your score.'],
  ['Goals that fill up', 'Link tasks and habits to a goal and watch its progress move as you work.'],
  ['A weekly review', 'Wins, slips and one concrete change for next week, written from your own numbers.'],
  ['Levels and achievements', 'XP for finishing things, 17 achievements, and a level that tracks your consistency.'],
  ['Live everywhere', 'Changes sync instantly across tabs and devices. Install it, use it offline, or get the Android app.'],
];

/** Wake the free-tier servers while the visitor reads, so the demo opens fast. */
function useWarmUp() {
  useEffect(() => {
    const ping = (url: string) => fetch(url, { mode: 'no-cors', cache: 'no-store' }).catch(() => undefined);
    void ping(`${API_URL}/actuator/health`);
    void ping(`${INSIGHTS_URL || ''}/api/v1/insights/config`);
  }, []);
}

export default function Landing() {
  useWarmUp();
  const navigate = useNavigate();
  const status = useSession((s) => s.status);
  const [starting, setStarting] = useState(false);

  const demo = async () => {
    setStarting(true);
    try {
      await startDemo();
      navigate('/app/today');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the demo');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          <a href={GITHUB_URL} className="hidden h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-ink-soft hover:text-ink sm:inline-flex">
            <CodeXml className="size-4" /> Source
          </a>
          {status === 'authenticated' ? (
            <Button asChild size="sm">
              <Link to="/app/today">Open Trackly</Link>
            </Button>
          ) : (
            <Button asChild variant="secondary" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </nav>
      </header>

      {/* Hero: the score lap is the most characteristic thing in Trackly's world. */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-10 pb-20 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:pt-16">
        <div>
          <h1 className="font-display text-[clamp(64px,11vw,128px)] leading-[0.86] text-track-deep dark:text-ink">
            Know your pace.
          </h1>
          <p className="mt-6 max-w-[34ch] text-lg text-ink-soft sm:text-xl">
            Trackly keeps your tasks, habits and focus time in one place, then shows you when you work best and what to
            fix next.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="volt" size="lg" onClick={() => void demo()} loading={starting}>
              Try the live demo
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link to="/register">Create a free account</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-ink-faint">The demo opens a private account with eight weeks of sample data.</p>
        </div>

        <div className="panel p-5 sm:p-7">
          <Stadium value={0.89} label="Example daily score: 89 out of 100">
            <span className="font-display text-[88px] leading-none num">89</span>
            <span className="text-sm font-semibold text-ink-soft">Outstanding</span>
          </Stadium>
          <table className="mt-6 w-full text-sm">
            <caption className="sr-only">How today's score is made</caption>
            <tbody>
              {SPLITS.map((s) => (
                <tr key={s.label} className="lane-t">
                  <th scope="row" className="py-2.5 text-left font-semibold">
                    {s.label}
                  </th>
                  <td className="py-2.5 text-ink-soft">{s.detail}</td>
                  <td className="py-2.5 text-right font-condensed font-bold num">
                    {s.points}
                    <span className="font-normal text-ink-faint">/{s.max}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-track-deep text-white dark:bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="font-display text-6xl">A coach that reads your week.</h2>
            <p className="mt-5 max-w-[42ch] text-white/75 dark:text-ink-soft">
              Every check-in, finished task and focus minute becomes a pattern. Trackly turns them into short, specific
              notes — no AI subscription needed.
            </p>
          </div>
          <ul className="space-y-4">
            {COACH_NOTES.map((n) => (
              <li key={n} className="border-l-2 border-volt pl-5 text-lg leading-relaxed text-white/90 dark:text-ink">
                {n}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <h2 className="font-display max-w-[16ch] text-6xl">Everything a busy week needs.</h2>
        <dl className="mt-12 grid gap-x-12 sm:grid-cols-2">
          {FEATURES.map(([title, body]) => (
            <div key={title} className="lane-t py-5">
              <dt className="text-lg font-bold">{title}</dt>
              <dd className="mt-1 max-w-[52ch] text-ink-soft">{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <div className="panel grid gap-8 p-6 sm:p-10 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-5xl">Built like production software.</h2>
            <p className="mt-4 text-ink-soft">
              Two services and an event stream, deployed on free tiers. Read the code, the API docs or the architecture
              notes.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="secondary">
                <a href={GITHUB_URL}>
                  <CodeXml className="size-4" /> View the source
                </a>
              </Button>
              <Button asChild variant="ghost">
                <a href={`${GITHUB_URL}/releases/latest`}>
                  <Smartphone className="size-4" /> Android app
                </a>
              </Button>
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-x-8 text-sm sm:grid-cols-2">
            {[
              ['Web app', 'React 19, TypeScript, TanStack Query, installable PWA'],
              ['Core API', 'Java 21, Spring Boot 4, Spring Security, JPA, Flyway'],
              ['Insights service', 'Node.js, TypeScript, Socket.IO, rule-based coach, optional AI'],
              ['Data', 'PostgreSQL with a transactional outbox between services'],
              ['Android', 'The same React code, packaged with Capacitor'],
              ['Delivery', 'GitHub Actions CI, Docker, Vercel and Render'],
            ].map(([k, v]) => (
              <div key={k} className="lane-t py-3">
                <dt className="font-semibold">{k}</dt>
                <dd className="text-ink-soft">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="border-t border-lane">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-ink-faint sm:px-8">
          <Logo compact />
          <p>Built by Hanumanth Raghavendra. Open source under the MIT licence.</p>
        </div>
      </footer>
    </div>
  );
}
