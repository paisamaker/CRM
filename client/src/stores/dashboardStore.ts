import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DashboardState {
  ceoData: Record<string, any>;
  employeeData: any | null;
  lastFetchedAt: Record<string, number>;
  setCeoData: (range: string, data: any) => void;
  setEmployeeData: (data: any) => void;
  clearDashboardCache: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      ceoData: {},
      employeeData: null,
      lastFetchedAt: {},
      setCeoData: (range, data) =>
        set((state) => ({
          ceoData: { ...state.ceoData, [range]: data },
          lastFetchedAt: { ...state.lastFetchedAt, [`ceo_${range}`]: Date.now() },
        })),
      setEmployeeData: (data) =>
        set((state) => ({
          employeeData: data,
          lastFetchedAt: { ...state.lastFetchedAt, employee: Date.now() },
        })),
      clearDashboardCache: () => set({ ceoData: {}, employeeData: {}, lastFetchedAt: {} }),
    }),
    {
      name: 'sm-dashboard-cache',
      partialize: (s) => ({
        ceoData: s.ceoData,
        employeeData: s.employeeData,
      }),
    }
  )
);
