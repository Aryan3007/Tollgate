import { create } from "zustand";
import type { KeyStatus, VirtualKey } from "../schemas/key";

interface KeysUiState {
  page: number;
  status: KeyStatus | undefined;
  createOpen: boolean;
  revokeTarget: VirtualKey | null;
  /** Key shown in the detail drawer. */
  selectedKeyId: string | null;
  setPage: (page: number) => void;
  setStatus: (status: KeyStatus | undefined) => void;
  setCreateOpen: (open: boolean) => void;
  setRevokeTarget: (key: VirtualKey | null) => void;
  setSelectedKeyId: (id: string | null) => void;
}

export const useKeysUiStore = create<KeysUiState>((set) => ({
  page: 1,
  status: undefined,
  createOpen: false,
  revokeTarget: null,
  selectedKeyId: null,
  setPage: (page) => set({ page }),
  // A new filter has different pages, so start from the first.
  setStatus: (status) => set({ status, page: 1 }),
  setCreateOpen: (createOpen) => set({ createOpen }),
  setRevokeTarget: (revokeTarget) => set({ revokeTarget }),
  setSelectedKeyId: (selectedKeyId) => set({ selectedKeyId }),
}));
