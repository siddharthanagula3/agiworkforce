'use client';

import { useMemo } from 'react';
import { Button, useConfirmAction } from '@agiworkforce/ui';
import {
  TOOL_APPROVAL_DESTRUCTIVE_NOTICE,
  TOOL_APPROVAL_NO_PARAMETERS,
  TOOL_APPROVAL_RISK_LABELS,
  TOOL_APPROVAL_SCOPE_DECISIONS,
  TOOL_APPROVAL_SCOPE_LABELS,
  TOOL_APPROVAL_SESSION_SCOPE_NOTE,
  effectiveToolApprovalReview,
  toolApprovalParameterRows,
  toolApprovalRawParameters,
  toolApprovalScopeConfirmation,
  type ToolApprovalReview,
  type ToolApprovalRiskTier,
  type ToolApprovalScope,
} from '@agiworkforce/cloud-contracts';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import type { ToolApprovalDecision } from '@/lib/hooks/useChatStream';

const RISK_TEXT: Readonly<Record<ToolApprovalRiskTier, string>> = {
  low: 'text-muted-foreground',
  medium: 'text-warning-text',
  high: 'text-danger-text',
  critical: 'text-danger-text',
};

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
  const effective = effectiveToolApprovalReview(review);
  const { confirm, dialog } = useConfirmAction();
  const entries = useMemo(() => toolApprovalParameterRows(parameters), [parameters]);
  const raw = useMemo(() => toolApprovalRawParameters(parameters), [parameters]);

  const decide = (decision: ToolApprovalDecision) => onDecide(toolCallId, decision);

  const allow = (scope: ToolApprovalScope) => {
    if (scope !== 'once' && effective.destructive) {
      const confirmation = toolApprovalScopeConfirmation(scope, label, {
        ...(connectorName ? { connectorName } : {}),
        ...(toolLabel ? { toolLabel } : {}),
      });
      confirm({
        title: confirmation.title,
        description: confirmation.message,
        confirmLabel: confirmation.confirmLabel,
        destructive: true,
        onConfirm: () => decide(TOOL_APPROVAL_SCOPE_DECISIONS[scope]),
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
          {TOOL_APPROVAL_RISK_LABELS[effective.riskTier]}
        </span>
      </div>
      {effective.destructive ? (
        <p className="mt-1 text-xs text-muted-foreground">{TOOL_APPROVAL_DESTRUCTIVE_NOTICE}</p>
      ) : null}

      {entries.length > 0 ? (
        <dl className="mt-3 grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {entries.map(({ key, value }) => (
            <div key={key} className="contents">
              <dt className="truncate font-mono text-muted-foreground">{key}</dt>
              <dd className="break-words font-mono text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{TOOL_APPROVAL_NO_PARAMETERS}</p>
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
            {TOOL_APPROVAL_SCOPE_LABELS[scope]}
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
        <p className="mt-2 text-xs text-muted-foreground">{TOOL_APPROVAL_SESSION_SCOPE_NOTE}</p>
      ) : null}
      {dialog}
    </section>
  );
}
