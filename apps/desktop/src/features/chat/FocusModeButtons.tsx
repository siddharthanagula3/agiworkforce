/**
 * FocusModeButtons Component
 *
 * Displays focus mode selection buttons for filtering search/response types.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { FocusMode } from '../../stores/unifiedChatStore';

export interface FocusModeOption {
  value: FocusMode;
  label: string;
  placeholder: string;
}

export const FOCUS_MODES: FocusModeOption[] = [
  { value: 'web', label: 'Web', placeholder: 'Search the web for information...' },
  {
    value: 'code',
    label: 'Code',
    placeholder: 'Ask about code, repositories, or debugging...',
  },
  { value: 'reasoning', label: 'Write', placeholder: 'Help me write or edit content...' },
  {
    value: 'deep-research',
    label: 'Research',
    placeholder: 'Research a topic in depth...',
  },
  { value: null, label: 'All', placeholder: 'How can I help you today?' },
];

export interface FocusModeButtonsProps {
  /** Currently selected focus mode */
  focusMode: FocusMode;
  /** Callback when focus mode changes */
  onFocusModeChange: (mode: FocusMode) => void;
  /** Whether reduced motion is preferred */
  prefersReducedMotion?: boolean;
}

export const FocusModeButtons: React.FC<FocusModeButtonsProps> = ({
  focusMode,
  onFocusModeChange,
  prefersReducedMotion = false,
}) => {
  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
      className="mb-3 flex items-center justify-center gap-2 flex-wrap"
    >
      {FOCUS_MODES.map((mode) => (
        <button
          type="button"
          key={mode.value || 'all'}
          onClick={() => onFocusModeChange(mode.value)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200',
            focusMode === mode.value
              ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
              : 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] border border-[hsl(var(--border))]',
          )}
          aria-pressed={focusMode === mode.value}
        >
          {mode.label}
        </button>
      ))}
    </motion.div>
  );
};

/**
 * Get the placeholder text for a given focus mode
 */
export function getFocusModePlaceholder(
  focusMode: FocusMode,
  defaultPlaceholder: string = 'How can I help you today?',
): string {
  return FOCUS_MODES.find((m) => m.value === focusMode)?.placeholder || defaultPlaceholder;
}

export default FocusModeButtons;
