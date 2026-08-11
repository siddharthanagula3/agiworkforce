/**
 * AgentControl — composer footer chip row.
 *
 * Renders compact composer controls:
 *   [Mode ▼]  [Reasoning ▼]  [Temp]
 *
 * - Mode chip: Ask / Auto / Plan / Bypass, with descriptions in a Radix Popover.
 * - Reasoning control: one discrete slider backed by the selected model's exact
 *   catalog-supported values. Hidden
 *   when that model has no provider effort request path.
 * - Temp chip: single-tap boolean toggle. When ON, the conversation does not persist.
 *
 * A small orange dot appears on a chip when source === 'conversation-override',
 * with a tooltip explaining the override.
 *
 * Usage:
 *   <AgentControl
 *     conversationId={conversationId}
 *     projectId={projectId}
 *     modelId={currentModel.id}
 *   />
 */

import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useState } from 'react';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import { ConfirmDialog, Slider } from '@agiworkforce/ui';
import {
  AGENT_MODE_LABEL,
  AGENT_MODE_DESCRIPTION,
  EFFORT_LABEL,
  getModelEffortOptions,
  resolveModelEffort,
  type AgentMode,
  type Effort,
} from '@agiworkforce/types';
import { cn } from '../lib/utils';
import { useAgentControlStore } from '../stores/agentControlStore';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AgentControlProps {
  /** The active conversation — controls which per-conversation override is stored. */
  conversationId: string;
  /** The project this conversation belongs to. Used to read project-level defaults. */
  projectId: string | null;
  /** The selected model ID used to resolve its exact effort contract. */
  modelId: string;
  /** Render the Ask/Auto/Plan/Bypass mode chip. Off where the server owns approval policy. */
  showMode?: boolean;
  /** Render the reasoning-effort chip. Independent of showMode — effort is a
   *  model parameter, not a permission control. */
  showEffort?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_MODES: AgentMode[] = ['ask', 'auto', 'plan', 'bypass'];
// ---------------------------------------------------------------------------
// Override indicator dot
// ---------------------------------------------------------------------------

interface OverrideDotProps {
  show: boolean;
}

function OverrideDot({ show }: OverrideDotProps) {
  if (!show) return null;
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            aria-label="Overriding project default"
            className={cn('absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full', 'bg-amber-500')}
          />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            className={cn(
              'z-50 rounded-md px-2 py-1 text-[10px] shadow-md',
              'bg-[var(--chat-surface-elevated)] border border-[var(--chat-border)]',
              'text-[var(--chat-text-secondary)]',
            )}
          >
            Overriding project default
            <Tooltip.Arrow className="fill-[var(--chat-surface-elevated)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

// ---------------------------------------------------------------------------
// Chip base style
// ---------------------------------------------------------------------------

function chipClass(active?: boolean) {
  return cn(
    'relative inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1',
    'text-[11px] font-medium transition-colors duration-150 select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
    active
      ? 'bg-[var(--chat-accent-primary)]/15 text-[var(--chat-accent-primary)]'
      : 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
  );
}

// ---------------------------------------------------------------------------
// Mode Chip
// ---------------------------------------------------------------------------

interface ModeChipProps {
  conversationId: string;
  projectId: string | null;
}

function ModeChip({ conversationId, projectId }: ModeChipProps) {
  const state = useAgentControlStore((s) => s.resolve(conversationId, projectId));
  const setMode = useAgentControlStore((s) => s.setMode);
  const isOverride = state.source === 'conversation-override';
  const [confirmBypassOpen, setConfirmBypassOpen] = useState(false);

  const selectMode = (mode: AgentMode) => {
    if (mode === 'bypass' && state.mode !== 'bypass') {
      setConfirmBypassOpen(true);
      return;
    }
    setMode(conversationId, mode);
  };

  return (
    <>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`Agent mode: ${AGENT_MODE_LABEL[state.mode]}`}
            className={chipClass()}
          >
            <OverrideDot show={isOverride} />
            <span className="max-w-[8.5rem] truncate">{AGENT_MODE_LABEL[state.mode]}</span>
            <ChevronDown aria-hidden="true" size={10} className="opacity-60 shrink-0" />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={6}
            className={cn(
              'z-50 w-64 overflow-hidden rounded-xl shadow-lg',
              'border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]',
              'animate-in fade-in-0 zoom-in-95',
              'data-[side=top]:slide-in-from-bottom-2',
            )}
          >
            <div className="border-b border-[var(--chat-border)] px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--chat-text-muted)]">
                Agent Mode
              </span>
            </div>
            <div className="p-1">
              {AGENT_MODES.map((mode) => {
                const isSelected = mode === state.mode;
                return (
                  <Popover.Close asChild key={mode}>
                    <button
                      type="button"
                      onClick={() => selectMode(mode)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left',
                        'transition-colors duration-100',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                        isSelected
                          ? 'bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary)]'
                          : 'text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium">{AGENT_MODE_LABEL[mode]}</span>
                          {mode === 'bypass' && (
                            <span className="rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-red-500/15 text-red-500">
                              danger
                            </span>
                          )}
                        </div>
                        <p
                          className={cn(
                            'mt-0.5 text-[10px]',
                            isSelected
                              ? 'text-[var(--chat-accent-primary)]/70'
                              : 'text-[var(--chat-text-muted)]',
                          )}
                        >
                          {AGENT_MODE_DESCRIPTION[mode]}
                        </p>
                      </div>
                      {isSelected && (
                        <Check
                          aria-hidden="true"
                          size={13}
                          className="mt-0.5 shrink-0 text-[var(--chat-accent-primary)]"
                        />
                      )}
                    </button>
                  </Popover.Close>
                );
              })}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <ConfirmDialog
        open={confirmBypassOpen}
        onOpenChange={setConfirmBypassOpen}
        title="Bypass all tool permissions?"
        description="Bypass mode can run commands and tools without asking, including actions that modify files or external systems. Use it only for a trusted task and workspace."
        confirmText="Enable Bypass"
        cancelText="Keep Asking"
        variant="destructive"
        onConfirm={() => setMode(conversationId, 'bypass')}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Reasoning Slider
// ---------------------------------------------------------------------------

interface EffortChipProps {
  conversationId: string;
  projectId: string | null;
  modelId: string;
  effortOptions: readonly Effort[];
}

function EffortChip({ conversationId, projectId, modelId, effortOptions }: EffortChipProps) {
  const state = useAgentControlStore((s) => s.resolve(conversationId, projectId));
  const setEffort = useAgentControlStore((s) => s.setEffort);
  const isOverride = state.source === 'conversation-override';
  const effectiveEffort = resolveModelEffort(modelId, state.effort) ?? effortOptions[0]!;
  const selectedIndex = Math.max(effortOptions.indexOf(effectiveEffort), 0);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" aria-label="Reasoning effort" className={chipClass()}>
          <OverrideDot show={isOverride} />
          <Sparkles aria-hidden="true" size={11} className="shrink-0" />
          <span className="max-w-[8rem] truncate">Reasoning</span>
          <ChevronDown aria-hidden="true" size={10} className="opacity-60 shrink-0" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          className={cn(
            'z-50 w-64 overflow-hidden rounded-xl shadow-lg',
            'border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]',
            'animate-in fade-in-0 zoom-in-95',
            'data-[side=top]:slide-in-from-bottom-2',
          )}
        >
          <div className="border-b border-[var(--chat-border)] px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--chat-text-muted)]">
              Reasoning Effort
            </span>
          </div>
          <div className="p-3">
            <div className="rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-hover)] px-3 py-3">
              <Slider
                min={0}
                max={effortOptions.length - 1}
                step={1}
                value={[selectedIndex]}
                onValueChange={(value) => {
                  const effort = effortOptions[value[0] ?? -1];
                  if (effort) setEffort(conversationId, effort);
                }}
                thumbAriaLabel="Reasoning effort"
                valueLabel={EFFORT_LABEL[effectiveEffort]}
              />
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ---------------------------------------------------------------------------
// AgentControl — public composite component
// ---------------------------------------------------------------------------

export function AgentControl({
  conversationId,
  projectId,
  modelId,
  showMode = true,
  showEffort = true,
  className,
}: AgentControlProps) {
  const effortOptions = getModelEffortOptions(modelId);

  return (
    <div
      className={cn('flex items-center gap-1 overflow-hidden', className)}
      role="group"
      aria-label="Agent controls"
    >
      {showMode && <ModeChip conversationId={conversationId} projectId={projectId} />}
      {showEffort && effortOptions.length > 0 && (
        <EffortChip
          conversationId={conversationId}
          projectId={projectId}
          modelId={modelId}
          effortOptions={effortOptions}
        />
      )}
    </div>
  );
}
