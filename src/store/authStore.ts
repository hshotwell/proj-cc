'use client';

import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  username?: string;
  isEmailVerified?: boolean;
}

interface AuthStore {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
      isLoading: false,
    }),

  setLoading: (isLoading) => set({ isLoading }),

  clearAuth: () =>
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    }),
}));
