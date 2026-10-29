import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { NAV, SETTINGS_NAV } from '@/components/layout/nav';
import { useUi } from '@/stores/ui';

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);

/**
 * Keyboard shortcuts: Ctrl/Cmd+K palette, Q quick add, and "g then letter" navigation
 * (g t = Today, g k = Tasks, g h = Habits ...), the same pattern as GitHub and Linear.
 */
export function useHotkeys() {
  const navigate = useNavigate();

  useEffect(() => {
    let pendingG = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setPalette(!ui.paletteOpen);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
      if (ui.paletteOpen || ui.quickAddOpen || ui.taskEditor || ui.habitEditor) return;

      if (pendingG) {
        pendingG = false;
        const target = [...NAV, SETTINGS_NAV].find((n) => n.shortcut === `g ${e.key.toLowerCase()}`);
        if (target) {
          e.preventDefault();
          navigate(target.to);
        }
        return;
      }
      if (e.key === 'g') {
        pendingG = true;
        if (gTimer) clearTimeout(gTimer);
        gTimer = setTimeout(() => (pendingG = false), 1000);
        return;
      }
      if (e.key === 'q' || e.key === 'n') {
        e.preventDefault();
        ui.openQuickAdd();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
