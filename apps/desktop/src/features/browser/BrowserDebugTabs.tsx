/**
 * BrowserDebugTabs
 *
 * Extends browser debugging with four tabs:
 *  1. Replay   – existing BrowserReplayViewer
 *  2. DOM      – DOM snapshot at time of failure
 *  3. Network  – network requests captured during automation
 *  4. Console  – browser console messages
 *
 * Also adds an Error Analysis card for failed actions.
 */
import { useState, useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode2,
  Hash,
  Info,
  Lightbulb,
  Network,
  Terminal,
  XCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { sanitizeHtml } from '../../utils/security';
import {
  useBrowserStore,
  selectBrowserActions,
  selectDomSnapshots,
  type BrowserAction,
} from '../../stores/browserStore';
import { BrowserReplayViewer } from './BrowserReplayViewer';

// =============================================================================
// Types – these live in the store via network/console events
// (Added as local types since they're not yet in browserStore)
// =============================================================================

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  status: number | null;
  statusText: string | null;
  durationMs: number | null;
  timestamp: number;
  requestSize?: number;
  responseSize?: number;
  resourceType?: string;
  failed?: boolean;
  errorMessage?: string;
}

export interface ConsoleMessage {
  id: string;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
  lineNumber?: number;
  timestamp: number;
}

// =============================================================================
// Helpers
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getStatusColor(status: number | null): string {
  if (status === null) return 'text-muted-foreground';
  if (status >= 200 && status < 300) return 'text-green-400';
  if (status >= 300 && status < 400) return 'text-blue-400';
  if (status >= 400 && status < 500) return 'text-amber-400';
  if (status >= 500) return 'text-red-400';
  return 'text-muted-foreground';
}

