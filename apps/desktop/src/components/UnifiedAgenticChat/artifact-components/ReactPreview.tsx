import { cn } from '../../../lib/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/Tooltip';

interface ReactPreviewProps {
  code: string;
  className?: string;
}

function escapeCodeForTemplateLiteral(code: string): string {
  return code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

export function buildReactPreviewDocument(
  userCode: string,
  channelId: string,
  parentOrigin: string,
): string {
  const escapedCode = escapeCodeForTemplateLiteral(userCode);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin></script>
  <script src="https://cdn.tailwindcss.com"></script>
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
    #root { width: 100%; }
    #error-display {
      color: #f87171;
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 6px;
      padding: 12px;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="error-display" style="display:none"></div>
  <script>
    (function() {
      const channelId = ${JSON.stringify(channelId)};
      const parentOrigin = ${JSON.stringify(parentOrigin)};

      function displayError(message) {
        const errorDisplay = document.getElementById('error-display');
        errorDisplay.style.display = '';
        errorDisplay.textContent = message;
      }

      function sendMsg(type, payload) {
        try {
          window.parent.postMessage({ channelId, type, ...payload }, parentOrigin);
        } catch (_) {}
      }

      window.__REACT_PREVIEW__ = { channelId, displayError, sendMsg };

      window.onerror = function(message, _src, lineno, colno) {
        const msg = message + ' (line ' + lineno + ':' + colno + ')';
        displayError(msg);
        sendMsg('react-preview-error', { message: msg });
        return true;
      };

      window.onunhandledrejection = function(ev) {
        const msg = 'Unhandled rejection: ' + (ev.reason?.message || ev.reason || 'Unknown');
        displayError(msg);
        sendMsg('react-preview-error', { message: msg });
      };
    })();
  </script>
  <script>
    (async function() {
      const reactUrl = 'https://esm.sh/react@18?dev';
      const reactDomUrl = 'https://esm.sh/react-dom@18/client?dev';
      const { displayError, sendMsg } = window.__REACT_PREVIEW__;

      try {
        const userCode = \`${escapedCode}\`;
        const moduleSource = [
          \`import React from "\${reactUrl}";\`,
          \`import * as ReactModule from "\${reactUrl}";\`,
          'const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, Fragment } = ReactModule;',
          userCode,
        ].join('\\n');

        const compiled = Babel.transform(moduleSource, {
          presets: [
            ['react', { runtime: 'classic' }],
            ['typescript', { allExtensions: true, isTSX: true }],
          ],
          sourceType: 'module',
        }).code;

        const moduleBlob = new Blob([compiled], { type: 'text/javascript' });
        const moduleUrl = URL.createObjectURL(moduleBlob);

        try {
          const [{ createRoot }, userModule] = await Promise.all([
            import(reactDomUrl),
            import(moduleUrl),
          ]);

          const UserComponent = userModule.default ?? userModule.App ?? null;
          if (!UserComponent || typeof UserComponent !== 'function') {
            throw new Error(
              'No renderable component found. Export a default function or define an App component.',
            );
          }

          const ReactModule = await import(reactUrl);
          const root = createRoot(document.getElementById('root'));
          root.render(ReactModule.createElement(UserComponent));
          sendMsg('react-preview-ready', {});
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        displayError(msg);
        sendMsg('react-preview-error', { message: msg });
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * Sandboxed iframe that loads React + ReactDOM + Babel standalone from CDN
 * and live-renders JSX/TSX component code.
 *
 * Security notes:
 * - sandbox="allow-scripts" only — no allow-same-origin, no allow-forms, no allow-popups
 * - CDN scripts loaded inside the iframe; no CSP token exposure
 * - User code is transpiled by Babel inside the sandbox, not on the host page
 */
export function ReactPreview({ code, className }: ReactPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const channelId = useRef(crypto.randomUUID());
  const isMountedRef = useRef(true);
  const reloadKeyRef = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const buildDocument = useCallback((userCode: string): string => {
    const parentOrigin =
      typeof window !== 'undefined' ? window.location.origin : 'tauri://localhost';
    return buildReactPreviewDocument(userCode, channelId.current, parentOrigin);
  }, []);

  // Reset loading/error state whenever code or reloadKey changes
  useEffect(() => {
    setError(null);
    setIsLoading(true);
  }, [code, reloadKey]);

  const srcDoc = useMemo(() => {
    try {
      return buildDocument(code);
    } catch {
      return '';
    }
    // reloadKey intentionally included so manual reload rebuilds the srcdoc
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, buildDocument, reloadKey]);

  // Listen for messages from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== 'null') return;
      if (event.data?.channelId !== channelId.current) return;
      if (!isMountedRef.current) return;

      if (event.data.type === 'react-preview-ready') {
        setIsLoading(false);
        setError(null);
      } else if (event.data.type === 'react-preview-error') {
        setIsLoading(false);
        setError(event.data.message as string);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleReload = useCallback(() => {
    if (!isMountedRef.current) return;
    reloadKeyRef.current += 1;
    setReloadKey(reloadKeyRef.current);
    setError(null);
    setIsLoading(true);
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <div
      className={cn(
        'flex flex-col',
        isExpanded && 'fixed inset-4 z-50 bg-zinc-900 rounded-lg shadow-2xl',
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/50 bg-zinc-800/50">
        <span className="text-xs text-zinc-400 font-medium">React Preview</span>
        {isLoading && <span className="text-xs text-zinc-500 animate-pulse">Loading...</span>}
        {error && (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <AlertTriangle className="h-3 w-3" />
            Error
          </span>
        )}
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleReload}
              aria-label="Reload preview"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reload</TooltipContent>
        </Tooltip>
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

      {/* Preview frame */}
      <div className={cn('relative bg-zinc-900', isExpanded ? 'flex-1 min-h-0' : 'h-[400px]')}>
        {srcDoc && (
          <iframe
            key={reloadKey}
            ref={iframeRef}
            srcDoc={srcDoc}
            title="React Component Preview"
            className="w-full h-full border-0"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
          />
        )}
        {!srcDoc && error && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center">
              <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-300 font-mono">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
