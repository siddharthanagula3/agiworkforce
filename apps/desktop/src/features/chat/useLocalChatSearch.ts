import { useEffect, useState } from 'react';
import { SEARCH_INPUT_DEBOUNCE_MS } from '@agiworkforce/utils';
import { invoke } from '../../lib/tauri-mock';
import { resolveDesktopChatOwnerId } from '../../stores/chat/chatStore';

/** A message the native full-text index matched, as `search_chat_history` returns it. */
export interface LocalChatSearchHit {
  message_id: number;
  conversation_id: number;
  conversation_title: string | null;
  content_snippet: string;
  role: string;
  created_at: string;
  rank: number;
}

/** FTS5 matches whole tokens; shorter queries match too much to be useful. */
export const LOCAL_CHAT_SEARCH_MIN_CHARS = 3;

const NO_HITS: LocalChatSearchHit[] = [];

interface LocalChatSearchState {
  query: string;
  hits: LocalChatSearchHit[];
  error: string | null;
}

/**
 * The one full-text search over Local chat history. It reads only the signed-in
 * owner's Local conversations, so Managed Cloud chats synced into the same
 * database never surface in a Local search.
 */
export function useLocalChatSearch(
  query: string,
  { enabled, limit }: { enabled: boolean; limit: number },
): { hits: LocalChatSearchHit[]; loading: boolean; error: string | null } {
  const normalized = query.trim();
  const active = enabled && normalized.length >= LOCAL_CHAT_SEARCH_MIN_CHARS;
  const [state, setState] = useState<LocalChatSearchState | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void invoke<LocalChatSearchHit[]>('search_chat_history', {
        query: normalized,
        limit,
        userId: resolveDesktopChatOwnerId(),
        appMode: 'local',
      })
        .then((hits) => {
          if (!cancelled) setState({ query: normalized, hits, error: null });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setState({
            query: normalized,
            hits: [],
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }, SEARCH_INPUT_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, normalized, limit]);

  if (!active) return { hits: NO_HITS, loading: false, error: null };
  if (state?.query !== normalized) return { hits: NO_HITS, loading: true, error: null };
  return { hits: state.hits, loading: false, error: state.error };
}
