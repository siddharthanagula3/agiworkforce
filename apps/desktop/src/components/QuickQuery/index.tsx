/**
 * QuickQuery Overlay
 *
 * A system-wide quick-query floating overlay that appears when the user
 * presses the global hotkey (Cmd+Shift+Space on macOS, Ctrl+Shift+Space
 * on Windows/Linux). Inspired by Spotlight, Raycast, and similar launchers.
 *
 * - Glassmorphism dark design matching the app theme
 * - Text input with model selector
 * - Routes the query to the main chat / creates a new conversation
 * - Closes on Escape or click-outside
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Sparkles, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../../lib/utils';
import { useAccountStore } from '../../stores/auth';
import { useModelStore } from '../../stores/modelStore';
import {
  MODEL_PRESETS,
  PROVIDER_LABELS,
  getAllowedAutoModesForTier,
  getBestAutoModeForTier,
} from '../../constants/llm';
import type { Provider } from '../../stores/settingsStore';

interface QuickQueryProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (query: string, model: string) => void;
}

export function QuickQuery({ open, onClose, onSubmit }: QuickQueryProps) {
  const [query, setQuery] = useState('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { selectedModel, selectModel } = useModelStore(
    useShallow((state) => ({
      selectedModel: state.selectedModel,
      selectModel: state.selectModel,
    })),
  );
  const account = useAccountStore((state) => state.account);
  const planTier = account.plan ?? 'hobby';
  const allowedAutoModes = getAllowedAutoModesForTier(planTier);
  const defaultModel = getBestAutoModeForTier(planTier);

  // Focus input when overlay opens
  useEffect(() => {
    if (open) {
      // Short delay so the animation frame renders first
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
    // Reset state when closing
    setQuery('');
    setModelDropdownOpen(false);
    return undefined;
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (modelDropdownOpen) {
          setModelDropdownOpen(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onClose, modelDropdownOpen]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (overlayRef.current && !overlayRef.current.contains(target)) {
        onClose();
      }
      // Close dropdown if clicking outside it
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setModelDropdownOpen(false);
      }
    };

    // Use a small delay so the opening click doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open, onClose]);

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onSubmit(trimmed, selectedModel ?? defaultModel);
    setQuery('');
    onClose();
  }, [defaultModel, query, selectedModel, onSubmit, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // Build flat list of model options for the dropdown
  const modelOptions = (() => {
    const options: Array<{ value: string; label: string; provider: Provider }> = [];

    // Managed cloud presets first (Auto modes)
    const managed = MODEL_PRESETS['managed_cloud'];
    if (managed) {
      for (const m of managed) {
        if (m.value.startsWith('auto') && !allowedAutoModes.includes(m.value)) {
          continue;
        }
        options.push({ value: m.value, label: m.label, provider: 'managed_cloud' });
      }
    }

    return options;
  })();

  const currentModelLabel = (() => {
    if (!selectedModel) {
      const defaultOption = modelOptions.find((option) => option.value === defaultModel);
      return defaultOption?.label ?? 'Auto (Economy)';
    }
    const found = modelOptions.find((o) => o.value === selectedModel);
    if (found) return found.label;
    if (selectedModel.startsWith('auto')) {
      const defaultOption = modelOptions.find((option) => option.value === defaultModel);
      return defaultOption?.label ?? 'Auto (Economy)';
    }
    // Fallback: show raw model id nicely
    return selectedModel.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  })();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[18vh] animate-in fade-in duration-150">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Overlay card */}
      <div
        ref={overlayRef}
        className={cn(
          'relative w-full max-w-[640px] mx-4',
          'rounded-2xl border border-white/[0.08]',
          'bg-zinc-900/80 backdrop-blur-2xl',
          'shadow-2xl shadow-black/50',
          'animate-in slide-in-from-top-4 fade-in duration-200',
          'ring-1 ring-white/[0.04]',
        )}
      >
        {/* Header bar */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
          <span className="text-xs font-medium text-zinc-400 tracking-wide uppercase">
            Quick Query
          </span>
          <div className="flex-1" />
          <button type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
            aria-label="Close quick query"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Input area */}
        <div className="px-4 pb-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            className={cn(
              'w-full bg-transparent text-lg text-zinc-100 placeholder:text-zinc-500',
              'outline-none border-none ring-0',
              'py-2',
              'font-light tracking-tight',
            )}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {/* Bottom bar: model selector + send */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
          {/* Model selector */}
          <div className="relative" ref={dropdownRef}>
            <button type="button"
              onClick={() => setModelDropdownOpen((prev) => !prev)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
                'text-xs font-medium text-zinc-400',
                'bg-white/[0.04] hover:bg-white/[0.08]',
                'border border-white/[0.06]',
                'transition-all duration-150',
              )}
            >
              <span className="truncate max-w-[160px]">{currentModelLabel}</span>
              <ChevronDown
                className={cn(
                  'h-3 w-3 text-zinc-500 transition-transform duration-150',
                  modelDropdownOpen && 'rotate-180',
                )}
              />
            </button>

            {/* Dropdown */}
            {modelDropdownOpen && (
              <div
                className={cn(
                  'absolute bottom-full left-0 mb-1.5',
                  'w-56 rounded-xl overflow-hidden',
                  'bg-zinc-900/95 backdrop-blur-xl',
                  'border border-white/[0.08]',
                  'shadow-xl shadow-black/40',
                  'animate-in slide-in-from-bottom-2 fade-in duration-150',
                  'py-1',
                )}
              >
                {modelOptions.map((option) => {
                  const isSelected = selectedModel === option.value;
                  return (
                    <button type="button"
                      key={option.value}
                      onClick={() => {
                        void selectModel(option.value, option.provider);
                        setModelDropdownOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-left text-sm',
                        'transition-colors duration-100',
                        isSelected
                          ? 'text-blue-400 bg-blue-500/10'
                          : 'text-zinc-300 hover:bg-white/[0.06]',
                      )}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected && (
                        <span className="ml-auto text-blue-400 text-xs font-medium">Active</span>
                      )}
                    </button>
                  );
                })}

                {/* Separator + provider label */}
                <div className="mx-3 my-1 border-t border-white/[0.06]" />
                <div className="px-3 py-1">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">
                    {PROVIDER_LABELS['managed_cloud']}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Keyboard hint + Send button */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-zinc-600">
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] font-mono">
                Enter
              </kbd>
              <span>to send</span>
            </div>
            <button type="button"
              onClick={handleSubmit}
              disabled={!query.trim()}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
                'text-sm font-medium transition-all duration-150',
                query.trim()
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
                  : 'bg-white/[0.04] text-zinc-600 cursor-not-allowed',
              )}
            >
              <span>Send</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Subtle bottom glow */}
        <div className="absolute -bottom-px left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
      </div>
    </div>
  );
}
