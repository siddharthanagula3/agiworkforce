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

  return (
    <div className={cn('space-y-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3', className)}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-yellow-300">
        <Shield className="h-3.5 w-3.5" />
        Pending approvals
      </div>
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
