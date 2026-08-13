import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Check, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/ui/Dialog';
import { useApprovalActions } from '@/hooks/useApprovalActions';
import { useToolStore, type ApprovalRequest } from '@/stores/chat/toolStore';
import { cn } from '@/lib/utils';
import { FolderAccessConsentDialog } from './FolderAccessConsentDialog';

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

function formatApprovalLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/\bMcp\b/gi, 'MCP');
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

  const toolName = approval
    ? formatApprovalLabel(
        readDetail(approval, 'tool') ?? readDetail(approval, 'toolName') ?? 'MCP tool',
      )
    : 'MCP tool';
  const reason = approval ? readDetail(approval, 'reason') : null;
  const safetyTier = approval ? readDetail(approval, 'safetyTier') : null;
  const summaryHash = approval ? readDetail(approval, 'summaryHash') : null;
  const undoDescription = approval ? readDetail(approval, 'undoDescription') : null;
  const argumentsText = approval ? formatArguments(approval) : '{}';
  const isResolving = Boolean(approval && resolvingId === approval.id);
  const error =
    approval && resolutionError?.approvalId === approval.id ? resolutionError.message : null;
  const isFolderAccess = approval
    ? toolName === 'folder access' || readDetail(approval, 'toolName') === 'folder_access'
    : false;

  const resolve = useCallback(
    async (decision: 'approve' | 'reject') => {
      if (!approval) return;
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
    },
    [approval, resolveApproval],
  );

  if (!approval) {
    return null;
  }

  if (isFolderAccess) {
    return <FolderAccessConsentDialog approval={approval} pendingCount={confirmations.length} />;
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Closing the modal is the safe decision: a privileged native request
        // must never continue merely because the overlay was dismissed.
        if (!open && !isResolving) void resolve('reject');
      }}
    >
      <DialogContent
        disableAnimation
        hideCloseButton
        className="z-[var(--z-fullscreen)] flex max-h-[calc(100vh-3rem)] w-[min(42rem,calc(100vw-3rem))] max-w-none flex-col gap-0 overflow-hidden border-border bg-card p-0 shadow-2xl"
        overlayProps={{ className: 'z-[var(--z-fullscreen)] bg-background/80' }}
        role="alertdialog"
        data-testid="mcp-tool-confirmation-prompt"
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span className="rounded-xl bg-destructive/10 p-2 text-destructive">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-base font-semibold">Tool approval required</DialogTitle>
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
          <DialogDescription className="text-sm text-foreground">
            {approval.description}
          </DialogDescription>

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
                  <dd className="mt-1 text-foreground">{formatApprovalLabel(safetyTier)}</dd>
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
            autoFocus
            disabled={isResolving}
            onClick={() => void resolve('reject')}
            aria-label="Deny"
          >
            <X className="mr-2 h-4 w-4" aria-hidden="true" />
            Deny
            <kbd className="ml-2 rounded border border-border px-1 text-[10px]">Esc</kbd>
          </Button>
          <Button
            type="button"
            disabled={isResolving}
            onClick={() => void resolve('approve')}
            aria-label="Approve"
          >
            <Check className="mr-2 h-4 w-4" aria-hidden="true" />
            Approve
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
