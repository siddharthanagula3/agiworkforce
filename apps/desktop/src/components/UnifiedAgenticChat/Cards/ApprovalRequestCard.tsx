import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Check,
  X,
  Clock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  FileX,
  Terminal,
  Globe,
  Database,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { ApprovalRequest } from '../../../stores/unifiedChatStore';
import { CodeBlock } from '../Visualizations/CodeBlock';
import { useApprovalActions } from '../../../hooks/useApprovalActions';

export interface ApprovalRequestCardProps {
  approval: ApprovalRequest;
  onApprove?: () => void;
  onReject?: (reason?: string) => void;
  className?: string;
}

const TYPE_ICONS = {
  file_delete: FileX,
  terminal_command: Terminal,
  api_call: Globe,
  data_modification: Database,
};

const RISK_LEVEL_CONFIG = {
  low: {
    icon: ShieldCheck,
    color: 'text-green-500 bg-green-50 dark:bg-green-900/20',
    label: 'Low Risk',
  },
  medium: {
    icon: Shield,
    color: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
    label: 'Medium Risk',
  },
  high: {
    icon: ShieldAlert,
    color: 'text-red-500 bg-red-50 dark:bg-red-900/20',
    label: 'High Risk',
  },
};

const STATUS_CONFIG = {
  pending: {
    color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    label: 'Pending',
  },
  approved: {
    color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    label: 'Approved',
  },
  rejected: {
    color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    label: 'Rejected',
  },
  timeout: {
    color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    label: 'Timeout',
  },
};

export const ApprovalRequestCard: React.FC<ApprovalRequestCardProps> = ({
  approval,
  onApprove,
  onReject,
  className = '',
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [pendingDecision, setPendingDecision] = useState<'approve' | 'reject' | null>(null);
  const { resolveApproval } = useApprovalActions();

  const TypeIcon = TYPE_ICONS[approval.type];
  const riskConfig = RISK_LEVEL_CONFIG[approval.riskLevel];
  const RiskIcon = riskConfig.icon;
  const statusConfig = STATUS_CONFIG[approval.status];

  // Calculate time remaining for timeout
  useEffect(() => {
    if (approval.status !== 'pending' || !approval.timeoutSeconds) {
      setTimeRemaining(null);
      return;
    }

    const calculateRemaining = () => {
      const elapsed = (Date.now() - new Date(approval.createdAt).getTime()) / 1000;
      const remaining = approval.timeoutSeconds! - elapsed;
      setTimeRemaining(Math.max(0, Math.floor(remaining)));
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);
    return () => clearInterval(interval);
  }, [approval.createdAt, approval.timeoutSeconds, approval.status]);

  const formattedTime = new Date(approval.createdAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const handleApprove = async () => {
    if (onApprove) {
      onApprove();
      return;
    }

    setPendingDecision('approve');
    try {
      await resolveApproval(approval, 'approve');
    } catch (error) {
      console.error('Failed to approve operation:', error);
    } finally {
      setPendingDecision(null);
    }
  };

  const handleReject = async () => {
    if (showRejectReason) {
      if (onReject) {
        onReject(rejectReason || undefined);
        setShowRejectReason(false);
        setRejectReason('');
      } else {
        setPendingDecision('reject');
        try {
          await resolveApproval(approval, 'reject', {
            reason: rejectReason || undefined,
          });
          setShowRejectReason(false);
          setRejectReason('');
        } catch (error) {
          console.error('Failed to reject operation:', error);
        } finally {
          setPendingDecision(null);
        }
      }
      return;
    }

    setShowRejectReason(true);
  };

  const formatJson = (data: any): string => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const detailsJson = approval.details ? formatJson(approval.details) : '';

  return (
    <div
      className={`approval-request-card rounded-lg border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-900/10 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Type Icon */}
          <div className={`p-2 rounded-lg ${riskConfig.color} flex-shrink-0`}>
            <TypeIcon size={20} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-400">
                Approval Required
              </span>
              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${statusConfig.color}`}
              >
                {statusConfig.label}
              </div>
            </div>

            {/* Risk Level */}
            <div className="flex items-center gap-2 mb-2">
              <RiskIcon size={16} className={riskConfig.color.split(' ')[0]} />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {riskConfig.label}
              </span>
            </div>

            {/* Description */}
            <div className="text-sm text-gray-800 dark:text-gray-200 mb-2">
              {approval.description}
            </div>

            {/* Impact */}
            {approval.impact && (
              <div className="flex items-start gap-2 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded text-xs text-yellow-800 dark:text-yellow-200 mb-2">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{approval.impact}</span>
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400 flex-wrap">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formattedTime}
              </span>
              {timeRemaining !== null && timeRemaining > 0 && (
                <span className="flex items-center gap-1 text-yellow-700 dark:text-yellow-300">
                  <Clock size={12} />
                  Timeout in {timeRemaining}s
                </span>
              )}
              {approval.approvedAt && (
                <span className="text-green-600 dark:text-green-400">
                  Approved {new Date(approval.approvedAt).toLocaleTimeString()}
                </span>
              )}
              {approval.rejectedAt && (
                <span className="text-red-600 dark:text-red-400">
                  Rejected {new Date(approval.rejectedAt).toLocaleTimeString()}
                </span>
              )}
            </div>

            {/* Rejection Reason */}
            {approval.status === 'rejected' && approval.rejectionReason && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-300">
                Reason: {approval.rejectionReason}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Details Section */}
      {approval.details && (
        <div className="px-4 pb-2 border-t border-yellow-200 dark:border-yellow-800">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 py-2 hover:text-gray-900 dark:hover:text-gray-100"
          >
            {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Details
          </button>
          {showDetails && (
            <div className="pb-2">
              <CodeBlock
                code={detailsJson}
                language="json"
                showLineNumbers={false}
                enableCopy={true}
              />
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {approval.status === 'pending' && (
        <div className="px-4 py-3 bg-yellow-100 dark:bg-yellow-900/20 border-t border-yellow-200 dark:border-yellow-800">
          {showRejectReason ? (
            <div className="space-y-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (optional)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleReject}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-60"
                  disabled={pendingDecision === 'reject'}
                >
                  Confirm Rejection
                </button>
                <button
                  onClick={() => {
                    setShowRejectReason(false);
                    setRejectReason('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleApprove}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                disabled={pendingDecision !== null}
              >
                <Check size={16} />
                Approve
              </button>
              <button
                onClick={handleReject}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                disabled={pendingDecision !== null}
              >
                <X size={16} />
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ApprovalRequestCard;
