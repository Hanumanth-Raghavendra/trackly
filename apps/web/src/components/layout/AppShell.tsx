import { Bell, CloudOff, Ellipsis, LogOut, Monitor, Moon, Plus, Search, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useCreateTask, useGamification, useNotifications } from '@/api/hooks';
import { logout } from '@/api/client';
import { Dialog } from '@/components/ui/dialog';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Kbd, LaneBar } from '@/components/ui/misc';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useRealtime } from '@/hooks/useRealtime';
import { flushQueue } from '@/lib/offlineQueue';
import { setTheme, useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useSession } from '@/stores/session';
import { useUi } from '@/stores/ui';
import { CommandPalette } from './CommandPalette';
import { LogoMark, Logo } from './Logo';
import { NAV, SETTINGS_NAV } from './nav';
import { NotificationsPanel } from './NotificationsPanel';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { HabitEditor } from '@/components/habits/HabitEditor';

function SideNav() {
  const { data: g } = useGamification();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-lane bg-surface lg:flex">
      <Link to="/app/today" className="flex h-16 items-center px-5" aria-label="Trackly home">
        <Logo />
      </Link>
      <nav className="flex-1 px-3 py-2" aria-label="Main">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'group relative flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[14px] font-semibold text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink',
                isActive && 'bg-track-soft text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden
                  className={cn('absolute top-2 bottom-2 left-0 w-1 rounded-full bg-transparent', isActive && 'bg-track')}
                />
                <item.icon className={cn('size-[18px]', isActive ? 'text-track' : 'text-ink-faint group-hover:text-ink-soft')} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-lane p-3">
        {g && (
          <Link to="/app/achievements" className="mb-2 block rounded-[var(--radius-row)] px-3 py-2.5 hover:bg-surface-2">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="font-display text-xl">Level {g.level}</span>
              <span className="text-xs text-ink-faint num">
                {g.xp - g.levelStartXp}/{g.nextLevelXp - g.levelStartXp} XP
              </span>
            </div>
            <LaneBar value={g.progress} label={`Progress to level ${g.level + 1}`} />
            <p className="mt-1.5 text-xs text-ink-faint">{g.title}</p>
          </Link>
        )}
        <NavLink
          to={SETTINGS_NAV.to}
          className={({ isActive }) =>
            cn(
              'flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[14px] font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink',
              isActive && 'bg-track-soft text-ink',
            )
          }
        >
          <SETTINGS_NAV.icon className="size-[18px] text-ink-faint" />
          Settings
        </NavLink>
      </div>
    </aside>
  );
}

function BottomNav() {
  const [more, setMore] = useState(false);
  const location = useLocation();
  const primary = NAV.filter((n) => n.primary);
  const secondary = [...NAV.filter((n) => !n.primary), SETTINGS_NAV];
  const inMore = secondary.some((n) => location.pathname.startsWith(n.to));

  return (
    <>
      <nav
        aria-label="Main"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-lane bg-surface/95 backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {primary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold', isActive ? 'text-track' : 'text-ink-faint')
              }
            >
              <item.icon className="size-[22px]" />
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={() => setMore(true)}
            className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold', inMore ? 'text-track' : 'text-ink-faint')}
          >
            <Ellipsis className="size-[22px]" />
            More
          </button>
        </div>
      </nav>
      <Dialog open={more} onOpenChange={setMore} title="More">
        <div className="grid grid-cols-2 gap-2">
          {secondary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMore(false)}
              className={({ isActive }) =>
                cn(
                  'flex h-20 flex-col items-start justify-between rounded-[var(--radius-row)] border border-lane p-3 text-sm font-semibold',
                  isActive && 'border-track bg-track-soft',
                )
              }
            >
              <item.icon className="size-5 text-track" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </Dialog>
    </>
  );
}

function ThemeMenuItems() {
  const theme = useTheme();
  const options = [
    { value: 'light' as const, label: 'Light', icon: <Sun /> },
    { value: 'dark' as const, label: 'Dark', icon: <Moon /> },
    { value: 'system' as const, label: 'Match device', icon: <Monitor /> },
  ];
  return (
    <>
      <MenuLabel>Appearance</MenuLabel>
      {options.map((o) => (
        <MenuItem key={o.value} icon={o.icon} onSelect={() => setTheme(o.value)}>
          <span className="flex-1">{o.label}</span>
          {theme === o.value && <span className="size-2 rounded-full bg-track" aria-label="selected" />}
        </MenuItem>
      ))}
    </>
  );
}

