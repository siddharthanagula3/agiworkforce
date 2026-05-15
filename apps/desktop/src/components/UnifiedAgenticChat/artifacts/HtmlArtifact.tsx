import { AlertTriangle, Maximize2, Minimize2, Play, RefreshCw, Square } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../../lib/utils';
import type { Artifact } from '../../../types/chat';
import { Button } from '../../ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/Tooltip';

/**
 * Sandboxed iframe-based runtime for HTML/JavaScript artifacts.
 * Provides a CodePen/JSFiddle-like live preview experience.
 *
 * Security measures:
 * - Uses strict sandbox attributes to prevent:
 *   - Top-level navigation (allow-top-navigation disabled)
 *   - Form submissions to external URLs (allow-forms disabled by default)
 *   - Access to parent window (allow-same-origin disabled)
 *   - Popups and modal dialogs (allow-popups disabled)
 * - CSP meta tag injected into the HTML to restrict external resources
 * - Console output is captured and displayed for debugging
 * - Errors are caught and displayed gracefully
 */
export function HtmlArtifact({ artifact }: { artifact: Artifact }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isRunning, setIsRunning] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [consoleOutput, setConsoleOutput] = useState<
    Array<{ type: 'log' | 'error' | 'warn' | 'info'; message: string; timestamp: number }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  const channelId = useRef(crypto.randomUUID());

  // AUDIT-005-004 fix: Ref to track reload timeout for cleanup
  const reloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // AUDIT-005-004 fix: Cleanup on unmount
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
        reloadTimeoutRef.current = null;
      }
    };
  }, []);

  // Build the sandboxed HTML document with security headers and console capture
  const buildSandboxedHtml = useCallback((content: string): string => {
    const isFullDocument = /<html[\s>]/i.test(content) || /<!doctype/i.test(content);

    // Content Security Policy for the interactive HTML/JS execution sandbox.
    // This component is intentionally permissive for script execution — it is a
    // CodePen/JSFiddle-style live preview where users run their own JavaScript.
    //
    // script-src 'unsafe-inline':
    //   Required — the console-capture bootstrap is injected as an inline <script>
    //   block. Removing this would silently break all console output forwarding.
    //
    // script-src 'unsafe-eval':
    //   Required for full JavaScript sandbox parity. Users may legitimately write
    //   artifacts that call eval(), new Function(), or pass strings to setTimeout().
    //   TRADE-OFF: Acceptable because iframe sandbox="allow-scripts" (no allow-same-origin)
    //   prevents access to parent window, localStorage, and cookies; connect-src 'none'
    //   blocks all network exfiltration; frame-src 'none' blocks nested iframe attacks.
    //
    // connect-src 'none': blocks ALL fetch(), XMLHttpRequest, WebSocket calls.
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: data:; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline' *; img-src * data: blob:; font-src * data:; connect-src 'none'; frame-src 'none'; object-src 'none';">`;

    const consoleCapture = `
<script>
(function() {
  const channelId = '${channelId.current}';
  const originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console)
  };

  function sendToParent(type, args) {
    try {
      const message = args.map(arg => {
        try {
          if (arg === undefined) return 'undefined';
          if (arg === null) return 'null';
          if (typeof arg === 'function') return '[Function]';
          if (typeof arg === 'symbol') return arg.toString();
          if (arg instanceof Error) return arg.stack || arg.message;
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return '[Circular Object]';
            }
          }
          return String(arg);
        } catch {
          return '[Unserializable]';
        }
      }).join(' ');

      window.parent.postMessage({
        type: 'sandbox-console',
        channelId: channelId,
        consoleType: type,
        message: message,
        timestamp: Date.now()
      }, '*');
    } catch (e) {
      // Silently fail if we can't communicate
    }
  }

  console.log = function(...args) {
    originalConsole.log(...args);
    sendToParent('log', args);
  };

  console.error = function(...args) {
    originalConsole.error(...args);
    sendToParent('error', args);
  };

  console.warn = function(...args) {
    originalConsole.warn(...args);
    sendToParent('warn', args);
  };

  console.info = function(...args) {
    originalConsole.info(...args);
    sendToParent('info', args);
  };

  window.onerror = function(message, source, lineno, colno, error) {
    sendToParent('error', ['Uncaught Error: ' + message + ' at line ' + lineno + ':' + colno]);
    return true;
  };

  window.onunhandledrejection = function(event) {
    sendToParent('error', ['Unhandled Promise Rejection: ' + (event.reason?.message || event.reason || 'Unknown')]);
  };

  window.parent.postMessage({
    type: 'sandbox-ready',
    channelId: channelId
  }, '*');
})();
</script>`;

    const baseStyles = `
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #e4e4e7;
    background: #18181b;
    min-height: 100vh;
  }
  a { color: #60a5fa; }
  pre, code {
    background: #27272a;
    border-radius: 4px;
    padding: 2px 6px;
    font-family: ui-monospace, monospace;
    font-size: 13px;
  }
  pre { padding: 12px; overflow-x: auto; }
  pre code { padding: 0; background: none; }
  button, input, select, textarea {
    font-family: inherit;
    font-size: inherit;
  }
  button {
    cursor: pointer;
    background: #3f3f46;
    border: 1px solid #52525b;
    color: #e4e4e7;
    padding: 8px 16px;
    border-radius: 6px;
  }
  button:hover { background: #52525b; }
  input, textarea, select {
    background: #27272a;
    border: 1px solid #3f3f46;
    color: #e4e4e7;
    padding: 8px 12px;
    border-radius: 6px;
  }
  input:focus, textarea:focus, select:focus {
    outline: 2px solid #60a5fa;
    outline-offset: 1px;
    border-color: #60a5fa;
  }
</style>`;

    if (isFullDocument) {
      let modifiedContent = content;

      if (!/<meta[^>]*content-security-policy/i.test(content)) {
        modifiedContent = modifiedContent.replace(/<head([^>]*)>/i, `<head$1>\n${cspMeta}`);
      }

      modifiedContent = modifiedContent.replace(/<head([^>]*)>/i, `<head$1>\n${consoleCapture}`);

      return modifiedContent;
    } else {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${cspMeta}
  ${consoleCapture}
  ${baseStyles}
</head>
<body>
${content}
</body>
</html>`;
    }
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.channelId !== channelId.current) return;
      if (!isMountedRef.current) return;

      if (event.data.type === 'sandbox-console') {
        setConsoleOutput((prev) => [
          ...prev.slice(-99),
          {
            type: event.data.consoleType,
            message: event.data.message,
            timestamp: event.data.timestamp,
          },
        ]);
      } else if (event.data.type === 'sandbox-ready') {
        setError(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleOutput]);

  const srcDoc = useMemo(() => {
    if (!isRunning) return '';
    try {
      return buildSandboxedHtml(artifact.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build sandbox');
      return '';
    }
  }, [artifact.content, buildSandboxedHtml, isRunning]);

  const handleReload = useCallback(() => {
    setConsoleOutput([]);
    setError(null);
    setIsRunning(false);
    // AUDIT-005-004 fix: Clear previous timeout and store new one for cleanup
    if (reloadTimeoutRef.current) {
      clearTimeout(reloadTimeoutRef.current);
    }
    reloadTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setIsRunning(true);
      }
      reloadTimeoutRef.current = null;
    }, 50);
  }, []);

  const handleStop = useCallback(() => {
    setIsRunning(false);
    setConsoleOutput((prev) => [
      ...prev,
      { type: 'info', message: 'Execution stopped', timestamp: Date.now() },
    ]);
  }, []);

  const handleRun = useCallback(() => {
    setConsoleOutput([]);
    setError(null);
    setIsRunning(true);
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const getConsoleTypeColor = (type: 'log' | 'error' | 'warn' | 'info') => {
    switch (type) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      default:
        return 'text-foreground';
    }
  };

  const getConsoleTypeIcon = (type: 'log' | 'error' | 'warn' | 'info') => {
    switch (type) {
      case 'error':
        return <AlertTriangle className="h-3 w-3 text-red-400" />;
      case 'warn':
        return <AlertTriangle className="h-3 w-3 text-yellow-400" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col',
        isExpanded && 'fixed inset-4 z-50 bg-card rounded-lg shadow-2xl',
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/50">
        <div className="flex items-center gap-1">
          {isRunning ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleStop}
                  aria-label="Stop execution"
                >
                  <Square className="h-3 w-3 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleRun}
                  aria-label="Run code"
                >
                  <Play className="h-3 w-3 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Run</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleReload}
                aria-label="Reload"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setShowCode((prev) => !prev)}
          className={cn(
            'px-2 py-1 text-xs rounded transition-colors',
            showCode
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
          )}
        >
          {showCode ? 'Preview' : 'Code'}
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleExpanded}
              aria-label={isExpanded ? 'Minimize' : 'Maximize'}
            >
              {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isExpanded ? 'Minimize' : 'Maximize'}</TooltipContent>
        </Tooltip>
      </div>

      {/* Main content area */}
      <div className={cn('flex flex-col', isExpanded ? 'flex-1 min-h-0' : 'h-[400px]')}>
        {showCode ? (
          <div className="flex-1 overflow-auto bg-background">
            <SyntaxHighlighter
              language="html"
              style={oneDark}
              customStyle={{
                margin: 0,
                padding: '1rem',
                background: 'transparent',
                fontSize: '13px',
                lineHeight: '1.6',
                height: '100%',
              }}
              showLineNumbers
              lineNumberStyle={{
                minWidth: '2.5em',
                paddingRight: '1em',
                color: '#4b5563',
                userSelect: 'none',
              }}
              wrapLongLines={false}
            >
              {artifact.content}
            </SyntaxHighlighter>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 relative bg-card">
              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-900/20 p-4">
                  <div className="text-center">
                    <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                </div>
              )}
              {isRunning && srcDoc && (
                <iframe
                  ref={iframeRef}
                  srcDoc={srcDoc}
                  title={artifact.title || 'HTML Preview'}
                  className="w-full h-full border-0"
                  // allow-scripts: Allow JavaScript execution (required for interactivity)
                  // allow-modals: Allow alert(), confirm(), prompt() dialogs
                  // NOT included: allow-same-origin, allow-top-navigation, allow-forms,
                  // allow-popups, allow-pointer-lock, allow-downloads
                  sandbox="allow-scripts allow-modals"
                  referrerPolicy="no-referrer"
                />
              )}
              {!isRunning && (
                <div className="absolute inset-0 flex items-center justify-center bg-card">
                  <div className="text-center">
                    <Square className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Execution stopped</p>
                    <button
                      type="button"
                      onClick={handleRun}
                      className="mt-2 px-3 py-1.5 text-xs bg-accent hover:bg-accent/80 rounded text-foreground transition-colors"
                    >
                      Run again
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Console output */}
            <div className="border-t border-border/50">
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50 border-b border-border/50 flex items-center justify-between">
                <span>Console</span>
                {consoleOutput.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConsoleOutput([])}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div
                ref={consoleRef}
                className="h-[100px] overflow-auto bg-background font-mono text-xs"
              >
                {consoleOutput.length === 0 ? (
                  <div className="p-3 text-muted-foreground">No console output</div>
                ) : (
                  consoleOutput.map((entry, i) => (
                    <div
                      key={`${entry.timestamp}-${i}`}
                      className={cn(
                        'px-3 py-1 border-b border-border/50 flex items-start gap-2',
                        getConsoleTypeColor(entry.type),
                      )}
                    >
                      {getConsoleTypeIcon(entry.type)}
                      <pre className="whitespace-pre-wrap break-all flex-1 m-0 bg-transparent p-0">
                        {entry.message}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
