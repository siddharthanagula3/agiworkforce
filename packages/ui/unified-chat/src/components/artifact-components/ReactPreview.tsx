import { AlertTriangle, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import {
  SCRIPTS_BLOCKED_NOTICE,
  type ArtifactPreviewScriptSupport,
} from '../../lib/artifact-preview-capability';
import { getArtifactSandboxOrigin, type ArtifactRenderPayload } from '../../lib/artifact-sandbox';
import { ArtifactSandboxFrame } from './ArtifactSandboxFrame';

export interface ReactPreviewProps {
  code: string;
  className?: string;
  scriptSupport?: ArtifactPreviewScriptSupport;
  onViewSource?: () => void;
}

function escapeCodeForTemplateLiteral(code: string): string {
  return code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

function previewErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Builds the sandboxed HTML document that loads React + Babel from CDN and
 * renders the user's component code. Exported for unit-testing the document shape.
 */
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
        } catch (err) {
          console.warn('[ReactPreview] Failed to post iframe message:', err);
        }
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

export function ReactPreview({
  code,
  className,
  scriptSupport = 'unknown',
  onViewSource,
}: ReactPreviewProps) {
  const sandboxOrigin = getArtifactSandboxOrigin();
  const [sandboxDegraded, setSandboxDegraded] = useState(false);
  const sandboxActive = sandboxOrigin !== null && !sandboxDegraded;
  const scriptsBlocked = scriptSupport === 'blocked' && !sandboxActive;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
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
    const parentOrigin = typeof window !== 'undefined' ? window.location.origin : 'null';
    return buildReactPreviewDocument(userCode, channelId.current, parentOrigin);
  }, []);

  const previewDocument = useMemo(() => {
    try {
      return { srcDoc: buildDocument(code), buildError: null };
    } catch (err) {
      return { srcDoc: '', buildError: previewErrorMessage(err) };
    }
    // reloadKey intentionally included so manual reload rebuilds the srcdoc
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, buildDocument, reloadKey]);
  const { srcDoc, buildError } = previewDocument;

  useEffect(() => {
    if (buildError) {
      setError(buildError);
      setIsLoading(false);
      return;
    }
    setError(null);
    setIsLoading(true);
  }, [code, reloadKey, buildError]);

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

  const sandboxPayload = useMemo<ArtifactRenderPayload>(
    () => ({ type: 'render', kind: 'react', code }),
    [code],
  );

  const handleSandboxComplete = useCallback(() => {
    if (!isMountedRef.current) return;
    setIsLoading(false);
    setError(null);
  }, []);

  const handleSandboxError = useCallback((message: string) => {
    if (!isMountedRef.current) return;
    setIsLoading(false);
    setError(message);
  }, []);

  const handleSandboxFallback = useCallback(() => {
    if (!isMountedRef.current) return;
    setSandboxDegraded(true);
  }, []);

  const handleReload = useCallback(() => {
    if (!isMountedRef.current) return;
    reloadKeyRef.current += 1;
    setReloadKey(reloadKeyRef.current);
    setError(null);
    setIsLoading(true);
    setSandboxDegraded(false);
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <div
      className={cn(
        'flex flex-col',
        isExpanded && 'fixed inset-4 z-50 bg-card rounded-lg shadow-2xl',
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/50">
        <span className="text-xs text-muted-foreground font-medium">React Preview</span>
        {isLoading && !scriptsBlocked && (
          <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
        )}
        {error && (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <AlertTriangle className="h-3 w-3" />
            Error
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleReload}
          aria-label="Reload preview"
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={toggleExpanded}
          aria-label={isExpanded ? 'Minimize' : 'Maximize'}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </div>

      {/* Preview frame */}
      <div
        className={cn('relative bg-card', isExpanded ? 'flex-1 min-h-0' : 'h-[400px]')}
        data-testid="react-preview-frame"
      >
        {/* DES-C15: mounting the iframe here would render a permanently blank
            frame, every script it needs is blocked by the CSP this srcdoc
            inherits from the embedder, so `react-preview-ready` never arrives.
            Explain it and point at the source instead of faking a load. */}
        {scriptsBlocked ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center"
            data-testid="react-preview-scripts-blocked"
          >
            <AlertTriangle className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="max-w-sm text-sm text-foreground">
              This React component can&apos;t run here.
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">{SCRIPTS_BLOCKED_NOTICE}</p>
            {onViewSource && (
              <button
                type="button"
                onClick={onViewSource}
                className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                View source
              </button>
            )}
          </div>
        ) : null}
        {srcDoc && !scriptsBlocked && (
          <ArtifactSandboxFrame
            key={reloadKey}
            payload={sandboxPayload}
            fallbackSrcDoc={srcDoc}
            fallbackSandbox="allow-scripts"
            title="React Component Preview"
            className="w-full h-full border-0"
            frameRef={iframeRef}
            onRenderComplete={handleSandboxComplete}
            onRenderError={handleSandboxError}
            onFallback={handleSandboxFallback}
          />
        )}
        {!srcDoc && !scriptsBlocked && error && (
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
