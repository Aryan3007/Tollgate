import { create } from "zustand";
import type { Team } from "../schemas/team";

/** Which team form is open: creating a new team, or editing a snapshot of an existing one. */
export type TeamDrawer = { mode: "create" } | { mode: "edit"; team: Team } | null;

interface TeamsUiState {
  page: number;
  drawer: TeamDrawer;
  setPage: (page: number) => void;
  openCreate: () => void;
  openEdit: (team: Team) => void;
  closeDrawer: () => void;
}

export const useTeamsUiStore = create<TeamsUiState>((set) => ({
  page: 1,
  drawer: null,
  setPage: (page) => set({ page }),
  openCreate: () => set({ drawer: { mode: "create" } }),
  openEdit: (team) => set({ drawer: { mode: "edit", team } }),
  closeDrawer: () => set({ drawer: null }),
}));
