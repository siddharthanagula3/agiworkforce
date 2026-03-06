import { useEffect, useState } from 'react';
import { Check, X, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import {
  useToolStore,
  type ApprovalRequest,
  type ApprovalRiskLevel,
} from '../../stores/chat/toolStore';

const AUTO_DENY_SECONDS = 30;

const RISK_CONFIG: Record<ApprovalRiskLevel, { label: string; badge: string; border: string }> = {
  low: {
    label: 'Low risk',
    badge: 'bg-emerald-100 text-emerald-700',
    border: 'border-slate-200',
  },
  medium: {
    label: 'Medium risk',
    badge: 'bg-amber-100 text-amber-700',
    border: 'border-amber-200',
  },
  high: {
    label: 'High risk',
    badge: 'bg-rose-100 text-rose-700',
    border: 'border-rose-300',
  },
};

interface RemoteApprovalCardProps {
  approval: ApprovalRequest;
}

export function RemoteApprovalCard({ approval }: RemoteApprovalCardProps) {
  const approveOperation = useToolStore((state) => state.approveOperation);
  const rejectOperation = useToolStore((state) => state.rejectOperation);

  const [secondsLeft, setSecondsLeft] = useState(AUTO_DENY_SECONDS);
  const [acting, setActing] = useState<'approve' | 'deny' | null>(null);

  const riskConfig = RISK_CONFIG[approval.riskLevel] ?? RISK_CONFIG['medium'];

  // Countdown timer — auto-deny for security when time runs out
  useEffect(() => {
    if (secondsLeft <= 0) {
      rejectOperation(approval.id, 'Auto-denied: approval timed out after 30 seconds');
      return;
    }
    const interval = window.setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [secondsLeft, approval.id, rejectOperation]);

  const handleApprove = () => {
    setActing('approve');
    approveOperation(approval.id);
  };

  const handleDeny = () => {
    setActing('deny');
    rejectOperation(approval.id, 'Denied by user via Mobile Companion panel');
  };

  const isActing = acting !== null;
  const timerColor =
    secondsLeft <= 5 ? 'text-rose-600' : secondsLeft <= 10 ? 'text-amber-600' : 'text-slate-500';

  return (
    <div className={cn('rounded-lg border bg-white shadow-xs p-4 space-y-3', riskConfig.border)}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-mono font-semibold text-slate-700 truncate">
              {approval.type.replace(/_/g, ' ')}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                riskConfig.badge,
              )}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              {riskConfig.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600 line-clamp-3">{approval.description}</p>
          {approval.impact && (
            <p className="mt-1 text-xs text-slate-500 italic">{approval.impact}</p>
          )}
        </div>

        {/* Countdown */}
        <div className={cn('flex items-center gap-1 shrink-0 text-xs font-mono', timerColor)}>
          <Clock className="h-3 w-3" />
          {secondsLeft}s
        </div>
      </div>

      {/* Progress bar for countdown */}
      <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-1000',
            secondsLeft <= 5
              ? 'bg-rose-500'
              : secondsLeft <= 10
                ? 'bg-amber-400'
                : 'bg-emerald-500',
          )}
          style={{ width: `${(secondsLeft / AUTO_DENY_SECONDS) * 100}%` }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
          onClick={handleApprove}
          disabled={isActing}
        >
          <Check className="h-3.5 w-3.5" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 border-rose-300 text-rose-700 hover:bg-rose-50 gap-1"
          onClick={handleDeny}
          disabled={isActing}
        >
          <X className="h-3.5 w-3.5" />
          Deny
        </Button>
      </div>
    </div>
  );
}
