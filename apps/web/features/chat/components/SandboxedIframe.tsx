'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

import {
  getSandboxOrigin,
  isFromSandbox,
  postRenderToSandbox,
  type ArtifactRenderPayload,
  type SandboxIncomingMessage,
} from '@/lib/artifact-sandbox';

/** Milliseconds to wait for a sandbox-ready or successful onLoad before falling back. */
const SANDBOX_CONNECT_TIMEOUT_MS = 3000;

/**
 * AUDIT-FIX ART-5: marker on messages posted by the same-origin fallback frame.
 *
 * The fallback iframe runs at a NULL origin (allow-scripts without
 * allow-same-origin), so `event.origin` is the string `"null"` and cannot be
 * used to authenticate it. We authenticate on window identity instead
 * (`event.source === iframe.contentWindow`) and use this marker only to
 * distinguish our bootstrap's messages from anything the artifact itself posts.
 */
const FALLBACK_MESSAGE_MARKER = '__agiArtifactSandbox';

/**
 * AUDIT-FIX ART-5: error-reporting bootstrap injected into the fallback srcDoc.
 *
 * Before this, `onRenderError` could only ever fire from the cross-origin
 * `render-error` postMessage. In the DEFAULT configuration
 * (`NEXT_PUBLIC_SANDBOX_ORIGIN` unset) that path does not exist, so a failing
 * artifact — a JSX syntax error, a CDN script that never loads, a throw during
 * mount — produced a silent blank white frame with a fully enabled toolbar and
 * no way for the user to learn anything went wrong.
 *
 * The bootstrap reports:
 *   - uncaught exceptions (`error` events with a real Error/message),
 *   - unhandled promise rejections,
 *   - `<script>` elements that fail to LOAD (capture phase; other resource
 *     types are deliberately ignored so a single broken <img> never masquerades
 *     as a failed render).
 *
 * It is injected before the artifact's own content so a synchronous throw in
 * the first inline script is still caught.
 */
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
      /* parent is gone — nothing further to do */
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

/**
 * Renders an LLM artifact inside an iframe that is cross-origin to the parent
 * app whenever `NEXT_PUBLIC_SANDBOX_ORIGIN` is configured (the
 * `sandbox.agiworkforce.com` deployment). Scripts inside the artifact can
 * neither read the parent's cookies / localStorage nor exfiltrate via fetch
 * (the sandbox enforces `connect-src 'none'`).
 *
 * Fallback: when `NEXT_PUBLIC_SANDBOX_ORIGIN` is unset (e.g. in a dev branch
 * before the subdomain is provisioned), this falls back to a same-origin
 * `<iframe sandbox="allow-scripts" srcDoc=…>`. That fallback is strictly
 * safer than the pre-WEB-13 state because `allow-same-origin` is gone ·
 * scripts in the iframe still can't reach `parent.document`, cookies, or
 * localStorage. But it loses the cross-origin guarantee; deploy the sandbox
 * subdomain to upgrade.
 *
 * WEB-13 / WEB-20 (audit 2026-05-19).
 */
export interface SandboxedIframeProps {
  /** The artifact payload to ship via `postMessage` to the cross-origin sandbox. */
  payload: ArtifactRenderPayload;
  /**
   * Full HTML document used in the fallback (no-sandbox-origin) path. Should
   * include `<!doctype html>` + `<meta http-equiv="Content-Security-Policy"…>`
   * so the same-origin fallback is also CSP-restricted.
   */
  fallbackSrcDoc: string;
  /** Accessible title for the iframe. */
  title: string;
  className?: string;
  style?: React.CSSProperties;
  /** Bump this number to force a full iframe re-mount (clears state). */
  refreshKey?: number;
  /**
   * Called when the artifact fails to render.
   *
   * AUDIT-FIX ART-5: this fires on BOTH paths now — the cross-origin sandbox's
   * `render-error` message, and the same-origin fallback via the injected
   * error-reporting bootstrap (see FALLBACK_ERROR_REPORTER). It used to be
   * wired only to the cross-origin path, which is the path that does not exist
   * in the default configuration.
   */
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
  // AUDIT-FIX ART-5: the fallback document, with the error reporter spliced in.
  const fallbackDocument = useMemo(
    () => withFallbackErrorReporter(fallbackSrcDoc),
    [fallbackSrcDoc],
  );
  // When the cross-origin sandbox is configured but unreachable (e.g. the
  // subdomain server is down), we fall back to the same-origin srcDoc so the
  // user sees the artifact content instead of a "refused to connect" page.
  const [useFallback, setUseFallback] = useState(false);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sandboxConnectedRef = useRef(false);

  // Clear any pending fallback timer when the key or origin changes.
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
        // Sandbox is reachable; cancel the fallback timer.
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

  // Also post on iframe load as a defensive backup against the case where
  // `sandbox-ready` was sent before our listener attached.
  //
  // IMPORTANT: `onLoad` firing only means the HTTP document was fetched — it
  // does NOT mean the sandbox renderer is alive or that the postMessage
  // handshake works. A frame can load and then crash its render process
  // (Chrome shows the "sad document" placeholder) or be silently blocked.
  // So we must NOT mark the sandbox "connected" or cancel the fallback timer
  // here; only the `sandbox-ready` handshake is proof of a working sandbox.
  // We still post the payload as a best-effort backup (a no-op against a dead
  // frame), and leave the fallback timer running so a non-handshaking sandbox
  // degrades to the same-origin srcDoc path instead of showing a broken frame.
  const onLoad = useCallback(() => {
    if (!sandboxOrigin || !iframeRef.current) return;
    try {
      postRenderToSandbox(iframeRef.current, payload);
    } catch {
      // ignore
    }
  }, [sandboxOrigin, payload]);

  // onError fires when the iframe src fails to load (e.g. network error,
  // server down). Switch to the srcDoc fallback immediately.
  const onError = useCallback(() => {
    activateFallback();
  }, [activateFallback]);

  // AUDIT-FIX ART-5: listen for the fallback frame's error reports.
  //
  // The fallback runs on a null origin, so origin-matching is impossible;
  // `event.source === iframeRef.current.contentWindow` is the authentication —
  // only the frame we mounted can satisfy it. The marker then separates our
  // bootstrap's messages from anything the artifact posts on its own.
  const usingFallback = !sandboxOrigin || useFallback;
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

  // Start the connect-timeout when we have a sandboxOrigin and are not yet
  // falling back. If no successful load or sandbox-ready arrives within the
  // timeout window, degrade to the srcDoc path.
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
        // The document is hosted on a dedicated cross-origin renderer. Keeping
        // its origin is required so the parent can authenticate postMessage
        // events against NEXT_PUBLIC_SANDBOX_ORIGIN. This combination remains
        // forbidden for the same-origin srcDoc fallback below.
        sandbox="allow-scripts allow-same-origin"
        className={className}
        style={style}
        onLoad={onLoad}
        onError={onError}
      />
    );
  }

  // Fallback · no sandbox subdomain configured, OR the cross-origin sandbox
  // was unreachable (onError or connect timeout). allow-modals lets
  // window.print() and alert/confirm/prompt work inside artifacts.
  // NOTE: allow-same-origin is intentionally absent; scripts in the iframe
  // cannot access the parent's cookies or localStorage.
  return (
    <iframe
      ref={iframeRef}
      key={`fallback-${refreshKey}`}
      title={title}
      srcDoc={fallbackDocument}
      sandbox="allow-scripts allow-modals"
      className={className}
      style={style}
    />
  );
}
