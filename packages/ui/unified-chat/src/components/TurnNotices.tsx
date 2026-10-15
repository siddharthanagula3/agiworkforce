import { Info, X } from 'lucide-react';
import { create } from 'zustand';
import { useUiTranslation } from '@agiworkforce/ui';
import { cn } from '../lib/utils';

const MAX_NOTICES_PER_CONVERSATION = 3;

interface TurnNoticeStore {
  byConversation: Record<string, string[]>;
  add: (conversationId: string, message: string) => void;
  dismiss: (conversationId: string, message: string) => void;
  clear: (conversationId: string) => void;
}

export const useTurnNoticeStore = create<TurnNoticeStore>()((set) => ({
  byConversation: {},
  add: (conversationId, message) =>
    set((state) => {
      const current = state.byConversation[conversationId] ?? [];
      if (current.includes(message)) return state;
      return {
        byConversation: {
          ...state.byConversation,
          [conversationId]: [...current, message].slice(-MAX_NOTICES_PER_CONVERSATION),
        },
      };
    }),
  dismiss: (conversationId, message) =>
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: (state.byConversation[conversationId] ?? []).filter(
          (notice) => notice !== message,
        ),
      },
    })),
  clear: (conversationId) =>
    set((state) => {
      if (!state.byConversation[conversationId]) return state;
      const byConversation = { ...state.byConversation };
      delete byConversation[conversationId];
      return { byConversation };
    }),
}));

const EMPTY: string[] = [];

export interface TurnNoticesProps {
  conversationId: string | null;
  className?: string;
}

/** Things the running turn needs the user to know, such as a tool plan mode refused. */
export function TurnNotices({ conversationId, className }: TurnNoticesProps) {
  const { t } = useUiTranslation('chat');
  const notices = useTurnNoticeStore((state) =>
    conversationId ? (state.byConversation[conversationId] ?? EMPTY) : EMPTY,
  );
  const dismiss = useTurnNoticeStore((state) => state.dismiss);
  if (!conversationId || notices.length === 0) return null;

  return (
    <div className={cn('mb-2 space-y-1', className)}>
      {notices.map((notice) => (
        <div
          key={notice}
          role="status"
          className="flex items-center gap-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-3 py-1.5"
        >
          <Info
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 text-[var(--chat-text-secondary)]"
          />
          <p className="min-w-0 flex-1 text-sm text-[var(--chat-text-secondary)]">{notice}</p>
          <button
            type="button"
            aria-label={t('notices.dismiss', 'Dismiss')}
            onClick={() => dismiss(conversationId, notice)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
