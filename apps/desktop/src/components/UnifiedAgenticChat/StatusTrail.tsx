import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Search, Code, Play, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useUnifiedChatStore, type ActionTrailEntry } from '../../stores/unifiedChatStore';

interface StatusTrailProps {
  messageId?: string;
  className?: string;
}

function getIconForType(type: ActionTrailEntry['type']) {
  switch (type) {
    case 'thinking':
      return <Brain className="w-4 h-4 animate-pulse" />;
    case 'searching':
      return <Search className="w-4 h-4 animate-pulse" />;
    case 'coding':
      return <Code className="w-4 h-4 animate-pulse" />;
    case 'running':
      return <Loader2 className="w-4 h-4 animate-spin" />;
    case 'completed':
      return <CheckCircle className="w-4 h-4" />;
    case 'error':
      return <XCircle className="w-4 h-4" />;
    default:
      return <Play className="w-4 h-4" />;
  }
}

function getColorForType(type: ActionTrailEntry['type']) {
  switch (type) {
    case 'thinking':
      return 'text-agent-thinking';
    case 'searching':
      return 'text-teal';
    case 'coding':
      return 'text-agent-active';
    case 'running':
      return 'text-agent-warning';
    case 'completed':
      return 'text-agent-success';
    case 'error':
      return 'text-agent-error';
    default:
      return 'text-zinc-400';
  }
}

interface StatusTrailItemProps {
  entry: ActionTrailEntry;
}

function StatusTrailItem({ entry }: StatusTrailItemProps) {
  const isInProgress = ['thinking', 'searching', 'coding', 'running'].includes(entry.type);
  const isCompleted = entry.type === 'completed';
  const isError = entry.type === 'error';

  return (
    <motion.div
      initial={{ opacity: 0, x: -10, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -10, scale: 0.95 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 25,
      }}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg',
        'bg-zinc-800/50 backdrop-blur-sm',
        'border border-white/5',
        isCompleted && 'bg-emerald-900/20 border-emerald-500/20',
        isError && 'bg-rose-900/20 border-rose-500/20',
      )}
      role="status"
      aria-label={`${entry.type}: ${entry.message}`}
      aria-live={isInProgress ? 'polite' : 'off'}
    >
      <span className={cn('shrink-0', getColorForType(entry.type))}>
        {getIconForType(entry.type)}
      </span>
      <span className={cn('text-sm font-medium', getColorForType(entry.type))}>
        {entry.message}
      </span>
    </motion.div>
  );
}

export function StatusTrail({ messageId, className }: StatusTrailProps) {
  const getActiveActionTrail = useUnifiedChatStore((state) => state.getActiveActionTrail);
  const actionTrail = getActiveActionTrail(messageId);

  // Only show if there are active trail entries
  if (actionTrail.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute -top-20 left-0 right-0',
        'flex flex-col gap-2',
        'px-4 py-2',
        className,
      )}
      role="region"
      aria-label="Action status trail"
    >
      <AnimatePresence mode="popLayout">
        {actionTrail.map((entry) => (
          <StatusTrailItem key={entry.id} entry={entry} />
        ))}
      </AnimatePresence>
    </div>
  );
}

// Floating variant that attaches to a specific element
interface FloatingStatusTrailProps {
  messageId?: string;
  className?: string;
}

export function FloatingStatusTrail({ messageId, className }: FloatingStatusTrailProps) {
  const getActiveActionTrail = useUnifiedChatStore((state) => state.getActiveActionTrail);
  const actionTrail = getActiveActionTrail(messageId);

  // Only show if there are active trail entries
  if (actionTrail.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'fixed top-20 right-6 z-40',
        'w-80 max-w-[calc(100vw-3rem)]',
        'flex flex-col gap-2',
        'p-4 rounded-xl',
        'bg-zinc-900/90 backdrop-blur-xl',
        'border border-white/10',
        'shadow-2xl',
        className,
      )}
      role="region"
      aria-label="Floating action status trail"
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Agent Activity
        </h4>
        <span className="text-xs text-zinc-500">{actionTrail.length} active</span>
      </div>
      <AnimatePresence mode="popLayout">
        {actionTrail.map((entry) => (
          <StatusTrailItem key={entry.id} entry={entry} />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
