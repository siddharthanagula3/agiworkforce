'use client';

import React, { useEffect, useRef, useState } from 'react';

import {
  getSandboxOrigin,
  isFromSandbox,
  postRenderToSandbox,
  type ArtifactRenderPayload,
  type SandboxIncomingMessage,
} from '@/lib/artifact-sandbox';

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
 * safer than the pre-WEB-13 state because `allow-same-origin` is gone —
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
}

export function SandboxedIframe({
  payload,
  fallbackSrcDoc,
  title,
  className,
  style,
  refreshKey = 0,
}: SandboxedIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sandboxOrigin = getSandboxOrigin();
  const [, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!sandboxOrigin) return undefined;
    const onMessage = (event: MessageEvent) => {
      if (!isFromSandbox(event)) return;
      const data = event.data as SandboxIncomingMessage | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'sandbox-ready' && iframeRef.current) {
        try {
          postRenderToSandbox(iframeRef.current, payload);
        } catch {
          // ignore — payload re-posts on the onLoad path below
        }
      } else if (data.type === 'render-error') {
        setRenderError(data.error ?? 'unknown render error');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [sandboxOrigin, payload]);

  // Also post on iframe load as a defensive backup against the case where
  // `sandbox-ready` was sent before our listener attached.
  const onLoad = () => {
    if (!sandboxOrigin || !iframeRef.current) return;
    try {
      postRenderToSandbox(iframeRef.current, payload);
    } catch {
      // ignore
    }
  };

  if (sandboxOrigin) {
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
      />
    );
  }

  // Fallback — no sandbox subdomain configured.
  // allow-modals: lets window.print() and alert/confirm/prompt work inside artifacts.
  return (
    <iframe
      ref={iframeRef}
      key={refreshKey}
      title={title}
      srcDoc={fallbackSrcDoc}
      sandbox="allow-scripts allow-modals"
      className={className}
      style={style}
    />
  );
}
