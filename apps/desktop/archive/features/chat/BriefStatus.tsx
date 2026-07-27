/**
 * BriefStatus - Minimal status indicator for AGI actions
 *
 * Shows brief, one-line status updates like:
 * - "Opening Chrome..."
 * - "Sending email..."
 * - "Done!"
 *
 * Designed for non-technical users who want minimal feedback
 * without detailed technical information.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface BriefStatusState {
  /** Current status message (e.g., "Opening Chrome...") */
  message: string | null;
  /** Whether the action is complete */
  isComplete: boolean;
  /** Whether an error occurred */
  isError: boolean;
}

interface BriefStatusProps {
  /** Current status state */
  status: BriefStatusState;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Minimal inline status indicator
 * Shows a single line with optional spinner
 */
export function BriefStatus({ status, className }: BriefStatusProps) {
  if (!status.message) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status.message}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -5 }}
        transition={{ duration: 0.15 }}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full',
          'text-sm',
          status.isError
            ? 'text-rose-400 bg-rose-500/10'
            : status.isComplete
              ? 'text-emerald-400 bg-emerald-500/10'
              : 'text-muted-foreground bg-muted/50',
          className,
        )}
        role="status"
        aria-live="polite"
      >
        {!status.isComplete && !status.isError && (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
        )}
        {status.isComplete && !status.isError && (
          <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{status.message}</span>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Hook-friendly status manager
 */
export function useBriefStatus() {
  const createStatus = (message: string): BriefStatusState => ({
    message,
    isComplete: false,
    isError: false,
  });

  const completeStatus = (message = 'Done!'): BriefStatusState => ({
    message,
    isComplete: true,
    isError: false,
  });

  const errorStatus = (message = 'Failed'): BriefStatusState => ({
    message,
    isComplete: false,
    isError: true,
  });

  const clearStatus = (): BriefStatusState => ({
    message: null,
    isComplete: false,
    isError: false,
  });

  return { createStatus, completeStatus, errorStatus, clearStatus };
}

/**
 * Floating brief status - appears at top of chat area
 */
interface FloatingBriefStatusProps {
  status: BriefStatusState;
  className?: string;
}

export function FloatingBriefStatus({ status, className }: FloatingBriefStatusProps) {
  if (!status.message) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className={cn(
          'fixed top-4 left-1/2 -translate-x-1/2 z-50',
          'flex items-center gap-2 px-4 py-2 rounded-full',
          'text-sm font-medium',
          'bg-card/95 backdrop-blur-xs',
          'border border-white/10',
          'shadow-lg',
          status.isError
            ? 'text-rose-400 border-rose-500/30'
            : status.isComplete
              ? 'text-emerald-400 border-emerald-500/30'
              : 'text-foreground',
          className,
        )}
        role="status"
        aria-live="assertive"
      >
        {!status.isComplete && !status.isError && (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
        )}
        {status.isComplete && !status.isError && (
          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
        )}
        <span>{status.message}</span>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Simple action status messages helper
 * Generates user-friendly status messages for common actions
 */
export const actionMessages = {
  // Browser actions
  openingBrowser: (url?: string) =>
    url ? `Opening ${new URL(url).hostname}...` : 'Opening browser...',
  navigating: (url?: string) => (url ? `Going to ${new URL(url).hostname}...` : 'Navigating...'),
  clicking: (target?: string) => (target ? `Clicking ${target}...` : 'Clicking...'),
  typing: () => 'Typing...',
  scrolling: () => 'Scrolling...',

  // File actions
  openingFile: (name?: string) => (name ? `Opening ${name}...` : 'Opening file...'),
  savingFile: (name?: string) => (name ? `Saving ${name}...` : 'Saving...'),
  creatingFile: (name?: string) => (name ? `Creating ${name}...` : 'Creating file...'),
  deletingFile: (name?: string) => (name ? `Deleting ${name}...` : 'Deleting...'),

  // Communication actions
  sendingEmail: (to?: string) => (to ? `Sending email to ${to}...` : 'Sending email...'),
  sendingMessage: (to?: string) => (to ? `Messaging ${to}...` : 'Sending message...'),

  // System actions
  launching: (app?: string) => (app ? `Launching ${app}...` : 'Launching...'),
  running: (cmd?: string) => (cmd ? `Running ${cmd}...` : 'Running...'),
  installing: (pkg?: string) => (pkg ? `Installing ${pkg}...` : 'Installing...'),

  // AI actions
  thinking: () => 'Thinking...',
  analyzing: () => 'Analyzing...',
  generating: () => 'Generating...',

  // Completion
  done: () => 'Done!',
  completed: (action?: string) => (action ? `${action} complete` : 'Done!'),
  failed: (reason?: string) => (reason ? `Failed: ${reason}` : 'Failed'),
};

export default BriefStatus;
