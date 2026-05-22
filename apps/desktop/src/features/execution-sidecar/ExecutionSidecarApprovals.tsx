import { useCallback } from 'react';
import { ShieldCheck, ShieldAlert, Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useToolStore,
  type ApprovalRequest,
  type ApprovalRiskLevel,
} from '../../stores/chat/toolStore';

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
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

function ApprovalCard({ approval, onApprove, onDeny }: ApprovalCardProps) {
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

      {/* Actions */}
      <div className="flex items-center gap-2 pl-6">
        <button
          type="button"
          onClick={() => onApprove(approval.id)}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium bg-green-600/20 text-green-300 hover:bg-green-600/30 transition-colors"
        >
          <Check className="w-3 h-3" />
          Approve
        </button>
        <button
          type="button"
          onClick={() => onDeny(approval.id)}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium bg-red-600/20 text-red-300 hover:bg-red-600/30 transition-colors"
        >
          <X className="w-3 h-3" />
          Deny
        </button>
      </div>
    </div>
  );
}

export function ExecutionSidecarApprovals() {
  const pendingApprovals = useToolStore((s) => s.pendingApprovals);
  const approveOperation = useToolStore((s) => s.approveOperation);
  const rejectOperation = useToolStore((s) => s.rejectOperation);

  const handleApprove = useCallback(
    (id: string) => {
      approveOperation(id);
    },
    [approveOperation],
  );

  const handleDeny = useCallback(
    (id: string) => {
      rejectOperation(id);
    },
    [rejectOperation],
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
        />
      ))}
    </div>
  );
}
