import { create } from "zustand";

interface NavState {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const useNavStore = create<NavState>((set) => ({
  mobileOpen: false,
  setMobileOpen: (mobileOpen) => set({ mobileOpen }),
}));
