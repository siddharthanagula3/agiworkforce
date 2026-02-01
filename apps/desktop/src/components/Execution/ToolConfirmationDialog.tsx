/**
 * ToolConfirmationDialog - Safety tier confirmation dialog for dangerous tool executions
 *
 * This component displays a modal dialog when the AGI wants to execute a tool
 * that requires user confirmation based on its safety tier.
 *
 * Safety Tiers:
 * - Safe: Execute immediately (no dialog shown)
 * - RequiresNotification: Execute but notify user (toast notification)
 * - RequiresConfirmation: Show confirmation dialog
 * - RequiresExplicitApproval: Show detailed approval dialog with parameter review
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
  Clock,
  FileEdit,
  Terminal,
  Globe,
  Database,
  Code,
  Undo2,
} from 'lucide-react';
import { invoke, isTauri } from '../../lib/tauri-mock';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { cn } from '../../lib/utils';

// ============================================================================
// Types
// ============================================================================

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type SafetyTier =
  | 'Safe'
  | 'RequiresNotification'
  | 'RequiresConfirmation'
  | 'RequiresExplicitApproval';

export interface ToolConfirmationSummary {
  request_id: string;
  tool_name: string;
  tool_display_name: string;
  description: string;
  parameters_summary: string;
  risk_level: RiskLevel;
  safety_tier: SafetyTier;
  reason: string;
  reversible: boolean;
  undo_description: string | null;
}

interface ToolConfirmationDialogProps {
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ToolConfirmationDialog({ className }: ToolConfirmationDialogProps) {
  const [pendingConfirmation, setPendingConfirmation] = useState<ToolConfirmationSummary | null>(
    null,
  );
  const [rememberChoice, setRememberChoice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Ref to hold handleResponse to avoid stale closures in timer
  const handleResponseRef = useRef<((approved: boolean, reason?: string) => Promise<void>) | null>(
    null,
  );

  // Listen for confirmation requests
  useEffect(() => {
    if (!isTauri) return;

    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<ToolConfirmationSummary>('tool:confirmation_required', (event) => {
        setPendingConfirmation(event.payload);
        setRememberChoice(false);
        setTimeRemaining(120); // 2 minutes timeout
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Handle user response
  const handleResponse = useCallback(
    async (approved: boolean, reason?: string) => {
      if (!pendingConfirmation || isSubmitting) return;

      setIsSubmitting(true);

      try {
        await invoke('respond_tool_confirmation', {
          request_id: pendingConfirmation.request_id,
          approved,
          remember_choice: rememberChoice,
          reason: reason || null,
        });
      } catch (error) {
        console.error('[ToolConfirmation] Failed to respond:', error);
      } finally {
        setIsSubmitting(false);
        setPendingConfirmation(null);
        setTimeRemaining(null);
      }
    },
    [pendingConfirmation, rememberChoice, isSubmitting],
  );

  // Keep ref updated with latest handleResponse
  useEffect(() => {
    handleResponseRef.current = handleResponse;
  }, [handleResponse]);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          // Timeout - auto-deny
          handleResponseRef.current?.(false, 'Confirmation timed out');
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  // Handle dialog close (cancel)
  const handleClose = useCallback(async () => {
    if (!pendingConfirmation) return;

    try {
      await invoke('cancel_tool_confirmation', {
        request_id: pendingConfirmation.request_id,
      });
    } catch (error) {
      console.error('[ToolConfirmation] Failed to cancel:', error);
    }

    setPendingConfirmation(null);
    setTimeRemaining(null);
  }, [pendingConfirmation]);

  // Don't render if no pending confirmation
  if (!pendingConfirmation) {
    return null;
  }

  const isExplicitApproval = pendingConfirmation.safety_tier === 'RequiresExplicitApproval';
  const riskInfo = getRiskLevelInfo(pendingConfirmation.risk_level);
  const toolIcon = getToolIcon(pendingConfirmation.tool_name);

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm',
        className,
      )}
    >
      <div
        className={cn(
          'relative w-full max-w-md rounded-lg border bg-card p-6 shadow-xl',
          isExplicitApproval ? 'border-destructive/50' : 'border-amber-500/50',
        )}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
              riskInfo.bgColor,
            )}
          >
            {isExplicitApproval ? (
              <ShieldAlert className={cn('h-6 w-6', riskInfo.color)} />
            ) : (
              <Shield className={cn('h-6 w-6', riskInfo.color)} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-foreground">
              {isExplicitApproval ? 'Approval Required' : 'Confirm Action'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{pendingConfirmation.reason}</p>
          </div>
        </div>

        {/* Tool info */}
        <div className="mt-6 rounded-lg bg-accent/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-background">
              {toolIcon}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-foreground">
                {pendingConfirmation.tool_display_name}
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                {pendingConfirmation.description}
              </p>
            </div>
            <div
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                riskInfo.badgeBg,
                riskInfo.color,
              )}
            >
              {pendingConfirmation.risk_level}
            </div>
          </div>

          {/* Parameters */}
          {pendingConfirmation.parameters_summary && (
            <div className="mt-3 border-t border-border/50 pt-3">
              <p className="text-xs font-medium text-muted-foreground">Parameters</p>
              <p className="mt-1 break-words text-sm text-foreground">
                {pendingConfirmation.parameters_summary}
              </p>
            </div>
          )}

          {/* Reversibility info */}
          {pendingConfirmation.reversible && pendingConfirmation.undo_description && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-green-500/10 p-2">
              <Undo2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <div>
                <p className="text-xs font-medium text-green-600">Reversible</p>
                <p className="text-xs text-muted-foreground">
                  {pendingConfirmation.undo_description}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Timer */}
        {timeRemaining !== null && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              Auto-deny in {Math.floor(timeRemaining / 60)}:
              {(timeRemaining % 60).toString().padStart(2, '0')}
            </span>
          </div>
        )}

        {/* Remember choice checkbox */}
        <label className="mt-4 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
          />
          <span className="text-sm text-muted-foreground">Remember my choice for this tool</span>
        </label>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => handleResponse(false, 'User denied')}
            disabled={isSubmitting}
            className={cn(
              'flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors',
              'hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            Deny
          </button>
          <button
            onClick={() => handleResponse(true)}
            disabled={isSubmitting}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors',
              isExplicitApproval
                ? 'bg-destructive hover:bg-destructive/90'
                : 'bg-primary hover:bg-primary/90',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {isSubmitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                {isExplicitApproval ? 'Approve Anyway' : 'Approve'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getRiskLevelInfo(level: RiskLevel): {
  color: string;
  bgColor: string;
  badgeBg: string;
} {
  switch (level) {
    case 'Low':
      return {
        color: 'text-green-500',
        bgColor: 'bg-green-500/10',
        badgeBg: 'bg-green-500/20',
      };
    case 'Medium':
      return {
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/10',
        badgeBg: 'bg-amber-500/20',
      };
    case 'High':
      return {
        color: 'text-orange-500',
        bgColor: 'bg-orange-500/10',
        badgeBg: 'bg-orange-500/20',
      };
    case 'Critical':
      return {
        color: 'text-destructive',
        bgColor: 'bg-destructive/10',
        badgeBg: 'bg-destructive/20',
      };
    default:
      return {
        color: 'text-muted-foreground',
        bgColor: 'bg-accent',
        badgeBg: 'bg-accent',
      };
  }
}

function getToolIcon(toolName: string): React.ReactNode {
  const iconClass = 'h-5 w-5 text-muted-foreground';

  if (toolName.includes('file')) {
    return <FileEdit className={iconClass} />;
  }
  if (toolName.includes('terminal') || toolName.includes('execute')) {
    return <Terminal className={iconClass} />;
  }
  if (toolName.includes('browser') || toolName.includes('navigate')) {
    return <Globe className={iconClass} />;
  }
  if (toolName.includes('db') || toolName.includes('query')) {
    return <Database className={iconClass} />;
  }
  if (toolName.includes('code')) {
    return <Code className={iconClass} />;
  }

  return <ShieldCheck className={iconClass} />;
}

export default ToolConfirmationDialog;
