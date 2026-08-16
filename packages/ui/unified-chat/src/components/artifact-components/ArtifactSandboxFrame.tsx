
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import {
  getArtifactSandboxOrigin,
  isArtifactSandboxMessage,
  postRenderToArtifactSandbox,
  type ArtifactRenderPayload,
  type SandboxIncomingMessage,
} from '../../lib/artifact-sandbox';

const SANDBOX_HANDSHAKE_TIMEOUT_MS = 3_000;

export interface ArtifactSandboxFrameProps {
  payload: ArtifactRenderPayload;
  fallbackSrcDoc: string;
  fallbackSandbox: string;
  title: string;
  className?: string;
  style?: CSSProperties;
  refreshKey?: number;
  onRenderComplete?: () => void;
  onRenderError?: (error: string) => void;
  onFallback?: () => void;
  frameRef?: { current: HTMLIFrameElement | null };
  'data-testid'?: string;
}

export function ArtifactSandboxFrame({
  payload,
  fallbackSrcDoc,
  fallbackSandbox,
  title,
  className,
  style,
  refreshKey = 0,
  onRenderComplete,
  onRenderError,
  onFallback,
  frameRef: externalFrameRef,
  'data-testid': dataTestId,
}: ArtifactSandboxFrameProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const assignFrame = useCallback(
    (node: HTMLIFrameElement | null) => {
      frameRef.current = node;
      if (externalFrameRef) externalFrameRef.current = node;
    },
    [externalFrameRef],
  );
  const sandboxOrigin = getArtifactSandboxOrigin();
  const [useFallback, setUseFallback] = useState(false);
  const connectedRef = useRef(false);
  const replyOriginRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHandshakeTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    connectedRef.current = false;
    replyOriginRef.current = null;
    setUseFallback(false);
    return clearHandshakeTimeout;
  }, [sandboxOrigin, refreshKey, clearHandshakeTimeout]);

  const degrade = useCallback(() => {
    if (connectedRef.current) return;
    setUseFallback((already) => {
      if (!already) onFallback?.();
      return true;
    });
  }, [onFallback]);

  useEffect(() => {
    if (!sandboxOrigin || useFallback) return undefined;

    const onMessage = (event: MessageEvent) => {
      if (!isArtifactSandboxMessage(event, frameRef.current)) return;
      const data = event.data as SandboxIncomingMessage | undefined;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'sandbox-ready') {
        connectedRef.current = true;
        replyOriginRef.current = event.origin;
        clearHandshakeTimeout();
        postRenderToArtifactSandbox(frameRef.current, payload, event.origin);
        return;
      }
      if (data.type === 'render-complete') {
        onRenderComplete?.();
        return;
      }
      if (data.type === 'render-error') {
        onRenderError?.(data.error ?? 'The artifact failed to render.');
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [sandboxOrigin, useFallback, payload, onRenderComplete, onRenderError, clearHandshakeTimeout]);

  useEffect(() => {
    if (!sandboxOrigin || useFallback || !connectedRef.current) return;
    postRenderToArtifactSandbox(frameRef.current, payload, replyOriginRef.current ?? undefined);
  }, [sandboxOrigin, useFallback, payload]);

  useEffect(() => {
    if (!sandboxOrigin || useFallback || connectedRef.current) return undefined;
    timeoutRef.current = setTimeout(degrade, SANDBOX_HANDSHAKE_TIMEOUT_MS);
    return clearHandshakeTimeout;
  }, [sandboxOrigin, useFallback, refreshKey, degrade, clearHandshakeTimeout]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !sandboxOrigin || useFallback) return undefined;

    const onFrameLoad = () => {
      if (connectedRef.current) return;
      postRenderToArtifactSandbox(frame, payload, replyOriginRef.current ?? undefined);
    };
    const onFrameError = () => degrade();

    frame.addEventListener('load', onFrameLoad);
    frame.addEventListener('error', onFrameError);
    return () => {
      frame.removeEventListener('load', onFrameLoad);
      frame.removeEventListener('error', onFrameError);
    };
  }, [sandboxOrigin, useFallback, refreshKey, payload, degrade]);

  if (sandboxOrigin && !useFallback) {
    return (
      <iframe
        ref={assignFrame}
        key={`sandbox-${refreshKey}`}
        src={`${sandboxOrigin}/`}
        title={title}
        sandbox="allow-scripts allow-same-origin allow-modals"
        referrerPolicy="no-referrer"
        className={className}
        style={style}
        data-testid={dataTestId}
        data-artifact-sandbox-origin={sandboxOrigin}
      />
    );
  }

  return (
    <iframe
      ref={assignFrame}
      key={`fallback-${refreshKey}`}
      srcDoc={fallbackSrcDoc}
      title={title}
      sandbox={fallbackSandbox}
      referrerPolicy="no-referrer"
      className={className}
      style={style}
      data-testid={dataTestId}
    />
  );
}
