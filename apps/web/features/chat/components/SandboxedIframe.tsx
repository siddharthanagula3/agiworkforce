'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

import {
  getSandboxOrigin,
  isFromSandbox,
  postRenderToSandbox,
  type ArtifactRenderPayload,
  type SandboxIncomingMessage,
} from '@/lib/artifact-sandbox';

const SANDBOX_CONNECT_TIMEOUT_MS = 3000;

const FALLBACK_MESSAGE_MARKER = '__agiArtifactSandbox';

const FALLBACK_ERROR_REPORTER = `<script>
(function () {
  var reported = false;
  function report(message) {
    if (reported) return;
    reported = true;
    try {
      parent.postMessage(
        { ${FALLBACK_MESSAGE_MARKER}: true, type: 'render-error', error: String(message).slice(0, 500) },
        '*'
      );
    } catch (e) {
      // noop
    }
  }
  window.addEventListener(
    'error',
    function (event) {
      var target = event && event.target;
      if (target && target !== window && target.tagName) {
        if (String(target.tagName).toUpperCase() === 'SCRIPT') {
          report('Failed to load script: ' + (target.src || 'inline script'));
        }
        return;
      }
      report((event && (event.message || event.error)) || 'Script error');
    },
    true
  );
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    report((reason && reason.message) || reason || 'Unhandled promise rejection');
  });
})();
</script>`;

/**
 * AUDIT-FIX ART-5: splice {@link FALLBACK_ERROR_REPORTER} into a srcDoc.
 *
 * Placed immediately after `<head>` when one exists (so it runs before any of
 * the artifact's scripts), after `<html>` otherwise, and prepended for bare
 * fragments. Returns the document unchanged when it is empty.
 */
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/i;

/**
 * A srcdoc document inherits the embedding page's Content Security Policy, and
 * this app's CSP requires a nonce for inline script. An artifact's own scripts
 * carry none, so every one of them is blocked - the layout renders, native
 * inputs still move because the browser moves them, and nothing recomputes.
 *
 * That is worse than refusing to render: it is a convincing replica of a
 * working tool. The separate sandbox origin exists precisely to escape this,
 * because a document loaded by src carries its own CSP.
 */
export function fallbackWillRunScripts(srcDoc: string): boolean {
  return !INLINE_SCRIPT.test(srcDoc);
}

export function withFallbackErrorReporter(srcDoc: string): string {
  if (!srcDoc) return srcDoc;
  if (/<head\b[^>]*>/i.test(srcDoc)) {
    return srcDoc.replace(/<head\b[^>]*>/i, (match) => `${match}${FALLBACK_ERROR_REPORTER}`);
  }
  if (/<html\b[^>]*>/i.test(srcDoc)) {
    return srcDoc.replace(
      /<html\b[^>]*>/i,
      (match) => `${match}<head>${FALLBACK_ERROR_REPORTER}</head>`,
    );
  }
  return `${FALLBACK_ERROR_REPORTER}${srcDoc}`;
}

export interface SandboxedIframeProps {
  payload: ArtifactRenderPayload;
  fallbackSrcDoc: string;
  title: string;
  className?: string;
  style?: React.CSSProperties;
  refreshKey?: number;
  onRenderError?: (error: string) => void;
}

export function SandboxedIframe({
  payload,
  fallbackSrcDoc,
  title,
  className,
  style,
  refreshKey = 0,
  onRenderError,
}: SandboxedIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sandboxOrigin = getSandboxOrigin();
  const [, setRenderError] = useState<string | null>(null);
  const fallbackDocument = useMemo(
    () => withFallbackErrorReporter(fallbackSrcDoc),
    [fallbackSrcDoc],
  );
  const [useFallback, setUseFallback] = useState(false);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sandboxConnectedRef = useRef(false);

  useEffect(() => {
    sandboxConnectedRef.current = false;
    setUseFallback(false);
    return () => {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
    };
  }, [sandboxOrigin, refreshKey]);

  const activateFallback = useCallback(() => {
    if (!sandboxConnectedRef.current) {
      setUseFallback(true);
    }
  }, []);

  useEffect(() => {
    if (!sandboxOrigin) return undefined;
    const onMessage = (event: MessageEvent) => {
      if (!isFromSandbox(event)) return;
      const data = event.data as SandboxIncomingMessage | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'sandbox-ready' && iframeRef.current) {
        sandboxConnectedRef.current = true;
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        try {
          postRenderToSandbox(iframeRef.current, payload);
        } catch {
          // ignore · payload re-posts on the onLoad path below
        }
      } else if (data.type === 'render-error') {
        const message = data.error ?? 'unknown render error';
        setRenderError(message);
        onRenderError?.(message);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [sandboxOrigin, payload, onRenderError]);

  const onLoad = useCallback(() => {
    if (!sandboxOrigin || !iframeRef.current) return;
    try {
      postRenderToSandbox(iframeRef.current, payload);
    } catch {
      // ignore
    }
  }, [sandboxOrigin, payload]);

  const onError = useCallback(() => {
    activateFallback();
  }, [activateFallback]);

  const usingFallback = !sandboxOrigin || useFallback;
  const scriptsAreDead = usingFallback && !fallbackWillRunScripts(fallbackDocument);
  useEffect(() => {
    if (!usingFallback || !onRenderError) return undefined;
    const onFallbackMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || !event.source || event.source !== frame.contentWindow) return;
      const data = event.data as
        | { [FALLBACK_MESSAGE_MARKER]?: boolean; type?: string; error?: string }
        | undefined;
      if (!data || typeof data !== 'object' || data[FALLBACK_MESSAGE_MARKER] !== true) return;
      if (data.type !== 'render-error') return;
      const message = data.error || 'The artifact failed to render.';
      setRenderError(message);
      onRenderError(message);
    };
    window.addEventListener('message', onFallbackMessage);
    return () => window.removeEventListener('message', onFallbackMessage);
  }, [usingFallback, onRenderError]);

  useEffect(() => {
    if (!sandboxOrigin || useFallback || sandboxConnectedRef.current) return undefined;
    connectTimeoutRef.current = setTimeout(activateFallback, SANDBOX_CONNECT_TIMEOUT_MS);
    return () => {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
    };
  }, [sandboxOrigin, useFallback, activateFallback]);

  if (sandboxOrigin && !useFallback) {
    return (
      <iframe
        ref={iframeRef}
        key={refreshKey}
        src={`${sandboxOrigin}/`}
        title={title}
        sandbox="allow-scripts allow-same-origin"
        className={className}
        style={style}
        onLoad={onLoad}
        onError={onError}
      />
    );
  }

  return (
    <>
      {scriptsAreDead ? (
        <p
          role="status"
          data-testid="artifact-scripts-blocked"
          className="border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          This artifact&rsquo;s scripts cannot run here, so what you see below is its layout only -
          controls will not calculate or update. Open the Source tab to read what it does.
        </p>
      ) : null}
      <iframe
        ref={iframeRef}
        key={`fallback-${refreshKey}`}
        title={title}
        srcDoc={fallbackDocument}
        sandbox="allow-scripts allow-modals"
        className={className}
        style={style}
      />
    </>
  );
}
