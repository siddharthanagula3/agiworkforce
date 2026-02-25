'use client';

/**
 * Simple Mode Toggle
 *
 * A friendly toggle that lets users switch between simple and advanced modes.
 * Includes a tooltip explaining the difference.
 *
 * Web version: uses CSS transitions instead of framer-motion (not available in web app).
 */

import React, { useState } from 'react';
import { Sparkles, Zap, HelpCircle, X } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/utils/cn';

interface SimpleModeToggleProps {
  className?: string;
  showLabel?: boolean;
  compact?: boolean;
}

export const SimpleModeToggle: React.FC<SimpleModeToggleProps> = ({
  className,
  showLabel = true,
  compact = false,
}) => {
  const simpleMode = useUIStore((state) => state.simpleMode);
  const toggleSimpleMode = useUIStore((state) => state.toggleSimpleMode);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className={cn('relative', className)}>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSimpleMode}
          aria-label={simpleMode ? 'Switch to Advanced Mode' : 'Switch to Simple Mode'}
          className={cn(
            'relative flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-300',
            simpleMode
              ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-600 dark:text-green-400 border border-green-500/30'
              : 'bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30',
            compact && 'px-2 py-1',
          )}
          title={simpleMode ? 'Switch to Advanced Mode' : 'Switch to Simple Mode'}
        >
          <span className="transition-all duration-300">
            {simpleMode ? (
              <Sparkles className={cn('h-4 w-4', compact && 'h-3.5 w-3.5')} />
            ) : (
              <Zap className={cn('h-4 w-4', compact && 'h-3.5 w-3.5')} />
            )}
          </span>
          {showLabel && !compact && (
            <span className="text-xs font-medium">{simpleMode ? 'Simple' : 'Advanced'}</span>
          )}
        </button>

        {!compact && (
          <button
            onClick={() => setShowTooltip(!showTooltip)}
            aria-label="What's the difference between Simple and Advanced mode?"
            aria-expanded={showTooltip}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tooltip explanation - positioned to avoid overflow */}
      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-2 z-[60] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 max-w-[280px]">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                What's the difference?
              </h4>
              <button
                onClick={() => setShowTooltip(false)}
                aria-label="Close tooltip"
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="h-3 w-3 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Simple Mode
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Perfect for everyday use. Just type and chat - we handle the rest!
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Advanced Mode
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Full control with model selection, focus modes, projects, and more.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              You can switch anytime from the sidebar or settings.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleModeToggle;
