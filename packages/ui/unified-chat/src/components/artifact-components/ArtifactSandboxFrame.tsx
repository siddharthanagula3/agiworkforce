/**
 * ArtifactSandboxFrame — an artifact preview that has its own document origin.
 *
 * DES-C15. Artifact previews were `<iframe srcDoc=…>`. An `about:srcdoc`
 * document INHERITS the embedder's Content-Security-Policy, and the packaged
 * desktop app ships `script-src 'self' 'wasm-unsafe-eval'`
 * (`apps/desktop/src-tauri/tauri.conf.json`). The artifact's own permissive
 * `<meta>` policy can only intersect with the inherited one, never widen it — so
 * an interactive HTML artifact rendered its markup and then did nothing, and a
 * React artifact rendered nothing at all. Local was affected as much as Cloud.
 *
 * The fix is the one web already shipped: render artifacts on a SEPARATE ORIGIN
 * and ship the artifact over `postMessage`. This component is the shared client
 * half of that. It is a port of
 * `apps/web/features/chat/components/SandboxedIframe.tsx` into the package both
 * surfaces consume, talking to the same renderer file
 * (`infrastructure/sandbox/index.html`) with the same message contract:
 *
 *   sandbox → parent : { type: 'sandbox-ready' }
 *   parent  → sandbox: { type: 'render', kind, … }
 *   sandbox → parent : { type: 'render-complete' | 'render-error', … }
 *
 * The origin comes from `getArtifactSandboxOrigin()`:
 *   - desktop  — `artifact://localhost` (`http://artifact.localhost` on Windows),
 *                served out of the binary by
 *                `apps/desktop/src-tauri/src/ui/artifact_sandbox.rs`
 *   - web      — `NEXT_PUBLIC_SANDBOX_ORIGIN`
 *   - anywhere else — `null`, and this component renders `fallbackSrcDoc`
 *                exactly as before, with no behaviour change.
 *
 * Degradation is deliberate and visible to the caller: if the sandbox never
 * completes its handshake (protocol not registered, renderer 500, frame blocked
 * by `frame-src`) the component falls back to the srcDoc document and calls
 * `onFallback`, so the host can go back to telling the truth about what a
 * same-document preview can and cannot do.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import {
  getArtifactSandboxOrigin,
  isArtifactSandboxMessage,
  postRenderToArtifactSandbox,
  type ArtifactRenderPayload,
  type SandboxIncomingMessage,
} from '../../lib/artifact-sandbox';

/**
 * How long to wait for `sandbox-ready` before giving up on the sandbox origin.
 *
 * `load` firing is NOT proof the renderer is alive — a frame can load and then
 * have its scripts blocked, or be served an error page. Only the handshake is
 * proof, so only the handshake cancels this timer.
 */
const SANDBOX_HANDSHAKE_TIMEOUT_MS = 3_000;

export interface ArtifactSandboxFrameProps {
  /** The artifact to render, in the renderer's wire shape. */
  payload: ArtifactRenderPayload;
  /**
   * Document to use when no sandbox origin exists (or the sandbox failed to
   * answer). Should already carry its own CSP `<meta>` — see
   * `buildSandboxedHtml`.
   */
  fallbackSrcDoc: string;
  /** `sandbox` attribute for the fallback frame. Never gains `allow-same-origin`. */
  fallbackSandbox: string;
  /** Accessible title for the iframe. */
  title: string;
  className?: string;
  style?: CSSProperties;
  /** Bump to force a full re-mount (clears artifact state inside the frame). */
  refreshKey?: number;
  /** Fired when the renderer reports it finished drawing the artifact. */
  onRenderComplete?: () => void;
  /** Fired when the renderer reports a failure. */
  onRenderError?: (error: string) => void;
  /**
   * Fired when this component gives up on the sandbox origin and renders
   * `fallbackSrcDoc` instead. Hosts use it to restore same-document warnings.
   */
  onFallback?: () => void;
  /**
   * Receives whichever iframe is currently mounted.
   *
   * Callers that authenticate their OWN postMessage traffic against the fallback
   * document (`ReactPreview` matches `event.source` to it) need the element
   * identity; without it their listener silently rejects every message and the
   * preview would spin forever on the fallback path.
   *
   * Structurally typed rather than `RefObject`/`MutableRefObject` so it accepts a
   * plain `useRef` box under both React 18 and 19 ref typings.
   */
  frameRef?: { current: HTMLIFrameElement | null };
  /** Test hook, forwarded to whichever iframe is mounted. */
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
  /** Origin the sandbox announced itself from; used verbatim as targetOrigin. */
  const replyOriginRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHandshakeTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // A new origin or a forced re-mount means a brand-new handshake.
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

  // Re-ship the artifact when it changes after the handshake (an edit, a new
  // version). Without this the frame would keep showing the first payload.
  useEffect(() => {
    if (!sandboxOrigin || useFallback || !connectedRef.current) return;
    postRenderToArtifactSandbox(frameRef.current, payload, replyOriginRef.current ?? undefined);
  }, [sandboxOrigin, useFallback, payload]);

  // Start (or restart) the handshake deadline.
  useEffect(() => {
    if (!sandboxOrigin || useFallback || connectedRef.current) return undefined;
    timeoutRef.current = setTimeout(degrade, SANDBOX_HANDSHAKE_TIMEOUT_MS);
    return clearHandshakeTimeout;
  }, [sandboxOrigin, useFallback, refreshKey, degrade, clearHandshakeTimeout]);

  // `load` / `error` are attached to the element rather than passed as React
  // props: neither event bubbles, and React's synthetic delegation does not
  // deliver them for `<iframe>`, so an `onError` prop here would simply never
  // fire and a frame that failed to load would sit dead until the handshake
  // deadline. Attaching directly is also what a real browser needs.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !sandboxOrigin || useFallback) return undefined;

    const onFrameLoad = () => {
      // Best-effort backup for the case where `sandbox-ready` was posted before
      // our listener attached. Deliberately does NOT mark the sandbox connected:
      // a document can load and still be inert, and treating load as success is
      // exactly how a dead frame gets mistaken for a working preview.
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
        // The renderer is a dedicated cross-origin document, so keeping its
        // origin is what lets us authenticate its messages. It grants no access
        // to this app: the two documents remain cross-origin. This combination
        // stays forbidden on the same-origin fallback below.
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
