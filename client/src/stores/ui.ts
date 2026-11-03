import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  theme: 'light' | 'dark';
  commandOpen: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  setMobileNavOpen: (v: boolean) => void;
  setTheme: (t: 'light' | 'dark') => void;
  setCommandOpen: (v: boolean) => void;
  toggleTheme: () => void;
}

export function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      theme: 'light',
      commandOpen: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        set({ theme: next });
      },
    }),
    {
      name: 'sm-ui',
      partialize: (s) => ({
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
      onRehydrateStorage: () => (state) => {
        const theme = state?.theme === 'dark' ? 'dark' : 'light';
        applyTheme(theme);
        if (state && state.theme !== theme) state.theme = theme;
      },
    }
  )
);

/** Apply persisted theme ASAP to avoid a light flash before rehydrate */
if (typeof document !== 'undefined') {
  try {
    const raw = localStorage.getItem('sm-ui');
    const parsed = raw ? (JSON.parse(raw) as { state?: { theme?: string } }) : null;
    const theme = parsed?.state?.theme === 'dark' ? 'dark' : 'light';
    applyTheme(theme);
  } catch {
    applyTheme('light');
  }
}
