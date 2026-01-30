/**
 * ModelSelectorButton Component
 *
 * Button that opens the model selection popover.
 * Shows simplified view in simple mode.
 */

import React from 'react';
import { Brain, ChevronDown, Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { cn } from '../../lib/utils';
import { QuickModelSelector } from './QuickModelSelector';

export interface ModelSelectorButtonProps {
  /** Display name of the current model */
  modelDisplayName: string;
  /** Whether thinking mode is enabled */
  thinkingModeEnabled?: boolean;
  /** Whether the selector is open */
  isOpen: boolean;
  /** Callback to change open state */
  onOpenChange: (open: boolean) => void;
  /** Whether in simple mode */
  isSimpleMode?: boolean;
  /** Ref for the container element */
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export const ModelSelectorButton: React.FC<ModelSelectorButtonProps> = ({
  modelDisplayName,
  thinkingModeEnabled = false,
  isOpen,
  onOpenChange,
  isSimpleMode = false,
  containerRef,
}) => {
  // Simple mode: show simplified static display
  if (isSimpleMode) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 dark:text-gray-500">
        <Sparkles size={12} className="text-green-500" />
        <span>Auto</span>
      </div>
    );
  }

  // Advanced mode: full model selector
  return (
    <div className="relative" ref={containerRef}>
      <Popover open={isOpen} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium',
              'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
              'transition-colors duration-150',
            )}
          >
            <span className="truncate max-w-[100px]">{modelDisplayName}</span>
            {thinkingModeEnabled && <Brain size={12} className="text-amber-500" />}
            <ChevronDown size={12} className={cn('transition-transform', isOpen && 'rotate-180')} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          sideOffset={12}
          collisionPadding={16}
          className="w-72 border-none bg-transparent p-0 shadow-none z-[100]"
        >
          <QuickModelSelector onClose={() => onOpenChange(false)} />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default ModelSelectorButton;
