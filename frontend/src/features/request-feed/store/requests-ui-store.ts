import { create } from "zustand";

export type Outcome = "success" | "error" | undefined;

interface RequestsUiState {
  page: number;
  outcome: Outcome;
  setPage: (page: number) => void;
  setOutcome: (outcome: Outcome) => void;
}

export const useRequestsUiStore = create<RequestsUiState>((set) => ({
  page: 1,
  outcome: undefined,
  setPage: (page) => set({ page }),
  setOutcome: (outcome) => set({ outcome, page: 1 }),
}));
