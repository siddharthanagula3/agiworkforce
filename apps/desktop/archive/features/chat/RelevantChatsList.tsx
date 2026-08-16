import { ChevronDown, MessageSquare, Clock } from 'lucide-react';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import {
  useChatStore,
  selectConversations,
  selectActiveConversationId,
} from '../../stores/chat/chatStore';

interface RelevantChatsListProps {
  maxItems?: number;
  className?: string;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function RelevantChatsList({ maxItems = 5, className }: RelevantChatsListProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const conversations = useChatStore(selectConversations);
  const activeConversationId = useChatStore(selectActiveConversationId);
  const selectConversationFn = useChatStore((s) => s.selectConversation);

  const recent = useMemo(
    () =>
      conversations
        .filter((c) => !c.archived && c.id !== activeConversationId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, maxItems),
    [conversations, activeConversationId, maxItems],
  );

  if (recent.length === 0) return null;

  return (
    <div className={cn('my-3 rounded-lg border border-border/30 overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={isExpanded}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <motion.div animate={{ rotate: isExpanded ? 0 : -90 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="w-3 h-3" />
        </motion.div>
        <MessageSquare className="w-3 h-3" />
        <span className="font-medium">Relevant chats</span>
        <span className="ml-auto text-muted-foreground/60">{recent.length} results</span>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/20 divide-y divide-border/10">
              {recent.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => selectConversationFn(conv.id)}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/20 transition-colors group"
                >
                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                    <MessageSquare className="h-2.5 w-2.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground/85 truncate">
                        {conv.title || 'Untitled'}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 shrink-0">
                        <Clock className="h-2.5 w-2.5" />
                        {formatRelativeTime(conv.updatedAt)}
                      </span>
                    </div>
                    {conv.lastMessage && (
                      <span className="text-[11px] text-muted-foreground truncate block mt-0.5">
                        {conv.lastMessage}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
