import { useCallback, useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useToolStore,
  type ApprovalRequest,
  type ApprovalRiskLevel,
} from '../../stores/chat/toolStore';
import { useApprovalActions } from '../../hooks/useApprovalActions';

function riskBadgeClasses(risk: ApprovalRiskLevel): string {
  switch (risk) {
    case 'high':
      return 'bg-red-500/20 text-red-300';
    case 'medium':
      return 'bg-yellow-500/20 text-yellow-300';
    case 'low':
      return 'bg-green-500/20 text-green-300';
  }
}

interface ApprovalCardProps {
  approval: ApprovalRequest;
  onApprove: (approval: ApprovalRequest) => Promise<void>;
  onDeny: (approval: ApprovalRequest) => Promise<void>;
  busy: boolean;
  error: string | null;
}

function ApprovalCard({ approval, onApprove, onDeny, busy, error }: ApprovalCardProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground/90 font-medium truncate">{approval.description}</p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-medium uppercase',
                riskBadgeClasses(approval.riskLevel),
              )}
            >
              {approval.riskLevel} risk
            </span>
            <span className="text-[10px] text-muted-foreground">
              {approval.type.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      </div>

      {/* Impact description */}
      {approval.impact && (
        <p className="text-[10px] text-muted-foreground/80 pl-6">{approval.impact}</p>
      )}

      {error && (
        <p className="text-[10px] text-red-300 pl-6" role="alert">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pl-6">
        <button
          type="button"
          onClick={() => void onApprove(approval)}
          disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium bg-green-600/20 text-green-300 hover:bg-green-600/30 transition-colors disabled:opacity-50"
        >
          <Check className="w-3 h-3" />
          Approve
        </button>
        <button
          type="button"
          onClick={() => void onDeny(approval)}
          disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium bg-red-600/20 text-red-300 hover:bg-red-600/30 transition-colors disabled:opacity-50"
        >
          <X className="w-3 h-3" />
          Deny
        </button>
      </div>
    </div>
  );
}

export function ExecutionSidecarApprovals() {
  const allPendingApprovals = useToolStore((s) => s.pendingApprovals);
  const { resolveApproval } = useApprovalActions();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  // Ownership split: `features/chat/McpToolConfirmationPrompt` renders
  // `mcp_tool` approvals inline in the transcript, where the tool call the user
  // is judging is visible. This sidecar owns everything else — `tool_execution`
  // (dangerous tools in manual mode), terminal, filesystem, browser, and UI
  // automation — which previously had no renderer at all.
  //
  // Without this filter both surfaces render the same MCP approval and the user
  // sees two Approve buttons for one decision.
  const pendingApprovals = useMemo(
    () => allPendingApprovals.filter((approval) => approval.type !== 'mcp_tool'),
    [allPendingApprovals],
  );

  // Decisions go through `resolveApprovalRequest`, not straight to
  // `toolStore.approveOperation`. The approvals this panel owns are produced by
  // the Rust `ApprovalController`, which parks the suspended step on a oneshot
  // channel and only wakes it from `agent_resolve_approval`. Clearing the queue
  // entry locally would hide the card while the run stayed blocked until the
  // backend's own timeout rejected it.
  //
  // `resolveApprovalRequest` removes the entry from `toolStore` itself once the
  // native call succeeds, so a failure leaves the card on screen to retry
  // instead of silently dropping a decision the agent never received.
  const handleResolve = useCallback(
    async (approval: ApprovalRequest, decision: 'approve' | 'reject') => {
      setBusyId(approval.id);
      setErrorById((current) => {
        if (!(approval.id in current)) return current;
        const next = { ...current };
        delete next[approval.id];
        return next;
      });
      try {
        await resolveApproval(
          approval,
          decision,
          decision === 'reject' ? { reason: 'Denied by user in the execution panel' } : undefined,
        );
      } catch (cause) {
        setErrorById((current) => ({
          ...current,
          [approval.id]:
            cause instanceof Error ? cause.message : 'Could not send this decision to the agent.',
        }));
      } finally {
        setBusyId(null);
      }
    },
    [resolveApproval],
  );

  const handleApprove = useCallback(
    (approval: ApprovalRequest) => handleResolve(approval, 'approve'),
    [handleResolve],
  );

  const handleDeny = useCallback(
    (approval: ApprovalRequest) => handleResolve(approval, 'reject'),
    [handleResolve],
  );

  if (pendingApprovals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 text-xs gap-2 px-4">
        <ShieldCheck className="w-5 h-5 text-emerald-400/60" />
        <span>No pending approvals</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
      {pendingApprovals.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          onApprove={handleApprove}
          onDeny={handleDeny}
          busy={busyId === approval.id}
          error={errorById[approval.id] ?? null}
        />
      ))}
    </div>
  );
}
