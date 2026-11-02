import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_SYSTEM_PROMPT, type Expectation } from "../presets";
import type { CallStats } from "../schemas/playground";

export interface Entry {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  /** Assistant message still arriving. */
  pending?: boolean;
  stats?: CallStats;
  /** The reply arrived but the gateway sent no stats (an older gateway build, or a proxy stripping headers). */
  statsMissing?: boolean;
  /** Set for scenario steps: what should have happened, and whether it did. */
  expect?: Expectation;
  why?: string;
  met?: boolean;
}

interface PlaygroundState {
  key: string;
  model: string;
  temperature: string;
  maxTokens: string;
  systemPrompt: string;
  stream: boolean;
  /** Send earlier messages with each request. Off by default so each question can hit the cache. */
  remember: boolean;
  entries: Entry[];
  running: boolean;
  /** Title and 1-based step of the scenario being run. */
  progress: { title: string; step: number; total: number } | null;
  set: (
    patch: Partial<Omit<PlaygroundState, "set" | "update" | "clear">>,
  ) => void;
  update: (id: string, patch: Partial<Entry>) => void;
  clear: () => void;
}

export const usePlaygroundStore = create<PlaygroundState>()(
  persist(
    (set) => ({
      key: "",
      model: "",
      temperature: "0",
      maxTokens: "256",
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      stream: true,
      remember: false,
      entries: [],
      running: false,
      progress: null,
      set: (patch) => set(patch),
      update: (id, patch) =>
        set((state) => ({
          entries: state.entries.map((e) =>
            e.id === id ? { ...e, ...patch } : e,
          ),
        })),
      clear: () => set({ entries: [] }),
    }),
    {
      name: "tollgate-playground",
      // Per-tab: the key is gone when the tab closes, and is never written to localStorage.
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ key: state.key }),
      // Rehydrated after mount so the first client render matches the server's.
      skipHydration: true,
    },
  ),
);
