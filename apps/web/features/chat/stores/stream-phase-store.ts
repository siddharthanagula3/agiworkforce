import { create } from 'zustand';

export type StreamPhase = 'reconnecting' | 'stopping';

interface StreamPhaseState {
  phases: Readonly<Record<string, StreamPhase>>;
  setPhase: (messageId: string, phase: StreamPhase | null) => void;
}

export const useStreamPhaseStore = create<StreamPhaseState>()((set) => ({
  phases: {},
  setPhase: (messageId, phase) =>
    set((state) => {
      if ((state.phases[messageId] ?? null) === phase) return state;
      const phases: Record<string, StreamPhase> = { ...state.phases };
      if (phase) phases[messageId] = phase;
      else delete phases[messageId];
      return { phases };
    }),
}));

export function beginStreamPhase(messageId: string, phase: StreamPhase): void {
  useStreamPhaseStore.getState().setPhase(messageId, phase);
}

export function endStreamPhase(messageId: string, phase: StreamPhase): void {
  const store = useStreamPhaseStore.getState();
  if (store.phases[messageId] === phase) store.setPhase(messageId, null);
}