function getConsoleLevelConfig(level: ConsoleMessage['level']) {
  switch (level) {
    case 'error':
      return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10' };
    case 'warn':
      return { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10' };
    case 'info':
      return { icon: Info, color: 'text-blue-400', bg: 'bg-blue-400/10' };
    case 'debug':
      return { icon: Hash, color: 'text-muted-foreground/60', bg: 'bg-muted/30' };
    case 'log':
    default:
      return { icon: Terminal, color: 'text-foreground/70', bg: 'bg-muted/20' };
  }
}

// =============================================================================
// Suggested fix generator (pure heuristics – no network needed)
// =============================================================================

function suggestFix(action: BrowserAction): string {
  const { type, details } = action;
  const err = details.error ?? '';

  if (type === 'navigate') {
    if (err.toLowerCase().includes('timeout')) {
      return 'Increase navigation timeout or check if the target URL is reachable from this machine.';
    }
    if (err.toLowerCase().includes('net::err')) {
      return 'Verify network connectivity and that the URL is correct. The site may be blocking automated requests.';
    }
    return 'Check that the URL is valid and the page loaded successfully in a previous step.';
  }

  if (type === 'click' || type === 'type') {
    if (err.toLowerCase().includes('not found') || err.toLowerCase().includes('no element')) {
      return `Selector "${details.selector ?? ''}" could not be found. Try a more specific CSS selector, increase wait time before this action, or use text-based selection.`;
    }
    if (err.toLowerCase().includes('timeout')) {
      return 'Element was not visible or interactive within the timeout. Add a wait step before this action or increase the selector timeout.';
    }
    if (err.toLowerCase().includes('intercept') || err.toLowerCase().includes('overlay')) {
      return 'Another element may be covering the target. Try scrolling the element into view or dismissing overlays first.';
    }
    return 'Ensure the element exists in the DOM and is visible. Use the DOM Snapshot tab to inspect the page state at the time of failure.';
  }

  if (type === 'extract') {
    return 'The data extraction may have failed because the selector matched no elements or the page structure changed. Check the DOM Snapshot.';
  }

  if (type === 'execute') {
    return 'Script execution failed. Check the Console tab for JavaScript errors and verify the script syntax.';
  }

  return 'Review the DOM Snapshot to understand the page state at the time of failure, and check the Console tab for additional error details.';
}

// =============================================================================
// Error Analysis Card
// =============================================================================

interface ErrorAnalysisProps {
  failedActions: BrowserAction[];
}

function ErrorAnalysis({ failedActions }: ErrorAnalysisProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (failedActions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <CheckCircle2 className="h-8 w-8 text-green-400/40" />
        <p className="text-sm text-muted-foreground">No failed actions – all steps succeeded</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      {failedActions.map((action) => {
        const isOpen = expanded === action.id;
        const fix = suggestFix(action);
        return (
          <div key={action.id} className="rounded-lg border border-red-500/20 bg-red-500/5">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : action.id)}
              className="flex w-full items-start gap-2.5 p-3 text-left"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                    {action.type}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(action.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-foreground/80 mt-0.5 line-clamp-1">
                  {action.details.url ??
                    action.details.selector ??
                    action.details.text ??
                    action.details.error ??
                    '—'}
                </p>
              </div>
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              )}
            </button>

            {isOpen && (
              <div className="border-t border-red-500/15 px-3 pb-3 pt-2 space-y-3">
                {/* Expected vs actual */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded bg-white/5 p-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Expected
                    </p>
                    <p className="text-xs text-foreground/80">
                      {action.type === 'click' &&
                        `Click element: ${action.details.selector ?? '?'}`}
                      {action.type === 'type' &&
                        `Type "${action.details.text ?? ''}" into ${action.details.selector ?? '?'}`}
                      {action.type === 'navigate' && `Navigate to ${action.details.url ?? '?'}`}
                      {action.type === 'extract' &&
                        `Extract data from ${action.details.selector ?? '?'}`}
                      {action.type === 'execute' && `Execute script`}
                      {action.type === 'screenshot' && `Take screenshot`}
                      {!['click', 'type', 'navigate', 'extract', 'execute', 'screenshot'].includes(
                        action.type,
                      ) && `Perform ${action.type}`}
                    </p>
                  </div>
                  <div className="rounded bg-red-900/20 p-2">
                    <p className="text-[10px] font-semibold text-red-400/80 uppercase tracking-wider mb-1">
                      What happened
                    </p>
                    <p className="text-xs text-red-300/90">
                      {action.details.error ?? 'Action failed without an error message'}
                    </p>
                  </div>
                </div>

                {/* Suggested fix */}
                <div className="flex items-start gap-2 rounded bg-amber-500/10 p-2">
                  <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
                  <div>
                    <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-0.5">
                      Suggested fix
                    </p>
                    <p className="text-xs text-foreground/80">{fix}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// DOM Snapshot tab
// =============================================================================

/** Renders HTML from DOM snapshots through DOMPurify instead of regex stripping. */
function SanitizedDomPreview({ html }: { html: string }) {
  const sanitized = useMemo(() => sanitizeHtml(html), [html]);
  return (
    <div
      className="text-[11px] text-muted-foreground leading-relaxed"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
SanitizedDomPreview.displayName = 'SanitizedDomPreview';

interface DOMSnapshotTabProps {
  failedActions: BrowserAction[];
}

function DOMSnapshotTab({ failedActions }: DOMSnapshotTabProps) {
  const domSnapshots = useBrowserStore(selectDomSnapshots);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showRaw, setShowRaw] = useState(false);

  if (domSnapshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <FileCode2 className="h-8 w-8 text-muted-foreground/25" />
        <p className="text-sm text-muted-foreground">No DOM snapshots captured</p>
        <p className="text-xs text-muted-foreground/60">
          Snapshots are captured automatically when a browser action fails
        </p>
      </div>
    );
  }

  const snapshot = domSnapshots[selectedIdx];
  if (!snapshot) return null;

  // Highlight failed selectors in the HTML
  const failedSelectors = failedActions
    .map((a) => a.details.selector)
    .filter((s): s is string => Boolean(s));

  return (
    <div className="flex flex-col h-full">
      {/* Snapshot selector */}
      {domSnapshots.length > 1 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 overflow-x-auto">
          {domSnapshots.map((snap, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedIdx(i)}
              className={cn(
                'shrink-0 rounded px-2 py-1 text-xs transition',
                i === selectedIdx
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-white/5',
              )}
            >
              Snapshot {i + 1} · {formatTimestamp(snap.timestamp)}
            </button>
          ))}
        </div>
      )}

      {/* Failed selector hints */}
      {failedSelectors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-white/5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider self-center">
            Failed selectors:
          </span>
          {failedSelectors.map((sel, i) => (
            <code
              key={i}
              className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-mono text-red-400"
            >
              {sel}
            </code>
          ))}
        </div>
      )}

      {/* Toggle raw / preview */}
      <div className="flex items-center justify-end gap-2 px-3 py-1.5 border-b border-white/5">
        <button
          type="button"
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
        >
          <Code2 className="h-3 w-3" />
          {showRaw ? 'Preview' : 'Raw HTML'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {showRaw ? (
          <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">
            {snapshot.html}
          </pre>
        ) : (
          <SanitizedDomPreview html={snapshot.html} />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Network Log tab
// =============================================================================

interface NetworkLogTabProps {
  requests: NetworkRequest[];
}

function NetworkLogTab({ requests }: NetworkLogTabProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Network className="h-8 w-8 text-muted-foreground/25" />
        <p className="text-sm text-muted-foreground">No network requests captured</p>
        <p className="text-xs text-muted-foreground/60">
          Network requests will appear here during automation
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-white/[0.04]">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
        <span className="w-12 shrink-0">Status</span>
        <span className="w-10 shrink-0">Method</span>
        <span className="flex-1">URL</span>
        <span className="w-16 shrink-0 text-right">Duration</span>
        <span className="w-12 shrink-0 text-right">Size</span>
      </div>

      {requests.map((req) => {
        const isOpen = expanded === req.id;
        return (
          <div key={req.id} className="border-b border-white/[0.04] last:border-b-0">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : req.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-white/[0.03]"
            >
              {/* Status */}
              <span
                className={cn(
                  'w-12 shrink-0 text-xs font-mono font-semibold',
                  req.failed ? 'text-red-400' : getStatusColor(req.status),
                )}
              >
                {req.failed ? 'ERR' : (req.status ?? '—')}
              </span>

              {/* Method */}
              <span className="w-10 shrink-0 text-[10px] font-mono text-muted-foreground">
                {req.method}
              </span>

              {/* URL */}
              <span className="flex-1 truncate text-xs text-foreground/80">{req.url}</span>

              {/* Duration */}
              <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
                {req.durationMs !== null ? formatDurationMs(req.durationMs) : '—'}
              </span>

              {/* Size */}
              <span className="w-12 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
                {req.responseSize !== undefined ? formatBytes(req.responseSize) : '—'}
              </span>
            </button>

            {isOpen && (
              <div className="bg-white/[0.02] border-t border-white/5 px-3 pb-3 pt-2 space-y-1.5">
                <div className="text-xs">
                  <span className="text-muted-foreground">URL: </span>
                  <span className="font-mono text-foreground/80 break-all">{req.url}</span>
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">Resource type: </span>
                  <span className="text-foreground/80">{req.resourceType ?? 'unknown'}</span>
                </div>
                {req.statusText && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Status text: </span>
                    <span className="text-foreground/80">{req.statusText}</span>
                  </div>
                )}
                <div className="text-xs">
                  <span className="text-muted-foreground">Time: </span>
                  <span className="text-foreground/80">{formatTimestamp(req.timestamp)}</span>
                </div>
                {req.errorMessage && (
                  <div className="flex items-start gap-1.5 rounded bg-red-900/20 px-2 py-1.5 text-xs text-red-400">
                    <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    {req.errorMessage}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Console Log tab
// =============================================================================

interface ConsoleLogTabProps {
  messages: ConsoleMessage[];
}

function ConsoleLogTab({ messages }: ConsoleLogTabProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Terminal className="h-8 w-8 text-muted-foreground/25" />
        <p className="text-sm text-muted-foreground">No console messages captured</p>
        <p className="text-xs text-muted-foreground/60">
          Browser console output will appear here during automation
        </p>
      </div>
    );
  }

  return (
    <div className="font-mono text-[11px] divide-y divide-white/[0.04]">
      {messages.map((msg) => {
        const conf = getConsoleLevelConfig(msg.level);
        const LevelIcon = conf.icon;
        return (
          <div key={msg.id} className={cn('flex items-start gap-2 px-3 py-2', conf.bg)}>
            <LevelIcon className={cn('h-3 w-3 mt-0.5 shrink-0', conf.color)} />
            <div className="flex-1 min-w-0">
              <span className={cn('break-all leading-relaxed', conf.color)}>{msg.message}</span>
              {msg.source && (
                <span className="block text-[10px] text-muted-foreground/50 mt-0.5">
                  {msg.source}
                  {msg.lineNumber !== undefined ? `:${msg.lineNumber}` : ''}
                </span>
              )}
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground/40 tabular-nums">
              {formatTimestamp(msg.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Tab bar
// =============================================================================

type DebugTab = 'replay' | 'errors' | 'dom' | 'network' | 'console';

interface TabBarProps {
  active: DebugTab;
  onChange: (tab: DebugTab) => void;
  failedCount: number;
  networkCount: number;
  consoleErrorCount: number;
  domSnapshotCount: number;
}

function TabBar({
  active,
  onChange,
  failedCount,
  networkCount,
  consoleErrorCount,
  domSnapshotCount,
}: TabBarProps) {
  const tabs: { id: DebugTab; label: string; badge?: number; badgeColor?: string }[] = [
    { id: 'replay', label: 'Replay' },
    {
      id: 'errors',
      label: 'Errors',
      badge: failedCount,
      badgeColor: failedCount > 0 ? 'bg-red-500/20 text-red-400' : undefined,
    },
    {
      id: 'dom',
      label: 'DOM',
      badge: domSnapshotCount,
      badgeColor: 'bg-blue-500/10 text-blue-400',
    },
    {
      id: 'network',
      label: 'Network',
      badge: networkCount,
      badgeColor: 'bg-muted/30 text-muted-foreground',
    },
    {
      id: 'console',
      label: 'Console',
      badge: consoleErrorCount > 0 ? consoleErrorCount : undefined,
      badgeColor: consoleErrorCount > 0 ? 'bg-amber-500/20 text-amber-400' : undefined,
    },
  ];

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/5 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition whitespace-nowrap',
            active === tab.id
              ? 'bg-white/10 text-foreground'
              : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
          )}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span
              className={cn('rounded-full px-1.5 py-0 text-[10px] font-semibold', tab.badgeColor)}
            >
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Main export: BrowserDebugTabs
// =============================================================================

interface BrowserDebugTabsProps {
  className?: string;
  /** Network requests captured externally (e.g. passed from parent) */
  networkRequests?: NetworkRequest[];
  /** Console messages captured externally */
  consoleMessages?: ConsoleMessage[];
}

export function BrowserDebugTabs({
  className,
  networkRequests = [],
  consoleMessages = [],
}: BrowserDebugTabsProps) {
  const [activeTab, setActiveTab] = useState<DebugTab>('replay');
  const actions = useBrowserStore(selectBrowserActions);
  const domSnapshots = useBrowserStore(selectDomSnapshots);

  const failedActions = actions.filter((a) => !a.success);
  const consoleErrorCount = consoleMessages.filter((m) => m.level === 'error').length;

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      <TabBar
        active={activeTab}
        onChange={setActiveTab}
        failedCount={failedActions.length}
        networkCount={networkRequests.length}
        consoleErrorCount={consoleErrorCount}
        domSnapshotCount={domSnapshots.length}
      />

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'replay' && <BrowserReplayViewer />}
        {activeTab === 'errors' && <ErrorAnalysis failedActions={failedActions} />}
        {activeTab === 'dom' && <DOMSnapshotTab failedActions={failedActions} />}
        {activeTab === 'network' && <NetworkLogTab requests={networkRequests} />}
        {activeTab === 'console' && <ConsoleLogTab messages={consoleMessages} />}
      </div>
    </div>
  );
}
