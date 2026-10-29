import { create } from 'zustand';
import type { NewTask } from '@/api/types';

interface UiState {
  paletteOpen: boolean;
  quickAddOpen: boolean;
  quickAddDefaults: Partial<NewTask> | null;
  /** Task id being edited, or 'new' (with defaults) for the full editor. */
  taskEditor: { id: string | 'new'; defaults?: Partial<NewTask> } | null;
  habitEditor: { id: string | 'new' } | null;
  notificationsOpen: boolean;
  setPalette: (open: boolean) => void;
  openQuickAdd: (defaults?: Partial<NewTask>) => void;
  closeQuickAdd: () => void;
  openTask: (id: string | 'new', defaults?: Partial<NewTask>) => void;
  closeTask: () => void;
  openHabit: (id: string | 'new') => void;
  closeHabit: () => void;
  setNotifications: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  paletteOpen: false,
  quickAddOpen: false,
  quickAddDefaults: null,
  taskEditor: null,
  habitEditor: null,
  notificationsOpen: false,
  setPalette: (paletteOpen) => set({ paletteOpen }),
  openQuickAdd: (defaults) => set({ quickAddOpen: true, quickAddDefaults: defaults ?? null, paletteOpen: false }),
  closeQuickAdd: () => set({ quickAddOpen: false, quickAddDefaults: null }),
  openTask: (id, defaults) => set({ taskEditor: { id, defaults }, paletteOpen: false }),
  closeTask: () => set({ taskEditor: null }),
  openHabit: (id) => set({ habitEditor: { id }, paletteOpen: false }),
  closeHabit: () => set({ habitEditor: null }),
  setNotifications: (notificationsOpen) => set({ notificationsOpen }),
}));
