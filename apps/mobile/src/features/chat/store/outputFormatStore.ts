import { create } from 'zustand';
import type { ChatOutputFormat } from '@agiworkforce/cloud-contracts';

interface OutputFormatState {
  format: ChatOutputFormat | null;
  setFormat: (format: ChatOutputFormat | null) => void;
}

export const useOutputFormatStore = create<OutputFormatState>((set) => ({
  format: null,
  setFormat: (format) => set({ format }),
}));
