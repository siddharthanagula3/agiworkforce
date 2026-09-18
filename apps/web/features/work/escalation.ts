'use client';

import { create } from 'zustand';
import type { CloudWorkMode } from '@agiworkforce/types';

export const WORK_ESCALATION_MIN_CONFIDENCE = 0.8;

export interface WorkIntentSignal {
  type: string;
  confidence: number;
}

export interface WorkEscalation {
  objective: string;
  signal: WorkIntentSignal;
  /** Set once the mode has actually changed, which is what the notice reports. */
  applied: boolean;
}

interface WorkEscalationState {
  byConversation: Record<string, WorkEscalation>;
  keptInChat: Record<string, true>;
  propose: (conversationId: string | null, escalation: Omit<WorkEscalation, 'applied'>) => void;
  markApplied: (conversationId: string | null) => void;
  keepInChat: (conversationId: string | null) => void;
  dismiss: (conversationId: string | null) => void;
}

const PENDING_KEY = '__new_conversation__';

function key(conversationId: string | null): string {
  return conversationId ?? PENDING_KEY;
}

/**
 * A classification is a routing hint, not consent. Escalation is proposed only
 * above the confidence threshold, never for a conversation already running as
 * Work, and never again once the person chose to stay in Chat.
 */
export function shouldEscalateToWork(
  signal: WorkIntentSignal,
  workMode: CloudWorkMode,
  keptInChat: boolean,
): boolean {
  if (workMode === 'agiwork' || keptInChat) return false;
  return signal.type === 'agentic' && signal.confidence >= WORK_ESCALATION_MIN_CONFIDENCE;
}

export const useWorkEscalationStore = create<WorkEscalationState>((set) => ({
  byConversation: {},
  keptInChat: {},
  propose: (conversationId, escalation) =>
    set((state) => {
      const id = key(conversationId);
      if (state.keptInChat[id]) return state;
      return {
        byConversation: { ...state.byConversation, [id]: { ...escalation, applied: false } },
      };
    }),
  markApplied: (conversationId) =>
    set((state) => {
      const id = key(conversationId);
      const current = state.byConversation[id];
      if (!current) return state;
      return { byConversation: { ...state.byConversation, [id]: { ...current, applied: true } } };
    }),
  keepInChat: (conversationId) =>
    set((state) => {
      const id = key(conversationId);
      const { [id]: _dropped, ...byConversation } = state.byConversation;
      return { byConversation, keptInChat: { ...state.keptInChat, [id]: true } };
    }),
  dismiss: (conversationId) =>
    set((state) => {
      const id = key(conversationId);
      if (!(id in state.byConversation)) return state;
      const { [id]: _dropped, ...byConversation } = state.byConversation;
      return { byConversation };
    }),
}));

export function selectWorkEscalation(conversationId: string | null) {
  return (state: WorkEscalationState): WorkEscalation | null =>
    state.byConversation[key(conversationId)] ?? null;
}

export function selectKeptInChat(conversationId: string | null) {
  return (state: WorkEscalationState): boolean => state.keptInChat[key(conversationId)] === true;
}
