import { create } from 'zustand';
import type { User } from '@/api/types';

type Status = 'booting' | 'authenticated' | 'anonymous';

interface SessionState {
  status: Status;
  user: User | null;
  /** Kept in memory only — never in localStorage, so XSS can't read a long-lived credential. */
  accessToken: string | null;
  accessExpiresAt: number;
  /** True while a request is slow because a free-tier server is waking up. */
  waking: boolean;
  setSession: (user: User, accessToken: string, expiresIn: number) => void;
  setUser: (user: User) => void;
  clear: () => void;
  setWaking: (waking: boolean) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'booting',
  user: null,
  accessToken: null,
  accessExpiresAt: 0,
  waking: false,
  setSession: (user, accessToken, expiresIn) =>
    set({ status: 'authenticated', user, accessToken, accessExpiresAt: Date.now() + expiresIn * 1000 }),
  setUser: (user) => set({ user }),
  clear: () => set({ status: 'anonymous', user: null, accessToken: null, accessExpiresAt: 0 }),
  setWaking: (waking) => set({ waking }),
}));
