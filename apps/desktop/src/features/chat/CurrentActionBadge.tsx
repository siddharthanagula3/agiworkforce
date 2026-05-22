import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Search,
  Code,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  Wrench,
  Terminal,
  FileEdit,
  Globe,
  Camera,
  FileText,
  FolderOpen,
  GitBranch,
  Database,
  Image,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useUnifiedChatStore, type ActionTrailEntry } from '../../stores/unifiedChatStore';

const TOOL_ICON_MAP: Record<string, LucideIcon> = {
  Read: FileText,
  Write: FileText,
  Edit: FileEdit,
  LS: FolderOpen,
  Search: Search,
  Bash: Terminal,
  WebSearch: Globe,
  WebFetch: Globe,
  Git: GitBranch,
  Memory: Database,
  ImageGen: Image,
};

function getIcon(entry: ActionTrailEntry) {
  // Prefer display name from tool events (populated by the tool:event listener)
  const displayName = entry.metadata?.['displayName'] as string | undefined;
  if (displayName) {
    const IconComponent = TOOL_ICON_MAP[displayName] ?? Wrench;
    return <IconComponent className="w-3.5 h-3.5" />;
  }

  // Fall back to existing keyword-based matching on the message string
  const lowerMessage = entry.message?.toLowerCase() ?? '';
  if (lowerMessage.includes('screenshot') || lowerMessage.includes('capture')) {
    return <Camera className="w-3.5 h-3.5" />;
  }
  if (lowerMessage.includes('terminal') || lowerMessage.includes('command')) {
    return <Terminal className="w-3.5 h-3.5" />;
  }
  if (lowerMessage.includes('file') || lowerMessage.includes('edit')) {
    return <FileEdit className="w-3.5 h-3.5" />;
  }
  if (
    lowerMessage.includes('browse') ||
    lowerMessage.includes('web') ||
    lowerMessage.includes('url')
  ) {
    return <Globe className="w-3.5 h-3.5" />;
  }
  if (lowerMessage.includes('mcp') || lowerMessage.includes('tool')) {
    return <Wrench className="w-3.5 h-3.5" />;
  }

  switch (entry.type) {
    case 'thinking':
      return <Brain className="w-3.5 h-3.5" />;
    case 'searching':
      return <Search className="w-3.5 h-3.5" />;
    case 'coding':
      return <Code className="w-3.5 h-3.5" />;
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
    case 'completed':
      return <CheckCircle className="w-3.5 h-3.5" />;
    case 'error':
      return <XCircle className="w-3.5 h-3.5" />;
    default:
      return <Play className="w-3.5 h-3.5" />;
  }
}

function getColorClasses(type: ActionTrailEntry['type']) {
  switch (type) {
    case 'thinking':
      return {
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/30',
        text: 'text-purple-400',
        icon: 'text-purple-400',
      };
    case 'searching':
      return {
        bg: 'bg-teal-500/10',
        border: 'border-teal-500/30',
        text: 'text-teal-400',
        icon: 'text-teal-400',
      };
    case 'coding':
      return {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        text: 'text-blue-400',
        icon: 'text-blue-400',
      };
    case 'running':
      return {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        text: 'text-amber-400',
        icon: 'text-amber-400',
      };
    case 'completed':
      return {
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        text: 'text-emerald-400',
        icon: 'text-emerald-400',
      };
    case 'error':
      return {
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/30',
        text: 'text-rose-400',
        icon: 'text-rose-400',
      };
    default:
      return {
        bg: 'bg-muted-foreground/10',
        border: 'border-muted-foreground/30',
        text: 'text-muted-foreground',
        icon: 'text-muted-foreground',
      };
  }
}

interface CurrentActionBadgeProps {
  className?: string;
}

/**
 * A compact current action indicator that shows the most recent active action
 * Designed to be displayed in the chat header area for always-visible status
 */
export function CurrentActionBadge({ className }: CurrentActionBadgeProps) {
  const getActiveActionTrail = useUnifiedChatStore((state) => state.getActiveActionTrail);
  const actionTrail = getActiveActionTrail();
  const recentFirstTrail = [...actionTrail].reverse();

  // Get the most recent active action (running, thinking, searching, coding)
  const activeAction = recentFirstTrail.find((entry) =>
    ['thinking', 'searching', 'coding', 'running'].includes(entry.type),
  );

  // Also show recently completed actions for 3 seconds
  const recentCompleted = recentFirstTrail.find(
    (entry) =>
      entry.type === 'completed' && Date.now() - new Date(entry.timestamp).getTime() < 3000,
  );

  const displayAction = activeAction || recentCompleted;

  return (
    <AnimatePresence mode="wait">
      {displayAction && (
        <motion.div
          key={displayAction.id}
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={cn(
            'relative isolate overflow-hidden inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
            'backdrop-blur-xs border',
            'shadow-lg',
            getColorClasses(displayAction.type).bg,
            getColorClasses(displayAction.type).border,
            className,
          )}
          role="status"
          aria-label={`Current action: ${displayAction.message}`}
          aria-live="polite"
        >
          {/* Animated icon */}
          <span
            className={cn(
              'relative z-10 shrink-0',
              getColorClasses(displayAction.type).icon,
              ['thinking', 'searching', 'coding', 'running'].includes(displayAction.type) &&
                'animate-pulse',
            )}
          >
            {getIcon(displayAction)}
          </span>

          {/* Message */}
          <span
            className={cn(
              'relative z-10 text-xs font-medium truncate max-w-[200px]',
              getColorClasses(displayAction.type).text,
            )}
          >
            {displayAction.message}
          </span>

          {/* Progress indicator for multi-step operations */}
          {displayAction.currentStep !== undefined && displayAction.totalSteps !== undefined && (
            <span className="relative z-10 text-xs text-muted-foreground tabular-nums">
              {displayAction.currentStep}/{displayAction.totalSteps}
            </span>
          )}

          {/* Subtle pulse animation for active states */}
          {['thinking', 'searching', 'coding', 'running'].includes(displayAction.type) && (
            <motion.span
              className={cn(
                'absolute inset-0 rounded-full',
                getColorClasses(displayAction.type).bg,
              )}
              animate={{ opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * A stacked version showing multiple current actions
 * Useful for the sidecar or when multiple operations run in parallel
 */
export function CurrentActionStack({ className }: CurrentActionBadgeProps) {
  const getActiveActionTrail = useUnifiedChatStore((state) => state.getActiveActionTrail);
  const actionTrail = getActiveActionTrail();

  // Get all active actions
  const activeActions = actionTrail.filter((entry) =>
    ['thinking', 'searching', 'coding', 'running'].includes(entry.type),
  );

  if (activeActions.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <AnimatePresence mode="popLayout">
        {activeActions.slice(0, 5).map((action) => {
          const colors = getColorClasses(action.type);
          return (
            <motion.div
              key={action.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={cn(
                'flex items-center gap-2 px-2.5 py-1.5 rounded-lg',
                'backdrop-blur-xs border',
                colors.bg,
                colors.border,
              )}
            >
              <span className={cn('shrink-0 animate-pulse', colors.icon)}>{getIcon(action)}</span>
              <span className={cn('text-xs font-medium truncate flex-1', colors.text)}>
                {action.message}
              </span>
              {action.progress !== undefined && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {action.progress}%
                </span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {activeActions.length > 5 && (
        <div className="text-xs text-muted-foreground text-center">
          +{activeActions.length - 5} more
        </div>
      )}
    </div>
  );
}

export default CurrentActionBadge;
