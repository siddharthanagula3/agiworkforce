import { Shield } from 'lucide-react';
import type { ApprovalRequest } from '../../stores/unifiedChatStore';
import { ApprovalRequestCard } from './Cards/ApprovalRequestCard';
import { cn } from '../../lib/utils';
import { useMessageApprovals } from './useMessageRuntimeActivity';

interface MessageApprovalsProps {
  messageId: string;
  className?: string;
}

interface MessageApprovalsContentProps {
  approvals: ApprovalRequest[];
  className?: string;
}

export function MessageApprovalsContent({ approvals, className }: MessageApprovalsContentProps) {
  if (approvals.length === 0) {
    return null;
  }

  const approvalReviewCopy =
    approvals.length === 1
      ? 'Review before the agent continues with this action.'
      : 'Review before the agent continues with these actions.';

  return (
    <div
      className={cn(
        'space-y-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-yellow-300">
          <Shield className="h-3.5 w-3.5" />
          Approval needed
        </div>
        <span className="rounded-full border border-yellow-500/20 px-2 py-0.5 text-[10px] font-medium text-yellow-200">
          {approvals.length} pending
        </span>
      </div>
      <p className="text-[11px] text-yellow-100/70">{approvalReviewCopy}</p>
      {approvals.map((approval) => (
        <ApprovalRequestCard
          key={approval.id}
          approval={approval}
          className="border-yellow-500/30 bg-transparent"
        />
      ))}
    </div>
  );
}

export function MessageApprovals({ messageId, className }: MessageApprovalsProps) {
  const approvals = useMessageApprovals(messageId);

  return <MessageApprovalsContent approvals={approvals} className={className} />;
}

export default MessageApprovals;
