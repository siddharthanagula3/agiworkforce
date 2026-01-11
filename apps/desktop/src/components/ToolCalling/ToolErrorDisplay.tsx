/**
 * ToolErrorDisplay Component
 *
 * Beautiful error message display with retry functionality and troubleshooting tips.
 */

import { useState } from 'react';
import { XCircle, AlertCircle, RefreshCcw, Copy, Check, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

interface ToolErrorDisplayProps {
  error: string;
  errorType?: 'timeout' | 'permission_denied' | 'not_found' | 'execution_failed' | 'cancelled';
  toolName: string;
  parameters?: Record<string, unknown>;
  retryable?: boolean;
  onRetry?: () => void;
  className?: string;
}

export function ToolErrorDisplay({
  error,
  errorType = 'execution_failed',
  toolName,
  parameters,
  retryable = true,
  onRetry,
  className,
}: ToolErrorDisplayProps) {
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleRetry = async () => {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const handleCopy = async () => {
    const errorReport = [
      `Tool: ${toolName}`,
      `Error Type: ${errorType}`,
      `Error Message: ${error}`,
      parameters ? `Parameters: ${JSON.stringify(parameters, null, 2)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    await navigator.clipboard.writeText(errorReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get error-specific details
  const getErrorDetails = () => {
    switch (errorType) {
      case 'timeout':
        return {
          icon: <AlertCircle className="h-5 w-5" />,
          title: 'Operation Timeout',
          description: 'The tool execution took too long and was automatically cancelled.',
          tips: [
            'The operation may require more time than allocated',
            'Try breaking the task into smaller steps',
            'Check if the target system is responsive',
            'Consider increasing the timeout limit if possible',
          ],
        };
      case 'permission_denied':
        return {
          icon: <XCircle className="h-5 w-5" />,
          title: 'Permission Denied',
          description: 'The tool does not have permission to perform this operation.',
          tips: [
            'Check if the tool has necessary permissions',
            'Review system security settings',
            'Ensure the target resource is accessible',
            'Contact administrator if permissions are managed centrally',
          ],
        };
      case 'not_found':
        return {
          icon: <AlertCircle className="h-5 w-5" />,
          title: 'Resource Not Found',
          description: 'The requested resource could not be found.',
          tips: [
            'Verify the path or identifier is correct',
            'Check if the resource still exists',
            'Ensure proper file path format (absolute vs relative)',
            'Confirm network connectivity if accessing remote resources',
          ],
        };
      case 'cancelled':
        return {
          icon: <XCircle className="h-5 w-5" />,
          title: 'Operation Cancelled',
          description: 'The tool execution was cancelled by user or system.',
          tips: [
            'The operation was stopped before completion',
            'Any partial changes may not have been saved',
            'You can retry if the cancellation was accidental',
          ],
        };
      case 'execution_failed':
      default:
        return {
          icon: <XCircle className="h-5 w-5" />,
          title: 'Execution Failed',
          description: 'The tool encountered an error during execution.',
          tips: [
            'Review the error message for specific details',
            'Check if input parameters are valid',
            'Verify system requirements and dependencies',
            'Try again or report if the problem persists',
          ],
        };
    }
  };

  const details = getErrorDetails();

  return (
    <div className={cn('border border-red-200 dark:border-red-900 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="bg-red-50 dark:bg-red-950/20 px-4 py-3 flex items-start gap-3">
        <div className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5">{details.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-red-900 dark:text-red-100 mb-1">{details.title}</div>
          <div className="text-sm text-red-800 dark:text-red-200">{details.description}</div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {retryable && onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={retrying}
              className="h-8"
            >
              <RefreshCcw className={cn('h-3.5 w-3.5 mr-1.5', retrying && 'animate-spin')} />
              {retrying ? 'Retrying...' : 'Retry'}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8 px-2">
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Error Message */}
      <div className="p-4 bg-background border-t border-red-200 dark:border-red-900">
        <div className="text-xs font-semibold text-muted-foreground mb-2">Error Message</div>
        <div className="font-mono text-sm bg-red-50 dark:bg-red-950/30 p-3 rounded border border-red-200 dark:border-red-900 text-red-900 dark:text-red-100 whitespace-pre-wrap">
          {error}
        </div>
      </div>

      {/* Troubleshooting Tips */}
      <div className="p-4 bg-muted/20 border-t border-border">
        <button
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-3 hover:text-foreground transition-colors w-full"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Troubleshooting Tips
        </button>
        {showDetails && (
          <ul className="space-y-2 text-sm text-muted-foreground">
            {details.tips.map((tip, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Additional Details */}
      {parameters && Object.keys(parameters).length > 0 && (
        <div className="p-4 bg-background border-t border-border">
          <div className="text-xs font-semibold text-muted-foreground mb-2">
            Parameters Used
          </div>
          <div className="font-mono text-xs bg-muted/30 p-2 rounded overflow-auto max-h-32">
            <pre>{JSON.stringify(parameters, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
