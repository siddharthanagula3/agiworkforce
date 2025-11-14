/**
 * ToolApprovalDialog Component
 *
 * Modal dialog for approving dangerous tool operations.
 * Shows tool details, parameters, and risk level before execution.
 */

import { useState } from 'react';
import { AlertTriangle, Play, X, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { JsonViewer } from './JsonViewer';
import { cn } from '../../lib/utils';
import type { ToolApprovalRequestPayload } from '../../types/toolCalling';

interface ToolApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  approval: ToolApprovalRequestPayload;
  onApprove: () => void;
  onReject: () => void;
}

export function ToolApprovalDialog({
  open,
  onOpenChange,
  approval,
  onApprove,
  onReject,
}: ToolApprovalDialogProps) {
  const [showParameters, setShowParameters] = useState(true);
  const [approving, setApproving] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    try {
      onApprove();
    } finally {
      setApproving(false);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900';
      case 'medium':
        return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900';
      case 'low':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900';
      default:
        return 'text-muted-foreground bg-muted/20 border-border';
    }
  };

  const getRiskBadgeColor = (risk: string) => {
    switch (risk) {
      case 'high':
        return 'bg-red-600 text-white';
      case 'medium':
        return 'bg-orange-600 text-white';
      case 'low':
        return 'bg-yellow-600 text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Tool Approval Required
          </DialogTitle>
          <DialogDescription>
            Review the tool execution details before approving. This operation may have security or
            data implications.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-4">
          {/* Risk Level Badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Risk Level:</span>
            <span
              className={cn(
                'px-2 py-0.5 rounded text-xs font-bold uppercase',
                getRiskBadgeColor(approval.risk_level),
              )}
            >
              {approval.risk_level}
            </span>
          </div>

          {/* Tool Information */}
          <div className="space-y-2">
            <div>
              <span className="text-sm font-semibold text-muted-foreground">Tool:</span>
              <span className="ml-2 font-mono font-semibold">{approval.tool_name}</span>
            </div>

            {/* Reason for Approval */}
            <div
              className={cn(
                'p-3 rounded border',
                getRiskColor(approval.risk_level),
              )}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-sm mb-1">Why approval is needed:</div>
                  <div className="text-sm">{approval.reason}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Parameters */}
          {Object.keys(approval.parameters).length > 0 && (
            <div>
              <button
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2 hover:text-foreground transition-colors"
                onClick={() => setShowParameters(!showParameters)}
              >
                {showParameters ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Parameters
              </button>
              {showParameters && (
                <JsonViewer
                  data={approval.parameters}
                  maxHeight="300px"
                  defaultExpanded={true}
                />
              )}
            </div>
          )}

          {/* Security Warning */}
          {approval.risk_level === 'high' && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded">
              <div className="flex items-start gap-2 text-red-900 dark:text-red-100">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                <div className="text-sm">
                  <strong>High Risk Operation:</strong> This tool may modify system state, access
                  sensitive data, or perform irreversible actions. Please review carefully before
                  approving.
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onReject}
            disabled={approving}
          >
            <X className="h-4 w-4 mr-2" />
            Reject
          </Button>
          <Button
            onClick={handleApprove}
            disabled={approving}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Play className="h-4 w-4 mr-2" />
            {approving ? 'Approving...' : 'Approve & Execute'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
