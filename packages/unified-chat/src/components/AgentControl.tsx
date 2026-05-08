/**
 * AgentControl — composer footer chip row.
 *
 * Renders three pill chips:
 *   [Mode ▼]  [Effort: Medium ▼]  [Temp]
 *
 * - Mode chip: Ask / Auto / Plan / Bypass, with descriptions in a Radix Popover.
 * - Effort chip: Low / Medium / High / Max. Hidden when the active model's provider
 *   does not support effort (supportsEffort === false in PROVIDER_DISPLAY).
 * - Temp chip: single-tap boolean toggle. When ON, the conversation does not persist.
 *
 * A small orange dot appears on a chip when source === 'conversation-override',
 * with a tooltip explaining the override.
 *
 * Usage:
 *   <AgentControl
 *     conversationId={conversationId}
 *     projectId={projectId}
 *     modelProviderId={currentModel.providerId}
 *   />
 */

import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Check, ChevronDown } from 'lucide-react';
import {
  AGENT_MODE_LABEL,
  AGENT_MODE_DESCRIPTION,
  EFFORT_LABEL,
  PROVIDER_DISPLAY,
  type AgentMode,
  type Effort,
  type ProviderId,
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
  /**
   * The LLM provider ID for the currently selected model.
   * Used to decide whether the Effort chip is visible.
   */
  modelProviderId: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_MODES: AgentMode[] = ['ask', 'auto', 'plan', 'bypass'];
const EFFORT_LEVELS: Effort[] = ['low', 'medium', 'high', 'max'];

const EFFORT_DESCRIPTION: Readonly<Record<Effort, string>> = {
  low: 'Minimal reasoning budget — fastest, cheapest',
  medium: 'Default reasoning budget',
  high: 'Extended reasoning — better for complex tasks',
  max: 'Maximum reasoning — highest quality, most tokens',
};

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
    'relative inline-flex items-center gap-1 rounded-full px-2.5 py-1',
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
  const resolve = useAgentControlStore((s) => s.resolve);
  const setMode = useAgentControlStore((s) => s.setMode);
  const state = resolve(conversationId, projectId);
  const isOverride = state.source === 'conversation-override';

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Agent mode: ${AGENT_MODE_LABEL[state.mode]}`}
          className={chipClass()}
        >
          <OverrideDot show={isOverride} />
          <span>{AGENT_MODE_LABEL[state.mode]}</span>
          <ChevronDown size={10} className="opacity-60 shrink-0" />
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
                    onClick={() => setMode(conversationId, mode)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left',
                      'transition-colors duration-100',
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
  );
}

// ---------------------------------------------------------------------------
// Effort Chip
// ---------------------------------------------------------------------------

interface EffortChipProps {
  conversationId: string;
  projectId: string | null;
}

function EffortChip({ conversationId, projectId }: EffortChipProps) {
  const resolve = useAgentControlStore((s) => s.resolve);
  const setEffort = useAgentControlStore((s) => s.setEffort);
  const state = resolve(conversationId, projectId);
  const isOverride = state.source === 'conversation-override';

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Effort: ${EFFORT_LABEL[state.effort]}`}
          className={chipClass()}
        >
          <OverrideDot show={isOverride} />
          <span>Effort: {EFFORT_LABEL[state.effort]}</span>
          <ChevronDown size={10} className="opacity-60 shrink-0" />
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
          <div className="p-1">
            {EFFORT_LEVELS.map((level) => {
              const isSelected = level === state.effort;
              return (
                <Popover.Close asChild key={level}>
                  <button
                    type="button"
                    onClick={() => setEffort(conversationId, level)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left',
                      'transition-colors duration-100',
                      isSelected
                        ? 'bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary)]'
                        : 'text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{EFFORT_LABEL[level]}</span>
                      <p
                        className={cn(
                          'mt-0.5 text-[10px]',
                          isSelected
                            ? 'text-[var(--chat-accent-primary)]/70'
                            : 'text-[var(--chat-text-muted)]',
                        )}
                      >
                        {EFFORT_DESCRIPTION[level]}
                      </p>
                    </div>
                    {isSelected && (
                      <Check
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
  );
}

// ---------------------------------------------------------------------------
// Temp Chat Chip
// ---------------------------------------------------------------------------

interface TempChipProps {
  conversationId: string;
  projectId: string | null;
}

function TempChip({ conversationId, projectId }: TempChipProps) {
  const resolve = useAgentControlStore((s) => s.resolve);
  const setTemporaryChat = useAgentControlStore((s) => s.setTemporaryChat);
  const state = resolve(conversationId, projectId);
  const isOn = state.temporaryChat;

  return (
    <Tooltip.Provider delayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            aria-label={isOn ? 'Temporary chat: on' : 'Temporary chat: off'}
            onClick={() => setTemporaryChat(conversationId, !isOn)}
            className={chipClass(isOn)}
          >
            <span
              className={cn(
                'h-2 w-2 rounded-full transition-all duration-200',
                isOn ? 'bg-[var(--chat-accent-primary)]' : 'bg-[var(--chat-text-muted)]',
              )}
              aria-hidden
            />
            <span>Temp</span>
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            className={cn(
              'z-50 max-w-[180px] rounded-md px-2 py-1.5 text-[10px] shadow-md',
              'bg-[var(--chat-surface-elevated)] border border-[var(--chat-border)]',
              'text-[var(--chat-text-secondary)] text-center',
            )}
          >
            {isOn
              ? 'Temporary — this conversation will not be saved to history'
              : 'Enable to skip saving this conversation'}
            <Tooltip.Arrow className="fill-[var(--chat-surface-elevated)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

// ---------------------------------------------------------------------------
// AgentControl — public composite component
// ---------------------------------------------------------------------------

export function AgentControl({
  conversationId,
  projectId,
  modelProviderId,
  className,
}: AgentControlProps) {
  // Determine effort visibility from PROVIDER_DISPLAY
  const providerKey = modelProviderId as ProviderId;
  const supportsEffort = PROVIDER_DISPLAY[providerKey]?.supportsEffort ?? false;

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      role="group"
      aria-label="Agent controls"
    >
      <ModeChip conversationId={conversationId} projectId={projectId} />
      {supportsEffort && <EffortChip conversationId={conversationId} projectId={projectId} />}
      <TempChip conversationId={conversationId} projectId={projectId} />
    </div>
  );
}
