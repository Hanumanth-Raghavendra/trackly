import { format, parseISO } from 'date-fns';
import { Lock } from 'lucide-react';
import { useGamification } from '@/api/hooks';
import { Stadium } from '@/components/charts/Stadium';
import { Skeleton } from '@/components/ui/misc';
import { ago } from '@/lib/dates';
import { cn } from '@/lib/utils';

const TIER_RING = { bronze: 'ring-[#b7791f]', silver: 'ring-[#94a3b8]', gold: 'ring-[#d4a106]' } as const;
const TIER_LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' } as const;

export default function Achievements() {
  const { data: g, isLoading } = useGamification();
  if (isLoading || !g) return <Skeleton className="h-96" />;
  const unlocked = g.achievements.filter((a) => a.unlockedAt).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-5xl sm:text-6xl">Achievements</h1>
        <p className="text-sm text-ink-soft">
          {unlocked} of {g.achievements.length} unlocked. XP comes from finishing tasks, keeping habits and focusing.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="panel p-6 lg:sticky lg:top-24 lg:self-start" aria-label="Your level">
          <Stadium value={g.progress} label={`Level ${g.level}, ${Math.round(g.progress * 100)}% to level ${g.level + 1}`}>
            <span className="text-sm font-semibold text-ink-soft">Level</span>
            <span className="font-display text-[88px] leading-none num">{g.level}</span>
            <span className="text-sm font-semibold text-ink-soft">{g.title}</span>
          </Stadium>
          <p className="mt-5 text-center text-sm text-ink-soft">
            <span className="font-semibold text-ink num">{g.nextLevelXp - g.xp} XP</span> to level {g.level + 1}. Total{' '}
            <span className="num">{g.xp.toLocaleString()}</span> XP.
          </p>
          {g.recentXp.length > 0 && (
            <div className="lane-t mt-5 pt-4">
              <h2 className="mb-2 text-sm font-bold">Recent XP</h2>
              <ul className="space-y-1.5 text-sm">
                {g.recentXp.slice(0, 6).map((x, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="text-ink-soft">
                      {x.reason} <span className="text-ink-faint">{ago(x.at)}</span>
                    </span>
                    <span className="font-semibold num">+{x.delta}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="badges">
          <h2 id="badges" className="sr-only">
            Badges
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {g.achievements.map((a) => {
              const got = !!a.unlockedAt;
              return (
                <li
                  key={a.code}
                  className={cn('flex flex-col items-center rounded-[var(--radius-row)] border p-4 text-center', got ? 'border-lane bg-surface' : 'border-dashed border-lane-strong bg-transparent')}
                >
                  <span
                    className={cn('grid size-14 place-items-center rounded-full text-2xl', got ? `bg-surface-2 ring-2 ${TIER_RING[a.tier]}` : 'bg-surface-2 grayscale opacity-60')}
                    aria-hidden
                  >
                    {got ? a.icon : <Lock className="size-5 text-ink-faint" />}
                  </span>
                  <p className={cn('mt-3 text-sm font-bold', !got && 'text-ink-soft')}>{a.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{a.description}</p>
                  <p className="mt-2 text-[11px] text-ink-faint">
                    {got ? `${TIER_LABEL[a.tier]}, ${format(parseISO(a.unlockedAt!), 'd MMM yyyy')}` : `${TIER_LABEL[a.tier]}, locked`}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
