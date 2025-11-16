import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  Image as ImageIcon,
  Keyboard,
  MousePointer,
  Globe,
  FileText,
  Code,
  AlertCircle,
  CheckCircle2,
  Brain,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useUnifiedChatStore, type AgentStatus } from '../../stores/unifiedChatStore';
import { Badge } from '../ui/Badge';

/**
 * Get icon and color for each agent status type
 */
function getStatusDisplay(status: AgentStatus) {
  switch (status.type) {
    case 'idle':
      return null; // Don't show banner when idle

    case 'thinking':
      return {
        icon: Brain,
        color: 'text-blue-500',
        bgColor: 'bg-blue-50 dark:bg-blue-950/30',
        borderColor: 'border-blue-200 dark:border-blue-800',
        label: 'Thinking',
        message: status.message || 'Processing your request...',
        animated: true,
      };

    case 'tool_execution':
      return {
        icon: Code,
        color: 'text-purple-500',
        bgColor: 'bg-purple-50 dark:bg-purple-950/30',
        borderColor: 'border-purple-200 dark:border-purple-800',
        label: `Executing: ${status.tool}`,
        message: status.description || `Running ${status.tool} tool`,
        animated: true,
      };

    case 'screenshot':
      return {
        icon: ImageIcon,
        color: 'text-cyan-500',
        bgColor: 'bg-cyan-50 dark:bg-cyan-950/30',
        borderColor: 'border-cyan-200 dark:border-cyan-800',
        label: 'Taking Screenshot',
        message: status.description || 'Capturing screen...',
        animated: true,
      };

    case 'typing':
      return {
        icon: Keyboard,
        color: 'text-green-500',
        bgColor: 'bg-green-50 dark:bg-green-950/30',
        borderColor: 'border-green-200 dark:border-green-800',
        label: 'Typing',
        message: status.target ? `Typing in ${status.target}` : 'Simulating keyboard input...',
        animated: true,
      };

    case 'clicking':
      return {
        icon: MousePointer,
        color: 'text-orange-500',
        bgColor: 'bg-orange-50 dark:bg-orange-950/30',
        borderColor: 'border-orange-200 dark:border-orange-800',
        label: 'Clicking',
        message: status.target ? `Clicking on ${status.target}` : 'Simulating mouse click...',
        animated: true,
      };

    case 'browsing':
      return {
        icon: Globe,
        color: 'text-indigo-500',
        bgColor: 'bg-indigo-50 dark:bg-indigo-950/30',
        borderColor: 'border-indigo-200 dark:border-indigo-800',
        label: 'Browsing',
        message: status.url ? `Navigating to ${status.url}` : 'Automating browser...',
        animated: true,
      };

    case 'reading_file':
      return {
        icon: FileText,
        color: 'text-teal-500',
        bgColor: 'bg-teal-50 dark:bg-teal-950/30',
        borderColor: 'border-teal-200 dark:border-teal-800',
        label: 'Reading File',
        message: status.path ? `Reading ${status.path}` : 'Accessing file system...',
        animated: false,
      };

    case 'writing_file':
      return {
        icon: FileText,
        color: 'text-amber-500',
        bgColor: 'bg-amber-50 dark:bg-amber-950/30',
        borderColor: 'border-amber-200 dark:border-amber-800',
        label: 'Writing File',
        message: status.path ? `Writing to ${status.path}` : 'Modifying file...',
        animated: true,
      };

    case 'executing_code':
      return {
        icon: Code,
        color: 'text-violet-500',
        bgColor: 'bg-violet-50 dark:bg-violet-950/30',
        borderColor: 'border-violet-200 dark:border-violet-800',
        label: 'Executing Code',
        message: status.language
          ? `Running ${status.language} code`
          : 'Executing code snippet...',
        animated: true,
      };

    case 'error':
      return {
        icon: AlertCircle,
        color: 'text-red-500',
        bgColor: 'bg-red-50 dark:bg-red-950/30',
        borderColor: 'border-red-200 dark:border-red-800',
        label: 'Error',
        message: status.message,
        animated: false,
      };
  }
}

/**
 * AgentStatusBanner - Displays current agent activity inline in the chat
 *
 * Inspired by Claude Desktop's subtle status indicators, this banner shows
 * real-time agent activity like "Thinking...", "Took screenshot", etc.
 *
 * The banner automatically appears/disappears based on agent status and
 * listens to 'agent:status:update' events from the Rust backend.
 */
export function AgentStatusBanner() {
  const agentStatus = useUnifiedChatStore((s) => s.agentStatus);
  const display = getStatusDisplay(agentStatus);

  return (
    <AnimatePresence mode="wait">
      {display && (
        <motion.div
          key="agent-status"
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn(
            'border-b px-4 py-2.5 flex items-center gap-3',
            display.bgColor,
            display.borderColor,
          )}
        >
          {/* Animated Icon */}
          <div className={cn('flex-shrink-0', display.color)}>
            {display.animated ? (
              <display.icon className="h-4 w-4 animate-pulse" />
            ) : (
              <display.icon className="h-4 w-4" />
            )}
          </div>

          {/* Status Label and Message */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn('text-xs font-medium', display.color)}
              >
                {display.label}
              </Badge>
              <span className="text-sm text-muted-foreground truncate">
                {display.message}
              </span>
            </div>
          </div>

          {/* Animated Loader for active tasks */}
          {display.animated && (
            <div className="flex-shrink-0">
              <Loader2 className={cn('h-3.5 w-3.5 animate-spin', display.color)} />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
