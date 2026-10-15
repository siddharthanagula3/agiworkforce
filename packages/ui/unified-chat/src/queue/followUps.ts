import { create } from 'zustand';

/**
 * What a message sent while a reply is running does. `steer` hands it to the
 * running turn, which reads it at its next step; `queue` holds it until the
 * turn ends. The setting lives in the chat settings store under the key the
 * web chat uses for the same choice.
 */
export type FollowUpQueueMode = 'steer' | 'queue';

export type FollowUpState = 'queued' | 'steering';

export interface FollowUp<Args extends unknown[] = unknown[]> {
  id: string;
  content: string;
  state: FollowUpState;
  /** Send arguments captured when the follow-up was written. */
  args: Args;
  /** Runtime id of a steered message, once the runtime accepted it. */
  steerId?: string;
  /**
   * Why this follow-up was not sent. While set it is never sent on its own:
   * the user sends it again, edits it or removes it.
   */
  heldReason?: string;
}

interface FollowUpStore {
  byConversation: Record<string, FollowUp[]>;
  /** Conversations whose queue waits for the user after a stop or a failure. */
  held: Record<string, true>;

  add: (conversationId: string, followUp: FollowUp) => void;
  update: (conversationId: string, id: string, patch: Partial<FollowUp>) => void;
  remove: (conversationId: string, id: string) => void;
  hold: (conversationId: string) => void;
  release: (conversationId: string) => void;
}

export const useFollowUpStore = create<FollowUpStore>()((set) => ({
  byConversation: {},
  held: {},

  add: (conversationId, followUp) =>
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: [...(state.byConversation[conversationId] ?? []), followUp],
      },
    })),

  update: (conversationId, id, patch) =>
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: (state.byConversation[conversationId] ?? []).map((followUp) =>
          followUp.id === id ? { ...followUp, ...patch } : followUp,
        ),
      },
    })),

  remove: (conversationId, id) =>
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: (state.byConversation[conversationId] ?? []).filter(
          (followUp) => followUp.id !== id,
        ),
      },
    })),

  hold: (conversationId) => set((state) => ({ held: { ...state.held, [conversationId]: true } })),

  release: (conversationId) =>
    set((state) => {
      if (!state.held[conversationId]) return state;
      const held = { ...state.held };
      delete held[conversationId];
      return { held };
    }),
}));

/**
 * Whether a follow-up written now steers or queues. `invert` is the one-message
 * override (Cmd/Ctrl+Shift+Enter). A follow-up the runtime cannot steer, or one
 * that carries attachments, always queues.
 */
export function resolveFollowUpState(
  mode: FollowUpQueueMode,
  invert: boolean,
  canSteer: boolean,
): FollowUpState {
  const wantsSteer = (mode === 'steer') !== invert;
  return wantsSteer && canSteer ? 'steering' : 'queued';
}

export function getFollowUps(conversationId: string | null): FollowUp[] {
  if (!conversationId) return [];
  return useFollowUpStore.getState().byConversation[conversationId] ?? [];
}
