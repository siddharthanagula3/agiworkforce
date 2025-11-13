/**
 * Browser Panel Component
 *
 * Shows browser automation preview with screenshots and action log.
 * Displays current URL, screenshots, and a timeline of browser actions.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Globe,
  MousePointer,
  Keyboard,
  Camera,
  FileText,
  Check,
  XCircle,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useExecutionStore,
  selectBrowserActions,
  selectCurrentBrowserUrl,
  selectCurrentScreenshot,
  selectActiveGoal,
} from '../../stores/executionStore';
import type { BrowserAction } from '../../stores/executionStore';

export interface BrowserPanelProps {
  className?: string;
}

export function BrowserPanel({ className }: BrowserPanelProps) {
  const browserActions = useExecutionStore(selectBrowserActions);
  const currentUrl = useExecutionStore(selectCurrentBrowserUrl);
  const currentScreenshot = useExecutionStore(selectCurrentScreenshot);
  const activeGoal = useExecutionStore(selectActiveGoal);
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());
  const screenshotRef = useRef<HTMLDivElement>(null);

  // Auto-expand latest action
  useEffect(() => {
    if (browserActions.length > 0) {
      const latestAction = browserActions[browserActions.length - 1];
      if (latestAction) {
        setExpandedActions((prev) => new Set([...prev, latestAction.id]));
      }
    }
  }, [browserActions]);

  const toggleActionExpansion = (actionId: string) => {
    setExpandedActions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(actionId)) {
        newSet.delete(actionId);
      } else {
        newSet.add(actionId);
      }
      return newSet;
    });
  };

  if (!activeGoal) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <div className="text-center">
          <Globe className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No active execution</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Browser automation will appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground">Browser Automation</h3>
            {currentUrl && (
              <div className="mt-1 flex items-center gap-2">
                <Globe className="h-3 w-3 text-muted-foreground" />
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <span className="truncate">{currentUrl}</span>
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
              </div>
            )}
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {browserActions.length} {browserActions.length === 1 ? 'action' : 'actions'}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Screenshot preview */}
        {currentScreenshot && (
          <div className="border-b border-border">
            <div
              ref={screenshotRef}
              className="relative overflow-hidden bg-muted"
              style={{ maxHeight: '300px' }}
            >
              <img
                src={`data:image/png;base64,${currentScreenshot}`}
                alt="Browser screenshot"
                className="w-full object-contain"
              />
            </div>
          </div>
        )}

        {/* Actions timeline */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {browserActions.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">No browser actions yet</p>
            </div>
          ) : (
            browserActions
              .slice()
              .reverse()
              .map((action, index, array) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  isLast={index === array.length - 1}
                  isExpanded={expandedActions.has(action.id)}
                  onToggleExpand={() => toggleActionExpansion(action.id)}
                />
              ))
          )}
        </div>
      </div>
    </div>
  );
}

// ========================================
// Action Card Component
// ========================================

interface ActionCardProps {
  action: BrowserAction;
  isLast: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function ActionCard({ action, isLast, isExpanded, onToggleExpand }: ActionCardProps) {
  const actionConfig = getActionConfig(action.type);
  const ActionIcon = actionConfig.icon;
  const hasDetails = Boolean(
    action.screenshotData || action.selector || action.value || action.error,
  );

  return (
    <div className="relative">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[11px] top-10 h-full w-0.5 bg-border" />
      )}

      {/* Action header */}
      <div
        className={cn(
          'relative flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/50',
          isExpanded && 'bg-accent/30',
          !action.success && 'border-destructive/30 bg-destructive/5',
        )}
        onClick={onToggleExpand}
      >
        {/* Icon */}
        <div className="relative flex-shrink-0">
          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full',
              action.success ? 'bg-primary/10' : 'bg-destructive/10',
            )}
          >
            <ActionIcon
              className={cn(
                'h-3.5 w-3.5',
                action.success ? 'text-primary' : 'text-destructive',
              )}
            />
          </div>
          {/* Success/failure badge */}
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border border-background',
              action.success ? 'bg-green-500' : 'bg-destructive',
            )}
          >
            {action.success ? (
              <Check className="h-2 w-2 text-white" />
            ) : (
              <XCircle className="h-2 w-2 text-white" />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{actionConfig.label}</p>
              {action.url && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{action.url}</p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Date(action.timestamp).toLocaleTimeString()}
              </p>
            </div>
            {hasDetails && (
              <button
                type="button"
                className="flex-shrink-0 text-muted-foreground transition-transform hover:text-foreground"
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Error message */}
          {action.error && (
            <div className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5">
              <p className="text-xs text-destructive">{action.error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && hasDetails && (
        <div className="ml-9 mt-2 space-y-3 rounded-lg border border-border bg-card p-3">
          {/* Selector */}
          {action.selector && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Selector</p>
              <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs text-foreground">
                {action.selector}
              </code>
            </div>
          )}

          {/* Value */}
          {action.value && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Value</p>
              <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs text-foreground">
                {action.value}
              </code>
            </div>
          )}

          {/* Screenshot */}
          {action.screenshotData && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Screenshot</p>
              <img
                src={`data:image/png;base64,${action.screenshotData}`}
                alt="Action screenshot"
                className="mt-1 w-full rounded border border-border"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ========================================
// Helper Functions
// ========================================

function getActionConfig(type: BrowserAction['type']) {
  switch (type) {
    case 'navigate':
      return {
        icon: Globe,
        label: 'Navigate',
      };
    case 'click':
      return {
        icon: MousePointer,
        label: 'Click',
      };
    case 'type':
      return {
        icon: Keyboard,
        label: 'Type',
      };
    case 'screenshot':
      return {
        icon: Camera,
        label: 'Screenshot',
      };
    case 'extract':
      return {
        icon: FileText,
        label: 'Extract',
      };
  }
}

export default BrowserPanel;
