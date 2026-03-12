import {
  Globe,
  Copy,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
  Check,
  Loader2,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';

export interface APIResponseData {
  url: string;
  method?: string;
  statusCode?: number;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string | object;
  durationMs?: number;
  success?: boolean;
  error?: string;
  requestBody?: string | object;
  requestHeaders?: Record<string, string>;
}

export const InlineAPIResponse: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);

  const data = result?.data as APIResponseData | undefined;

  const rawData = data || ({} as APIResponseData);
  const { url = '', method = 'GET', statusText, headers = {}, body, durationMs, error } = rawData;
  const statusCode = rawData.statusCode || rawData.status || 0;
  const success = rawData.success ?? (statusCode >= 200 && statusCode < 400);

  // Parse body if it's a string
  const parsedBody = useMemo(() => {
    if (!body) return null;
    if (typeof body === 'object') return body;
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }, [body]);

  const formattedBody = useMemo(() => {
    if (!parsedBody) return '';
    if (typeof parsedBody === 'string') return parsedBody;
    try {
      return JSON.stringify(parsedBody, null, 2);
    } catch {
      return String(parsedBody);
    }
  }, [parsedBody]);

  // Truncate URL for display
  const displayUrl = useMemo(() => {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname + urlObj.search;
      return path.length > 50 ? path.slice(0, 47) + '...' : path;
    } catch {
      return url.length > 50 ? url.slice(0, 47) + '...' : url;
    }
  }, [url]);

  const hostname = useMemo(() => {
    if (!url) return '';
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }, [url]);

  // Show running state
  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
        <span className="text-sm text-muted-foreground">Making API request...</span>
      </div>
    );
  }

  // Show error state if status indicates failure
  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-300 font-medium">API request failed</p>
            {result?.error && <p className="text-xs text-muted-foreground mt-1">{result.error}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Status color
  const statusColor =
    statusCode >= 200 && statusCode < 300
      ? 'text-emerald-400'
      : statusCode >= 300 && statusCode < 400
        ? 'text-amber-400'
        : statusCode >= 400 && statusCode < 500
          ? 'text-orange-400'
          : 'text-red-400';

  const statusBadgeVariant =
    statusCode >= 200 && statusCode < 300
      ? 'success'
      : statusCode >= 400
        ? 'destructive'
        : 'warning';

  // Method color
  const methodColor =
    method === 'GET'
      ? 'text-blue-400'
      : method === 'POST'
        ? 'text-emerald-400'
        : method === 'PUT'
          ? 'text-amber-400'
          : method === 'DELETE'
            ? 'text-red-400'
            : 'text-muted-foreground';

  // Error state
  if (!success && error) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-mono font-medium ${methodColor}`}>{method}</span>
              <span className="text-sm font-medium text-red-300 truncate">{url}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inline-api-response mt-3 rounded-lg border border-border/50 overflow-hidden bg-surface-elevated">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-surface-overlay/30 border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={`text-xs font-mono font-bold ${methodColor}`}>{method}</span>
          <Badge
            variant={statusBadgeVariant as 'default' | 'destructive' | 'outline' | 'secondary'}
            className="text-xs px-1.5 py-0"
          >
            {statusCode}
          </Badge>
          <span className="text-xs text-muted-foreground truncate" title={url}>
            {hostname}
            <span className="text-zinc-500">{displayUrl}</span>
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {success ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-red-400" />
          )}
          {durationMs !== undefined && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {durationMs}ms
            </span>
          )}

          <Button
            size="xs"
            variant="ghost"
            onClick={() => setExpanded(!expanded)}
            className="h-6 w-6 p-0"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>

          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(formattedBody).catch(() => {});
              toast.success('Response copied to clipboard', {
                icon: <Check className="h-4 w-4" />,
                duration: 2000,
              });
            }}
            className="h-6 w-6 p-0"
            title="Copy response body"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Response Preview */}
      {!expanded && formattedBody && (
        <div className="px-3 py-2 bg-surface-base/50">
          <pre className="text-xs text-muted-foreground font-mono line-clamp-2 whitespace-pre-wrap">
            {formattedBody.slice(0, 200)}
            {formattedBody.length > 200 ? '...' : ''}
          </pre>
        </div>
      )}

      {/* Expanded View */}
      {expanded && (
        <div className="p-3 space-y-3 max-h-96 overflow-auto bg-surface-base/30">
          {/* URL */}
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">URL</div>
            <div className="text-xs font-mono text-foreground bg-surface-base rounded p-2 break-all">
              {url}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-4">
            <div>
              <div className="text-xs font-medium text-muted-foreground">Status</div>
              <div className={`text-sm font-mono ${statusColor}`}>
                {statusCode} {statusText}
              </div>
            </div>
            {durationMs !== undefined && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Duration</div>
                <div className="text-sm font-mono text-foreground">{durationMs}ms</div>
              </div>
            )}
          </div>

          {/* Headers Toggle */}
          {Object.keys(headers).length > 0 && (
            <div className="space-y-1">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setShowHeaders(!showHeaders)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {showHeaders ? 'Hide' : 'Show'} Headers ({Object.keys(headers).length})
              </Button>
              {showHeaders && (
                <div className="bg-surface-base rounded p-2 space-y-1">
                  {Object.entries(headers).map(([key, value]) => (
                    <div key={key} className="text-xs font-mono">
                      <span className="text-blue-400">{key}:</span>{' '}
                      <span className="text-muted-foreground">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Response Body */}
          {formattedBody && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Response Body</div>
              <pre className="text-xs font-mono text-foreground bg-surface-base rounded p-2 overflow-auto whitespace-pre-wrap max-h-64">
                {formattedBody}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
