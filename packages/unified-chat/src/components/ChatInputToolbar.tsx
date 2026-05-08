/**
 * ChatInputToolbar — Phase A Slice 5 (ported from UAC, Task #18 plan-mode toggle)
 *
 * Composer toolbar row below the text area:
 *   Left:  Model label + optional slot for host model selector
 *   Right: Thinking toggle | Incognito toggle | Auto/Manual mode | Plan-mode toggle (Task #18)
 *
 * Dependencies replaced:
 *   - useUnifiedChatStore → useChatStore (package)
 *   - useThinkingStore    → local state (no desktop-only store)
 *   - useChatStore (desktop) → useChatStore (package)
 *   - QuickModelSelector, SpeedQualitySelector → optional render props
 *
 * Task #18 wiring: Plan-mode toggle button reads/writes usePlanModeStore.
 */

import { useCallback } from 'react';
import { Brain, EyeOff, Hand, Zap, BookOpen } from 'lucide-react';
import { cn } from '../lib/utils';
import { usePlanModeStore, selectPlanMode } from '../stores/planModeStore';

// Re-exported primitive types (host-app Button / Tooltip — hosts supply their own
// UI primitives via CSS variables; these stubs render accessible semantic HTML
// when host primitives are not injected).
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'sm' | 'icon';
}

function ToolbarButton({
  variant = 'ghost',
  size = 'sm',
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'h-7 px-2 gap-1.5',
        size === 'icon' && 'h-7 w-7',
        variant === 'ghost' && 'text-muted-foreground hover:text-foreground hover:bg-accent',
        variant === 'default' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'outline' &&
          'border border-border bg-transparent hover:bg-accent hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export interface ChatInputToolbarProps {
  /** Whether extended thinking is enabled. Host manages this state. */
  thinkingEnabled?: boolean;
  /** Thinking budget label (e.g. "medium"). */
  thinkingBudget?: string;
  /** Toggle thinking mode. */
  onThinkingToggle?: () => void;

  /** Whether incognito mode is active for the current conversation. */
  isIncognito?: boolean;
  /** Toggle incognito mode. */
  onIncognitoToggle?: () => void;

  /** Whether autonomous (auto) mode is active (as opposed to manual). */
  isAutoMode?: boolean;
  /** Toggle auto/manual mode. */
  onAutoModeToggle?: () => void;

  /** Slot for a host-provided model selector component. */
  modelSelector?: React.ReactNode;
  /** Slot for a host-provided speed/quality selector. */
  speedSelector?: React.ReactNode;

  className?: string;
}

export function ChatInputToolbar({
  thinkingEnabled = false,
  thinkingBudget,
  onThinkingToggle,
  isIncognito = false,
  onIncognitoToggle,
  isAutoMode = true,
  onAutoModeToggle,
  modelSelector,
  speedSelector,
  className,
}: ChatInputToolbarProps) {
  // Task #18: Plan-mode toggle reads/writes usePlanModeStore
  const planMode = usePlanModeStore(selectPlanMode);
  const togglePlanMode = usePlanModeStore((s) => s.togglePlanMode);

  const handlePlanModeToggle = useCallback(() => {
    togglePlanMode();
  }, [togglePlanMode]);

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-2 border-t border-border/50 bg-background/80 backdrop-blur-xs',
        className,
      )}
    >
      {/* Left: model selector slot */}
      <div className="flex items-center gap-2">
        {modelSelector ? (
          modelSelector
        ) : (
          <span className="text-xs text-muted-foreground">Model</span>
        )}
        {speedSelector}
      </div>

      {/* Right: feature toggles */}
      <div className="flex items-center gap-2">
        {/* Thinking mode toggle */}
        {onThinkingToggle && (
          <ToolbarButton
            variant={thinkingEnabled ? 'default' : 'ghost'}
            size="sm"
            onClick={onThinkingToggle}
            className={cn(thinkingEnabled && 'bg-purple-600 hover:bg-purple-700 text-white')}
            aria-label={thinkingEnabled ? 'Disable extended thinking' : 'Enable extended thinking'}
            aria-pressed={thinkingEnabled}
            title={
              thinkingEnabled
                ? `Extended thinking enabled${thinkingBudget ? ` (${thinkingBudget})` : ''}. Click to disable.`
                : 'Enable extended thinking for deeper reasoning'
            }
          >
            <Brain className="h-3.5 w-3.5" />
            {thinkingEnabled && thinkingBudget && (
              <span className="text-xs font-medium">{thinkingBudget}</span>
            )}
          </ToolbarButton>
        )}

        {/* Incognito toggle */}
        {onIncognitoToggle && (
          <ToolbarButton
            variant={isIncognito ? 'default' : 'ghost'}
            size="sm"
            onClick={onIncognitoToggle}
            className={cn(isIncognito && 'bg-violet-600 hover:bg-violet-700 text-white')}
            aria-label={isIncognito ? 'Disable incognito mode' : 'Enable incognito mode'}
            aria-pressed={isIncognito}
            title={
              isIncognito
                ? 'Incognito mode: messages not saved to disk. Click to disable.'
                : 'Start an incognito conversation (not saved to disk)'
            }
          >
            <EyeOff className="h-3.5 w-3.5" />
            {isIncognito && <span className="text-xs font-medium">Incognito</span>}
          </ToolbarButton>
        )}

        {/* Auto/Manual mode toggle */}
        {onAutoModeToggle && (
          <ToolbarButton
            variant={isAutoMode ? 'default' : 'outline'}
            size="sm"
            onClick={onAutoModeToggle}
            className={cn(isAutoMode && 'bg-emerald-500 hover:bg-emerald-600 text-white')}
            title={isAutoMode ? 'Auto: Agent acts autonomously' : 'Manual: Agent asks permission'}
            aria-label="Toggle auto mode"
            aria-pressed={isAutoMode}
          >
            {isAutoMode ? (
              <>
                <Zap className="h-4 w-4" />
                <span className="text-xs font-medium">Auto</span>
              </>
            ) : (
              <>
                <Hand className="h-4 w-4" />
                <span className="text-xs font-medium">Manual</span>
              </>
            )}
          </ToolbarButton>
        )}

        {/* Task #18: Plan-mode toggle (always present — wired to usePlanModeStore) */}
        <ToolbarButton
          variant={planMode ? 'default' : 'ghost'}
          size="sm"
          onClick={handlePlanModeToggle}
          className={cn(planMode && 'bg-indigo-600 hover:bg-indigo-700 text-white')}
          aria-label={planMode ? 'Disable plan mode' : 'Enable plan mode'}
          aria-pressed={planMode}
          title={
            planMode
              ? 'Plan mode active: agent will propose a plan before executing. Click to disable.'
              : 'Enable plan mode: agent proposes a plan and waits for approval before executing'
          }
        >
          <BookOpen className="h-3.5 w-3.5" />
          {planMode && <span className="text-xs font-medium">Plan</span>}
        </ToolbarButton>
      </div>
    </div>
  );
}
