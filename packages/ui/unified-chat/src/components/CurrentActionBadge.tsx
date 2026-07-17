/**
 * CurrentActionBadge — compact, always-visible indicator showing what the
 * agent is currently doing (thinking / searching / coding / running) plus a
 * brief grace period for completed actions.
 *
 * Reads from `budgetStore.actionTrail`. Hosts push entries via
 * `useBudgetStore.getState().pushAction(...)` whenever a tool starts/ends.
 *
 * Two exports:
 *   - `CurrentActionBadge` — single most-recent active action
 *   - `CurrentActionStack` — list of all parallel active actions (max 5 + overflow)
 */
import { AnimatePresence, motion } from 'framer-motion';
import {
  Brain,
  Camera,
  CheckCircle,
  Code,
  Database,
  FileEdit,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  Image as ImageIcon,
  Loader2,
  Play,
  Search,
  Terminal,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  useBudgetStore,
  type ActionTrailEntry,
  type ActionTrailEntryType,
} from '../stores/budgetStore';

const TOOL_ICON_MAP: Record<string, LucideIcon> = {
  Read: FileText,
  Write: FileText,
  Edit: FileEdit,
  LS: FolderOpen,
  Search,
  Bash: Terminal,
  WebSearch: Globe,
  WebFetch: Globe,
  Git: GitBranch,
  Memory: Database,
  ImageGen: ImageIcon,
};

const ACTIVE_TYPES: readonly ActionTrailEntryType[] = [
  'thinking',
  'searching',
  'coding',
  'running',
];

function getIcon(entry: ActionTrailEntry) {
  const displayName = entry.metadata?.['displayName'] as string | undefined;
  if (displayName) {
    const Icon = TOOL_ICON_MAP[displayName] ?? Wrench;
    return <Icon className="h-3.5 w-3.5" />;
  }

  const lower = entry.message?.toLowerCase() ?? '';
  if (lower.includes('screenshot') || lower.includes('capture')) {
    return <Camera className="h-3.5 w-3.5" />;
  }
  if (lower.includes('terminal') || lower.includes('command')) {
    return <Terminal className="h-3.5 w-3.5" />;
  }
  if (lower.includes('file') || lower.includes('edit')) {
    return <FileEdit className="h-3.5 w-3.5" />;
  }
  if (lower.includes('browse') || lower.includes('web') || lower.includes('url')) {
    return <Globe className="h-3.5 w-3.5" />;
  }
  if (lower.includes('mcp') || lower.includes('tool')) {
    return <Wrench className="h-3.5 w-3.5" />;
  }

  switch (entry.type) {
    case 'thinking':
      return <Brain className="h-3.5 w-3.5" />;
    case 'searching':
      return <Search className="h-3.5 w-3.5" />;
    case 'coding':
      return <Code className="h-3.5 w-3.5" />;
    case 'running':
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    case 'completed':
      return <CheckCircle className="h-3.5 w-3.5" />;
    case 'error':
      return <XCircle className="h-3.5 w-3.5" />;
    default:
      return <Play className="h-3.5 w-3.5" />;
  }
}

function getColorClasses(type: ActionTrailEntryType) {
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

export function CurrentActionBadge({ className }: CurrentActionBadgeProps) {
  const actionTrail = useBudgetStore((state) => state.actionTrail);
  const recentFirst = [...actionTrail].reverse();
  const activeAction = recentFirst.find((e) => ACTIVE_TYPES.includes(e.type));
  const recentCompleted = recentFirst.find(
    (e) => e.type === 'completed' && Date.now() - new Date(e.timestamp).getTime() < 3000,
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
            'relative isolate inline-flex items-center gap-2 overflow-hidden rounded-full border px-3 py-1.5',
            'shadow-lg backdrop-blur-xs',
            getColorClasses(displayAction.type).bg,
            getColorClasses(displayAction.type).border,
            className,
          )}
          role="status"
          aria-label={`Current action: ${displayAction.message}`}
          aria-live="polite"
        >
          <span
            className={cn(
              'relative z-10 shrink-0',
              getColorClasses(displayAction.type).icon,
              ACTIVE_TYPES.includes(displayAction.type) && 'animate-pulse',
            )}
          >
            {getIcon(displayAction)}
          </span>

          <span
            className={cn(
              'relative z-10 max-w-[200px] truncate text-xs font-medium',
              getColorClasses(displayAction.type).text,
            )}
          >
            {displayAction.message}
          </span>

          {displayAction.currentStep !== undefined && displayAction.totalSteps !== undefined && (
            <span className="relative z-10 text-xs tabular-nums text-muted-foreground">
              {displayAction.currentStep}/{displayAction.totalSteps}
            </span>
          )}

          {ACTIVE_TYPES.includes(displayAction.type) && (
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

export function CurrentActionStack({ className }: CurrentActionBadgeProps) {
  const actionTrail = useBudgetStore((state) => state.actionTrail);
  const activeActions = actionTrail.filter((e) => ACTIVE_TYPES.includes(e.type));
  if (activeActions.length === 0) return null;

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
                'flex items-center gap-2 rounded-lg border px-2.5 py-1.5',
                'backdrop-blur-xs',
                colors.bg,
                colors.border,
              )}
            >
              <span className={cn('shrink-0 animate-pulse', colors.icon)}>{getIcon(action)}</span>
              <span className={cn('flex-1 truncate text-xs font-medium', colors.text)}>
                {action.message}
              </span>
              {action.progress !== undefined && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {action.progress}%
                </span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {activeActions.length > 5 && (
        <div className="text-center text-xs text-muted-foreground">
          +{activeActions.length - 5} more
        </div>
      )}
    </div>
  );
}
