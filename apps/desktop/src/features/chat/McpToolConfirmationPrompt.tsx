import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useApprovalActions } from '@/hooks/useApprovalActions';
import { useToolStore, type ApprovalRequest } from '@/stores/chat/toolStore';
import { cn } from '@/lib/utils';

function readDetail(approval: ApprovalRequest, key: string): string | null {
  const value = approval.details[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function riskClasses(risk: ApprovalRequest['riskLevel']): string {
  if (risk === 'high') {
    return 'border-destructive/40 bg-destructive/10 text-destructive';
  }
  if (risk === 'medium') {
    return 'border-warning/40 bg-warning/10 text-warning';
  }
  return 'border-success/40 bg-success/10 text-success';
}

function formatArguments(approval: ApprovalRequest): string {
  const args = approval.details['arguments'];
  if (args && typeof args === 'object') {
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      // Fall through to the legacy summary when a non-serializable value
      // somehow crosses the event boundary.
    }
  }

  return readDetail(approval, 'parametersSummary') ?? '{}';
}

export function McpToolConfirmationPrompt() {
  const pendingApprovals = useToolStore((state) => state.pendingApprovals);
  const { resolveApproval } = useApprovalActions();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionError, setResolutionError] = useState<{
    approvalId: string;
    message: string;
  } | null>(null);

  const confirmations = useMemo(
    () => pendingApprovals.filter((approval) => approval.type === 'mcp_tool'),
    [pendingApprovals],
  );
  const approval = confirmations[0];

  if (!approval) {
    return null;
  }

  const toolName = readDetail(approval, 'tool') ?? readDetail(approval, 'toolName') ?? 'MCP tool';
  const reason = readDetail(approval, 'reason');
  const safetyTier = readDetail(approval, 'safetyTier');
  const summaryHash = readDetail(approval, 'summaryHash');
  const undoDescription = readDetail(approval, 'undoDescription');
  const argumentsText = formatArguments(approval);
  const isResolving = resolvingId === approval.id;
  const error = resolutionError?.approvalId === approval.id ? resolutionError.message : null;

  const resolve = async (decision: 'approve' | 'reject') => {
    setResolvingId(approval.id);
    setResolutionError(null);
    try {
      await resolveApproval(approval, decision, {
        reason: decision === 'reject' ? 'Denied by user' : undefined,
      });
    } catch (cause) {
      setResolutionError({
        approvalId: approval.id,
        message: cause instanceof Error ? cause.message : 'Could not send your decision.',
      });
    } finally {
      setResolvingId((currentId) => (currentId === approval.id ? null : currentId));
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mcp-tool-confirmation-title"
      aria-describedby="mcp-tool-confirmation-description"
      data-testid="mcp-tool-confirmation-prompt"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span className="rounded-xl bg-destructive/10 p-2 text-destructive">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="mcp-tool-confirmation-title" className="text-base font-semibold">
                Tool approval required
              </h2>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                  riskClasses(approval.riskLevel),
                )}
              >
                {approval.riskLevel} risk
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-medium text-foreground">{toolName}</p>
            {confirmations.length > 1 && (
              <p className="mt-1 text-xs text-muted-foreground">
                1 of {confirmations.length} tool requests awaiting a decision
              </p>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p id="mcp-tool-confirmation-description" className="text-sm text-foreground">
            {approval.description}
          </p>

          {(reason || safetyTier) && (
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              {reason && (
                <div>
                  <dt className="font-medium text-muted-foreground">Why this is requested</dt>
                  <dd className="mt-1 text-foreground">{reason}</dd>
                </div>
              )}
              {safetyTier && (
                <div>
                  <dt className="font-medium text-muted-foreground">Safety policy</dt>
                  <dd className="mt-1 text-foreground">{safetyTier}</dd>
                </div>
              )}
            </dl>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Complete arguments sent to the tool
            </p>
            <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
              {argumentsText}
            </pre>
          </div>

          {summaryHash && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Argument fingerprint</p>
              <code className="mt-1 block break-all font-mono text-[11px] text-foreground">
                sha256:{summaryHash}
              </code>
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            {approval.details['reversible'] === true ? (
              <p>
                This action is marked reversible
                {undoDescription ? `: ${undoDescription}` : '.'}
              </p>
            ) : (
              <p className="flex items-start gap-2 text-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                This action is not marked reversible.
              </p>
            )}
            <p className="mt-2">
              If you do nothing, the native request expires after {approval.timeoutSeconds ?? 120}{' '}
              seconds and the tool is refused.
            </p>
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              Your decision was not sent. The tool remains blocked. {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={isResolving}
            onClick={() => void resolve('reject')}
          >
            <X className="mr-2 h-4 w-4" aria-hidden="true" />
            Deny
          </Button>
          <Button type="button" disabled={isResolving} onClick={() => void resolve('approve')}>
            <Check className="mr-2 h-4 w-4" aria-hidden="true" />
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}
