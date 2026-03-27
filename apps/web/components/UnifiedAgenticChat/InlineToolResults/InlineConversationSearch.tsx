import { Clock3, Loader2, MessageSquareText, Search } from 'lucide-react';
import { useMemo } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import type { ToolResultProps } from './index';
import { useUnifiedChatStore } from '@/stores/unified/unifiedChatStore';

interface ConversationResultItem {
  conversation_id?: string | number;
  conversationId?: string | number;
  sessionId?: string | number;
  id?: string | number;
  conversation_title?: string | null;
  conversationTitle?: string | null;
  title?: string | null;
  content_snippet?: string;
  snippet?: string;
  content?: string;
  preview?: string;
  role?: string;
  created_at?: string;
  createdAt?: string;
}

interface ConversationSearchData {
  query?: string;
  count?: number;
  results?: ConversationResultItem[];
  matches?: ConversationResultItem[];
  conversations?: ConversationResultItem[];
  error?: string;
}

interface NormalizedConversationMatch {
  conversationId: string;
  title: string;
  snippet: string;
  role?: string;
  createdAt?: string;
}

function normalizeMatches(data?: ConversationSearchData): NormalizedConversationMatch[] {
  const rawItems = data?.results || data?.matches || data?.conversations || [];
  return rawItems.reduce<NormalizedConversationMatch[]>((matches, item) => {
    const conversationId = String(
      item.conversation_id ?? item.conversationId ?? item.sessionId ?? item.id ?? '',
    ).trim();
    const title =
      item.conversation_title?.trim() ||
      item.conversationTitle?.trim() ||
      item.title?.trim() ||
      'Untitled chat';
    const snippet =
      item.content_snippet?.trim() ||
      item.snippet?.trim() ||
      item.preview?.trim() ||
      item.content?.trim() ||
      '';
    if (!conversationId || !snippet) {
      return matches;
    }
    matches.push({
      conversationId,
      title,
      snippet,
      role: item.role,
      createdAt: item.created_at || item.createdAt,
    });
    return matches;
  }, []);
}

function formatRelativeTime(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export function InlineConversationSearch({ result, status }: ToolResultProps) {
  const data = result?.data as ConversationSearchData | undefined;
  const selectConversation = useUnifiedChatStore((state) => state.selectConversation);
  const matches = useMemo(() => normalizeMatches(data), [data]);

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/50 bg-surface-elevated p-3">
        <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
        <span className="text-sm text-muted-foreground">Finding relevant chats...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error' || data?.error) {
    return (
      <div className="mt-3 rounded-lg border border-destructive/30 bg-surface-elevated p-3">
        <div className="flex items-start gap-2">
          <Search className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-300">Chat search failed</p>
            <p className="mt-1 text-xs text-muted-foreground">{data?.error || result?.error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data || matches.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border/50 bg-surface-elevated">
      <div className="border-b border-border/30 bg-surface-overlay/30 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-violet-400" />
          <span className="text-xs font-medium text-muted-foreground">
            Relevant chats · {matches.length}
          </span>
        </div>
        {data.query && <p className="mt-1 text-xs text-muted-foreground">Query: {data.query}</p>}
      </div>

      <div className="divide-y divide-border/20">
        {matches.slice(0, 4).map((match) => {
          const relativeTime = formatRelativeTime(match.createdAt);
          return (
            <button
              key={`${match.conversationId}-${match.snippet.slice(0, 24)}`}
              type="button"
              onClick={() => selectConversation(match.conversationId)}
              className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-hover"
            >
              <div className="mt-0.5 rounded-lg bg-violet-500/10 p-2 text-violet-300">
                <MessageSquareText className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{match.title}</div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {match.snippet}
                </p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                  {match.role && <span className="capitalize">{match.role}</span>}
                  {relativeTime && (
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3 w-3" />
                      {relativeTime}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
