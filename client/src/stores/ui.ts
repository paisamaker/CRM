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

function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
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
      onRehydrateStorage: () => (state) => {
        // Prefer light theme for the redesign; migrate old "system" values
        const theme = state?.theme === 'dark' ? 'dark' : 'light';
        applyTheme(theme);
        if (state && state.theme !== theme) state.theme = theme;
      },
    }
  )
);

// Ensure light theme on first paint
if (typeof document !== 'undefined') {
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.add('light');
}
