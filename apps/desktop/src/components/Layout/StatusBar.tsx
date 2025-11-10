/**
 * StatusBar Component
 *
 * Always-visible status bar showing key information:
 * - Model and provider
 * - Token usage
 * - Context items
 * - AGI status
 * - System indicators
 *
 * Similar to VS Code/Cursor status bars
 */

import { useMemo } from 'react';
import {
  Activity,
  Brain,
  FileText,
  Zap,
  WifiOff,
  Wifi,
  AlertCircle,
  Check,
  Clock,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatTokens } from '../../utils/tokenCount';
import { PROVIDER_LABELS } from '../../constants/llm';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import type { Provider } from '../../stores/settingsStore';

export interface StatusBarProps {
  /**
   * Current provider
   */
  provider: Provider;

  /**
   * Current model name
   */
  model?: string;

  /**
   * Current token count
   */
  currentTokens: number;

  /**
   * Max tokens for context window
   */
  maxTokens: number;

  /**
   * Number of context items in current message
   */
  contextItemCount?: number;

  /**
   * AGI system status
   */
  agiStatus?: 'idle' | 'planning' | 'executing' | 'error';

  /**
   * Network connectivity status
   */
  isOnline?: boolean;

  /**
   * Loading/sending state
   */
  isSending?: boolean;

  /**
   * Custom className
   */
  className?: string;
}

export function StatusBar({
  provider,
  model,
  currentTokens,
  maxTokens,
  contextItemCount = 0,
  agiStatus = 'idle',
  isOnline = true,
  isSending = false,
  className,
}: StatusBarProps) {
  // Calculate token usage percentage
  const tokenUsagePercent = useMemo(() => {
    return (currentTokens / maxTokens) * 100;
  }, [currentTokens, maxTokens]);

  // Determine token status color
  const tokenStatusColor = useMemo(() => {
    if (tokenUsagePercent >= 90) return 'text-destructive';
    if (tokenUsagePercent >= 70) return 'text-warning';
    return 'text-muted-foreground';
  }, [tokenUsagePercent]);

  // AGI status indicator
  const agiStatusConfig = useMemo(() => {
    switch (agiStatus) {
      case 'planning':
        return {
          icon: Clock,
          label: 'AGI Planning',
          color: 'text-blue-500',
          pulse: true,
        };
      case 'executing':
        return {
          icon: Zap,
          label: 'AGI Executing',
          color: 'text-primary',
          pulse: true,
        };
      case 'error':
        return {
          icon: AlertCircle,
          label: 'AGI Error',
          color: 'text-destructive',
          pulse: false,
        };
      default:
        return {
          icon: Brain,
          label: 'AGI Idle',
          color: 'text-muted-foreground',
          pulse: false,
        };
    }
  }, [agiStatus]);

  const AGIIcon = agiStatusConfig.icon;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-t border-border bg-muted/30 px-4 py-1.5 text-xs',
        className,
      )}
    >
      {/* Left Section - Model & Provider */}
      <div className="flex items-center gap-3">
        {/* Model/Provider */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-default">
              <Activity className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">{PROVIDER_LABELS[provider]}</span>
              {model && <span className="text-muted-foreground">• {model}</span>}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Active Model: {PROVIDER_LABELS[provider]}</p>
            {model && <p className="text-xs text-muted-foreground">{model}</p>}
          </TooltipContent>
        </Tooltip>

        {/* Separator */}
        <div className="h-4 w-px bg-border" />

        {/* Token Usage */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('flex items-center gap-1.5 cursor-default', tokenStatusColor)}>
              <FileText className="h-3.5 w-3.5" />
              <span>
                {formatTokens(currentTokens)} / {formatTokens(maxTokens)}
              </span>
              <span className="text-muted-foreground">({tokenUsagePercent.toFixed(0)}%)</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Token Usage</p>
            <p className="text-xs text-muted-foreground">
              {formatTokens(currentTokens)} of {formatTokens(maxTokens)} tokens used
            </p>
          </TooltipContent>
        </Tooltip>

        {/* Context Items (if any) */}
        {contextItemCount > 0 && (
          <>
            <div className="h-4 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-primary cursor-default">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{contextItemCount} context items</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Context Items</p>
                <p className="text-xs text-muted-foreground">
                  {contextItemCount} file{contextItemCount !== 1 ? 's' : ''} attached to this
                  message
                </p>
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Right Section - AGI, Network, Sending Status */}
      <div className="flex items-center gap-3">
        {/* Sending Status */}
        {isSending && (
          <>
            <div className="flex items-center gap-1.5 text-primary">
              <Clock className="h-3.5 w-3.5 animate-spin" />
              <span>Sending...</span>
            </div>
            <div className="h-4 w-px bg-border" />
          </>
        )}

        {/* AGI Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex items-center gap-1.5 cursor-default',
                agiStatusConfig.color,
                agiStatusConfig.pulse && 'animate-pulse',
              )}
            >
              <AGIIcon className="h-3.5 w-3.5" />
              <span>{agiStatusConfig.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>AGI System Status</p>
            <p className="text-xs text-muted-foreground">{agiStatusConfig.label}</p>
          </TooltipContent>
        </Tooltip>

        {/* Separator */}
        <div className="h-4 w-px bg-border" />

        {/* Network Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex items-center gap-1.5 cursor-default',
                isOnline ? 'text-success' : 'text-destructive',
              )}
            >
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5" />
                  <span>Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  <span>Offline</span>
                </>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Network Status</p>
            <p className="text-xs text-muted-foreground">
              {isOnline ? 'Connected to network' : 'No network connection'}
            </p>
          </TooltipContent>
        </Tooltip>

        {/* All Systems Operational (when everything is good) */}
        {!isSending && agiStatus === 'idle' && isOnline && tokenUsagePercent < 70 && (
          <>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5 text-success">
              <Check className="h-3.5 w-3.5" />
              <span>Ready</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default StatusBar;
