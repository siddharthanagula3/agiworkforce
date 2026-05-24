import { create } from 'zustand';

interface DirectoryStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useDirectoryStore = create<DirectoryStore>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