function TopBar() {
  const user = useSession((s) => s.user);
  const navigate = useNavigate();
  const { setPalette, openQuickAdd, setNotifications } = useUi();
  const { data: notifications } = useNotifications();
  const unread = notifications?.unread ?? 0;
  const initials = (user?.displayName ?? '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className="safe-top sticky top-0 z-20 border-b border-lane bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link to="/app/today" className="lg:hidden" aria-label="Trackly home">
          <LogoMark />
        </Link>
        <button
          onClick={() => setPalette(true)}
          className="ml-1 flex h-9 flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-lane bg-surface px-3 text-left text-sm text-ink-faint hover:border-lane-strong sm:max-w-sm"
        >
          <Search className="size-4" />
          <span className="flex-1 truncate">Search or jump to…</span>
          <span className="hidden items-center gap-1 sm:flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <div className="flex-1 max-sm:hidden" />
        <button
          onClick={() => openQuickAdd()}
          className="hidden h-9 items-center gap-1.5 rounded-[var(--radius-control)] bg-track px-3 text-sm font-semibold text-white hover:brightness-110 sm:inline-flex dark:text-bg"
        >
          <Plus className="size-4" />
          Add task
          <Kbd>Q</Kbd>
        </button>
        <button
          onClick={() => setNotifications(true)}
          className="relative grid size-9 place-items-center rounded-[var(--radius-control)] text-ink-soft hover:bg-surface-2"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-signal px-1 text-[10px] font-bold text-white num">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        <Menu>
          <MenuTrigger
            className="grid size-9 place-items-center rounded-full bg-track-deep text-[13px] font-bold text-white dark:bg-track dark:text-bg"
            aria-label="Account menu"
          >
            {initials}
          </MenuTrigger>
          <MenuContent>
            <div className="px-2.5 py-2">
              <p className="truncate font-semibold">{user?.displayName}</p>
              <p className="truncate text-xs text-ink-faint">{user?.demo ? 'Demo account' : user?.email}</p>
            </div>
            <MenuSeparator />
            <ThemeMenuItems />
            <MenuSeparator />
            <MenuItem onSelect={() => navigate('/app/settings')}>Settings</MenuItem>
            <MenuItem
              icon={<LogOut />}
              onSelect={async () => {
                await logout();
                navigate('/login');
              }}
            >
              Sign out
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}

function StatusBanners() {
  const waking = useSession((s) => s.waking);
  const demo = useSession((s) => s.user?.demo);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <div aria-live="polite">
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-ink px-4 py-2 text-center text-[13px] text-bg">
          <CloudOff className="size-4" />
          You're offline. Quick-added tasks are saved on this device and sync when you reconnect.
        </div>
      )}
      {online && waking && (
        <div className="bg-amber-soft px-4 py-2 text-center text-[13px] text-ink">
          Waking up the free server. The first request after a quiet spell takes up to a minute.
        </div>
      )}
      {demo && (
        <div className="bg-volt px-4 py-2 text-center text-[13px] font-medium text-[#101b45]">
          You're exploring a demo account with eight weeks of sample data. It's deleted after 24 hours.{' '}
          <Link to="/register" className="font-bold underline underline-offset-2">
            Create your own account
          </Link>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  useRealtime();
  useHotkeys();
  const createTask = useCreateTask();
  const { taskEditor, habitEditor } = useUi();
  const location = useLocation();

  // Send tasks captured offline as soon as we're back online.
  useEffect(() => {
    const flush = () =>
      void flushQueue((t) => createTask.mutateAsync(t)).then((n) => {
        if (n) toast.success(`Synced ${n} task${n === 1 ? '' : 's'} added while offline`);
      });
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh bg-bg">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusBanners />
        <TopBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 sm:px-6 lg:pb-12">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <button
        onClick={() => useUi.getState().openQuickAdd()}
        className="fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-full bg-track text-white shadow-lg shadow-track/30 sm:hidden dark:text-bg"
        aria-label="Add task"
      >
        <Plus className="size-6" />
      </button>
      <CommandPalette />
      <QuickAdd />
      <NotificationsPanel />
      {taskEditor && <TaskEditor key={taskEditor.id} />}
      {habitEditor && <HabitEditor key={habitEditor.id} />}
    </div>
  );
}
