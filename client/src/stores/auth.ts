import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'ceo' | 'manager' | 'finance' | 'employee';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department?: string;
  avatar?: string;
  mfaEnabled?: boolean;
  phone?: string;
  designation?: string;
  employeeId?: string;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  permissions: Record<string, string[]> | null;
  isRestoring: boolean;
  setSession: (token: string, user: AuthUser, permissions?: Record<string, string[]>) => void;
  setRestoring: (isRestoring: boolean) => void;
  updateUser: (fields: Partial<AuthUser>) => void;
  setPermissions: (permissions: Record<string, string[]>) => void;
  clearSession: () => void;
  can: (resource: string, action: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      permissions: null,
      isRestoring: true,
      setSession: (accessToken, user, permissions) =>
        set((s) => ({
          accessToken,
          user,
          permissions: permissions !== undefined ? permissions : s.permissions,
          isRestoring: false,
        })),
      setRestoring: (isRestoring) => set({ isRestoring }),
      updateUser: (fields) => set((s) => ({ user: s.user ? { ...s.user, ...fields } : null })),
      setPermissions: (permissions) => set({ permissions }),
      clearSession: () => set({ accessToken: null, user: null, permissions: null, isRestoring: false }),
      can: (resource, action) => {
        const { user, permissions } = get();
        if (!user) return false;
        if (user.role === 'ceo') return true;
        return !!permissions?.[resource]?.includes(action);
      },
    }),
    {
      name: 'sm-auth',
      partialize: (s) => ({ accessToken: s.accessToken, user: s.user, permissions: s.permissions }),
    }
  )
);
