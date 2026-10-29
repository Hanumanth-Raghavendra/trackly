import { Command } from 'cmdk';
import { CircleCheck, Moon, Plus, Repeat, Sun, Timer } from 'lucide-react';
import { Dialog as RDialog } from 'radix-ui';
import { useNavigate } from 'react-router';
import { useTasks } from '@/api/hooks';
import { isDark, setTheme } from '@/lib/theme';
import { useUi } from '@/stores/ui';
import { NAV, SETTINGS_NAV } from './nav';

const itemClass =
  'flex h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-sm aria-selected:bg-track-soft aria-selected:text-ink [&_svg]:size-4 [&_svg]:text-ink-faint';

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const { setPalette, openQuickAdd, openTask, openHabit } = useUi();
  const navigate = useNavigate();
  const { data: tasks } = useTasks();
  const openTasks = (tasks ?? []).filter((t) => t.status !== 'DONE' && !t.parentId);

  const run = (fn: () => void) => {
    setPalette(false);
    fn();
  };

  return (
    <RDialog.Root open={open} onOpenChange={setPalette}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-[#0a1230]/45 backdrop-blur-[2px]" />
        <RDialog.Content className="fixed top-[10vh] left-1/2 z-50 w-[calc(100%-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-[var(--radius-panel)] border border-lane bg-surface text-ink shadow-2xl animate-rise">
          <RDialog.Title className="sr-only">Command palette</RDialog.Title>
          <RDialog.Description className="sr-only">Search tasks, pages and actions</RDialog.Description>
          <Command label="Command palette" loop>
            <Command.Input
              autoFocus
              placeholder="Type a command or search tasks…"
              className="h-14 w-full border-b border-lane bg-transparent px-5 text-[15px] outline-none placeholder:text-ink-faint"
            />
            <Command.List className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-ink-faint">Nothing matches that.</Command.Empty>
              <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-faint">
                <Command.Item className={itemClass} onSelect={() => run(() => openQuickAdd())}>
                  <Plus /> Add a task
                </Command.Item>
                <Command.Item className={itemClass} onSelect={() => run(() => openHabit('new'))}>
                  <Repeat /> Create a habit
                </Command.Item>
                <Command.Item className={itemClass} onSelect={() => run(() => navigate('/app/focus'))}>
                  <Timer /> Start a focus session
                </Command.Item>
                <Command.Item className={itemClass} onSelect={() => run(() => setTheme(isDark() ? 'light' : 'dark'))}>
                  {isDark() ? <Sun /> : <Moon />} Switch to {isDark() ? 'light' : 'dark'} theme
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-faint">
                {[...NAV, SETTINGS_NAV].map((n) => (
                  <Command.Item key={n.to} className={itemClass} onSelect={() => run(() => navigate(n.to))}>
                    <n.icon /> {n.label}
                    {n.shortcut && <span className="ml-auto text-xs text-ink-faint">{n.shortcut}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
              {openTasks.length > 0 && (
                <Command.Group heading="Open tasks" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-faint">
                  {openTasks.slice(0, 200).map((t) => (
                    <Command.Item key={t.id} value={`task ${t.title} ${t.tags.join(' ')}`} className={itemClass} onSelect={() => run(() => openTask(t.id))}>
                      <CircleCheck /> <span className="truncate">{t.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
