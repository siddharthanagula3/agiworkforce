'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

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
   * Called when the cross-origin sandbox reports a `render-error` (e.g. the
   * artifact code threw while rendering). Only fires on the cross-origin
   * sandbox path — the same-origin fallback cannot observe in-frame errors.
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
        sandbox="allow-scripts"
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
      srcDoc={fallbackSrcDoc}
      sandbox="allow-scripts allow-modals"
      className={className}
      style={style}
    />
  );
}
