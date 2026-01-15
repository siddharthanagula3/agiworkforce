/**
 * Simple Mode Toggle
 *
 * A friendly toggle that lets users switch between simple and advanced modes.
 * Includes a tooltip explaining the difference.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Zap, HelpCircle, X } from 'lucide-react';
import { useSimpleModeStore } from '../stores/simpleModeStore';
import { cn } from '../lib/utils';

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
  const mode = useSimpleModeStore((state) => state.mode);
  const toggleMode = useSimpleModeStore((state) => state.toggleMode);
  const showModeSwitcherHint = useSimpleModeStore((state) => state.showModeSwitcherHint);
  const dismissModeSwitcherHint = useSimpleModeStore((state) => state.dismissModeSwitcherHint);
  const [showTooltip, setShowTooltip] = useState(false);

  const isSimple = mode === 'simple';

  return (
    <div className={cn('relative', className)}>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleMode}
          className={cn(
            'relative flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-300',
            isSimple
              ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-600 dark:text-green-400 border border-green-500/30'
              : 'bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30',
            compact && 'px-2 py-1',
          )}
          title={isSimple ? 'Switch to Advanced Mode' : 'Switch to Simple Mode'}
        >
          <motion.div
            key={mode}
            initial={{ scale: 0.8, opacity: 0, rotate: -180 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.8, opacity: 0, rotate: 180 }}
            transition={{ duration: 0.3 }}
          >
            {isSimple ? (
              <Sparkles className={cn('h-4 w-4', compact && 'h-3.5 w-3.5')} />
            ) : (
              <Zap className={cn('h-4 w-4', compact && 'h-3.5 w-3.5')} />
            )}
          </motion.div>
          {showLabel && !compact && (
            <span className="text-xs font-medium">{isSimple ? 'Simple' : 'Advanced'}</span>
          )}
        </button>

        {!compact && (
          <button
            onClick={() => setShowTooltip(!showTooltip)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* First-time hint - positioned above to avoid overflow at bottom of sidebar */}
      <AnimatePresence>
        {showModeSwitcherHint && !compact && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-0 mb-2 z-[60]"
          >
            <div className="bg-blue-600 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-[200px]">
              <div className="flex items-start justify-between gap-2">
                <p>Click here to switch between simple and advanced modes!</p>
                <button onClick={dismissModeSwitcherHint} className="shrink-0">
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="absolute -bottom-1.5 left-6 w-3 h-3 bg-blue-600 rotate-45" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltip explanation - positioned to avoid sidebar overflow */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute bottom-full left-0 mb-2 z-[60]"
          >
            <div className="bg-white dark:bg-charcoal-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 max-w-[280px]">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  What's the difference?
                </h4>
                <button
                  onClick={() => setShowTooltip(false)}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SimpleModeToggle;
