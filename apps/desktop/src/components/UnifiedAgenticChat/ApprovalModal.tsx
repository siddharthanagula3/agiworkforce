import { useState } from 'react';
import { Shield, AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { cn } from '../../lib/utils';
import { useApprovalActions } from '../../hooks/useApprovalActions';

export const ApprovalModal = () => {
  const pendingApprovals = useUnifiedChatStore((s) => s.pendingApprovals);
  const { resolveApproval } = useApprovalActions();

  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [alwaysAllow, setAlwaysAllow] = useState(false);

  // Get the first pending approval (FIFO queue)
  const currentApproval = pendingApprovals.find((a) => a.status === 'pending');

  const handleApprove = async () => {
    if (!currentApproval) return;

    setIsApproving(true);
    try {
      await resolveApproval(currentApproval, 'approve', { trust: alwaysAllow });
      setAlwaysAllow(false);
      console.log('[ApprovalModal] Operation approved:', currentApproval.id);
    } catch (error) {
      console.error('[ApprovalModal] Failed to approve:', error);
      // TODO: Show error toast
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!currentApproval) return;

    setIsRejecting(true);
    try {
      await resolveApproval(currentApproval, 'reject', {
        reason: 'User rejected from approval modal',
      });
      setAlwaysAllow(false);
      console.log('[ApprovalModal] Operation rejected:', currentApproval.id);
    } catch (error) {
      console.error('[ApprovalModal] Failed to reject:', error);
      // TODO: Show error toast
    } finally {
      setIsRejecting(false);
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'high':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'medium':
        return <Info className="h-5 w-5 text-yellow-500" />;
      case 'low':
        return <Shield className="h-5 w-5 text-blue-500" />;
      default:
        return <Info className="h-5 w-5 text-gray-500" />;
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-400';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  if (!currentApproval) return null;

  return (
    <Dialog open={!!currentApproval} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-orange-500" />
            Agent Approval Required
          </DialogTitle>
          <DialogDescription>
            The agent needs your permission to perform a potentially dangerous operation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Risk Level Badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Risk Level:</span>
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold uppercase',
                getRiskColor(currentApproval.riskLevel),
              )}
            >
              {getRiskIcon(currentApproval.riskLevel)}
              {currentApproval.riskLevel}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Operation:</h4>
            <p className="text-sm text-muted-foreground">{currentApproval.description}</p>
          </div>

          {/* Impact */}
          {currentApproval.impact && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Impact:</h4>
              <p className="text-sm text-muted-foreground">{currentApproval.impact}</p>
            </div>
          )}

          {/* Details */}
          {currentApproval.details && Object.keys(currentApproval.details).length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Details:</h4>
              <div className="bg-muted rounded-lg p-3 max-h-[200px] overflow-y-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                  {JSON.stringify(currentApproval.details, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Warning message */}
          <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-800 dark:text-yellow-400">
              Only approve if you trust this operation. Rejecting will stop the agent from
              proceeding with this action.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-gray-200/80 p-3 text-sm dark:border-gray-800">
            <Checkbox
              id="always-allow"
              checked={alwaysAllow}
              onCheckedChange={(checked) => setAlwaysAllow(Boolean(checked))}
            />
            <label
              htmlFor="always-allow"
              className="flex-1 text-xs text-gray-600 dark:text-gray-300"
            >
              Always allow this operation for this workflow in the future.
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={isRejecting || isApproving}
            className="gap-2"
          >
            <XCircle className="h-4 w-4" />
            {isRejecting ? 'Rejecting...' : 'Reject'}
          </Button>
          <Button
            variant="default"
            onClick={handleApprove}
            disabled={isApproving || isRejecting}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="h-4 w-4" />
            {isApproving ? 'Approving...' : 'Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
