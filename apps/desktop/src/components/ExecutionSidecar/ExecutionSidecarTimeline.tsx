import { useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, X, Wrench, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useToolStore, type ToolStreamStateEntry } from '../../stores/chat/toolStore';
import { useChatStore } from '../../stores/chat/chatStore';
import { useExecutionSidecarStore } from '../../stores/executionSidecarStore';
import type { ToolLabelEntry } from '../UnifiedAgenticChat/ToolLabel';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface TimelineEntryProps {
  entry: ToolLabelEntry;
  onClickEntry: (id: string) => void;
}

function TimelineEntry({ entry, onClickEntry }: TimelineEntryProps) {
  const isRunning = entry.status === 'running';
  const isError = entry.status === 'error';

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={() => onClickEntry(entry.id)}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono text-left transition-colors',
        'hover:bg-white/5',
        isError ? 'text-red-400' : 'text-muted-foreground',
      )}
    >
      {/* Status icon */}
      {isRunning ? (
        <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-full w-full rounded-full bg-violet-500/40 animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-400" />
        </span>
      ) : isError ? (
        <X className="w-3 h-3 text-red-400 shrink-0" />
      ) : (
        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
      )}

      {/* Tool icon */}
      <Wrench className="w-3 h-3 shrink-0" />

      {/* Tool name and args */}
      <span className="truncate flex-1 min-w-0">
        <span className="text-foreground/80">{entry.displayName}</span>
        {entry.displayArgs && (
          <span className="text-muted-foreground/70">({entry.displayArgs})</span>
        )}
        {isRunning && <span className="text-violet-400">...</span>}
      </span>

      {/* Duration */}
      {entry.durationMs != null && !isRunning && (
        <span className="text-muted-foreground/50 tabular-nums shrink-0 text-[10px]">
          {formatDuration(entry.durationMs)}
        </span>
      )}
    </motion.button>
  );
}

function ActiveStreamEntry({ stream }: { stream: ToolStreamStateEntry }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-mono text-muted-foreground">
      <Loader2 className="w-3 h-3 animate-spin text-violet-400 shrink-0" />
      <Wrench className="w-3 h-3 shrink-0" />
      <span className="truncate flex-1 min-w-0 text-foreground/80">{stream.tool_name}</span>
      {stream.progress > 0 && (
        <span className="text-[10px] text-violet-400/80 tabular-nums shrink-0">
          {stream.progress}%
        </span>
      )}
    </div>
  );
}

export function ExecutionSidecarTimeline() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const setHighlightedToolId = useExecutionSidecarStore((s) => s.setHighlightedToolId);
  const toolTimelineByMessage = useChatStore((s) => s.toolTimelineByMessage);
  const activeToolStreams = useToolStore((s) => s.activeToolStreams);

  // Flatten all tool timeline entries from all messages, ordered by message
  const allEntries = useMemo(() => {
    const entries: ToolLabelEntry[] = [];
    const byMessage = toolTimelineByMessage;
    for (const messageId of Object.keys(byMessage)) {
      const messageEntries = byMessage[messageId];
      if (messageEntries) {
        entries.push(...messageEntries);
      }
    }
    return entries;
  }, [toolTimelineByMessage]);

  // Active streams that do not yet have timeline entries
  const orphanStreams = useMemo(() => {
    const entryIds = new Set(allEntries.map((e) => e.id));
    return Array.from(activeToolStreams.values()).filter(
      (s) => s.status === 'running' && !entryIds.has(s.tool_id),
    );
  }, [activeToolStreams, allEntries]);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [allEntries.length, orphanStreams.length]);

  const handleClickEntry = (toolId: string) => {
    setHighlightedToolId(toolId);
  };

  if (allEntries.length === 0 && orphanStreams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 text-xs gap-2 px-4">
        <Clock className="w-5 h-5" />
        <span>No tool executions yet</span>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-2 space-y-0.5">
      <AnimatePresence initial={false}>
        {allEntries.map((entry) => (
          <TimelineEntry key={entry.id} entry={entry} onClickEntry={handleClickEntry} />
        ))}
      </AnimatePresence>
      {orphanStreams.map((stream) => (
        <ActiveStreamEntry key={stream.tool_id} stream={stream} />
      ))}
    </div>
  );
}
