'use client';

import { useMemo } from 'react';
import { Button, useConfirmAction } from '@agiworkforce/ui';
import {
  TOOL_APPROVAL_SCOPE_DECISIONS,
  type ToolApprovalReview,
  type ToolApprovalRiskTier,
  type ToolApprovalScope,
} from '@agiworkforce/cloud-contracts';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import type { ToolApprovalDecision } from '@/lib/hooks/useChatStream';

const RISK_LABELS: Readonly<Record<ToolApprovalRiskTier, string>> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
  critical: 'Critical risk',
};

const RISK_TEXT: Readonly<Record<ToolApprovalRiskTier, string>> = {
  low: 'text-muted-foreground',
  medium: 'text-warning-text',
  high: 'text-danger-text',
  critical: 'text-danger-text',
};

const UNREVIEWED: ToolApprovalReview = { riskTier: 'high', destructive: true, scopes: ['once'] };

const MAX_VALUE_CHARS = 280;
const MAX_RAW_CHARS = 20_000;

const SCOPE_LABELS: Readonly<Record<ToolApprovalScope, string>> = {
  once: TOOL_APPROVAL_ACTION_LABELS.allowOnce,
  session: TOOL_APPROVAL_ACTION_LABELS.allowForConversation,
  always: TOOL_APPROVAL_ACTION_LABELS.alwaysAllow,
};

function formatValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

function formatRaw(parameters: Record<string, unknown>): string {
  const text = JSON.stringify(parameters, null, 2);
  return text.length > MAX_RAW_CHARS ? `${text.slice(0, MAX_RAW_CHARS)}\n…` : text;
}

export interface ToolApprovalCardProps {
  toolCallId: string;
  label: string;
  /** Connector and tool named apart, for the "Always allow" confirmation. */
  connectorName?: string;
  toolLabel?: string;
  parameters?: Record<string, unknown>;
  review?: ToolApprovalReview;
  decided: boolean;
  onDecide: (toolCallId: string, decision: ToolApprovalDecision) => void;
}

export function ToolApprovalCard({
  toolCallId,
  label,
  connectorName,
  toolLabel,
  parameters,
  review,
  decided,
  onDecide,
}: ToolApprovalCardProps) {
  const effective = review ?? UNREVIEWED;
  const { confirm, dialog } = useConfirmAction();
  const entries = useMemo(() => Object.entries(parameters ?? {}), [parameters]);
  const raw = useMemo(
    () => (entries.length > 0 ? formatRaw(parameters ?? {}) : null),
    [entries.length, parameters],
  );

  const decide = (decision: ToolApprovalDecision) => onDecide(toolCallId, decision);

  const allow = (scope: ToolApprovalScope) => {
    if (scope === 'session' && effective.destructive) {
      confirm({
        title: `Allow ${label} for the rest of this chat?`,
        description:
          `Every later call to ${label} in this conversation will run without asking. It can ` +
          'change or delete data that cannot be recovered, and nothing it does can be undone ' +
          'from here. The permission lasts until this chat is deleted or you reset the tool in Settings, Connectors for this workspace.',
        confirmLabel: TOOL_APPROVAL_ACTION_LABELS.allowForConversation,
        destructive: true,
        onConfirm: () => decide(TOOL_APPROVAL_SCOPE_DECISIONS.session),
      });
      return;
    }
    if (scope === 'always' && effective.destructive) {
      const subject = connectorName && toolLabel ? `${toolLabel} on ${connectorName}` : label;
      confirm({
        title: `Always allow ${subject}?`,
        description:
          `${subject} will run without asking, including writes that cannot be undone. ` +
          'This applies to every chat until you change it in Settings, Connectors.',
        confirmLabel: TOOL_APPROVAL_ACTION_LABELS.alwaysAllow,
        destructive: true,
        onConfirm: () => decide(TOOL_APPROVAL_SCOPE_DECISIONS.always),
      });
      return;
    }
    decide(TOOL_APPROVAL_SCOPE_DECISIONS[scope]);
  };

  return (
    <section
      aria-label={`Approve ${label}`}
      className="rounded-xl border border-border bg-background p-3 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 font-medium text-foreground">{label}</p>
        <span
          className={cn(
            'rounded-full border border-border px-2 py-0.5 text-xs font-medium',
            RISK_TEXT[effective.riskTier],
          )}
        >
          {RISK_LABELS[effective.riskTier]}
        </span>
      </div>
      {effective.destructive ? (
        <p className="mt-1 text-xs text-muted-foreground">
          This tool can change or delete data, and its effect may not be reversible.
        </p>
      ) : null}

      {entries.length > 0 ? (
        <dl className="mt-3 grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="truncate font-mono text-muted-foreground">{key}</dt>
              <dd className="break-words font-mono text-foreground">{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">No parameters.</p>
      )}

      {raw ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer rounded-compact text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
            Raw JSON
          </summary>
          <pre className="mt-1 max-h-60 overflow-auto rounded-compact bg-muted/50 p-2 font-mono leading-relaxed text-foreground">
            {raw}
          </pre>
        </details>
      ) : null}

      <div
        role="group"
        aria-label={`Decision for ${label}`}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        {effective.scopes.map((scope) => (
          <Button
            key={scope}
            type="button"
            size="sm"
            variant={scope === 'once' ? 'default' : 'outline'}
            disabled={decided}
            onClick={() => allow(scope)}
          >
            {SCOPE_LABELS[scope]}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={decided}
          onClick={() => decide('rejected')}
        >
          {TOOL_APPROVAL_ACTION_LABELS.deny}
        </Button>
      </div>
      {effective.scopes.includes('session') ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Conversation approvals last until you delete this chat or reset the tool in Settings,
          Connectors for this workspace.
        </p>
      ) : null}
      {dialog}
    </section>
  );
}
