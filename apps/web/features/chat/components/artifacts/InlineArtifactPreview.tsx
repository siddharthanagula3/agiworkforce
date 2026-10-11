'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Spinner } from '@agiworkforce/ui';
import { useMounted } from '@shared/hooks/useMounted';
import { SandboxedIframe } from '../SandboxedIframe';
import type { ArtifactData } from './ArtifactPreview';
import { ArtifactCardHeader, ARTIFACT_OPEN_ACTION } from './ArtifactCardHeader';
import { buildArtifactPreviewDocument, buildArtifactRenderPayload } from './artifact-render';
import { ARTIFACT_KIND_LABEL, artifactTitle, artifactTypeLabel } from './artifact-labels';

export const INLINE_PREVIEW_MIN_HEIGHT = 320;
export const INLINE_PREVIEW_DEFAULT_HEIGHT = 480;
export const INLINE_PREVIEW_MAX_VIEWPORT_FRACTION = 0.7;
const NEAR_VIEWPORT_MARGIN = '400px 0px';
const FALLBACK_VIEWPORT_HEIGHT = 800;
const RENDER_FAILED_COPY = 'This preview could not run.';

export function clampInlinePreviewHeight(contentHeight: number, viewportHeight: number): number {
  const max = Math.max(
    INLINE_PREVIEW_MIN_HEIGHT,
    Math.round(viewportHeight * INLINE_PREVIEW_MAX_VIEWPORT_FRACTION),
  );
  return Math.min(Math.max(Math.ceil(contentHeight), INLINE_PREVIEW_MIN_HEIGHT), max);
}

function useViewportHeight(): number {
  const [height, setHeight] = useState(FALLBACK_VIEWPORT_HEIGHT);
  useEffect(() => {
    const update = () => setHeight(window.innerHeight || FALLBACK_VIEWPORT_HEIGHT);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return height;
}

function useHasBeenNearViewport(ref: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near || !enabled) return;
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: NEAR_VIEWPORT_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, near, ref]);
  return near;
}

interface InlineArtifactPreviewProps {
  artifact: ArtifactData;
  onOpen: () => void;
  shownInPanel: boolean;
}

export function InlineArtifactPreview({
  artifact,
  onOpen,
  shownInPanel,
}: InlineArtifactPreviewProps) {
  const mounted = useMounted();
  const frameRef = useRef<HTMLDivElement>(null);
  const near = useHasBeenNearViewport(frameRef, !shownInPanel);
  const viewportHeight = useViewportHeight();
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const title = artifactTitle(artifact);

  useEffect(() => {
    setContentHeight(null);
    setRenderError(null);
  }, [artifact.content, artifact.type]);

  const payload = useMemo(
    () => (mounted ? buildArtifactRenderPayload(artifact.type, artifact.content) : null),
    [mounted, artifact.type, artifact.content],
  );
  const fallbackDocument = useMemo(
    () => (mounted ? buildArtifactPreviewDocument(artifact.type, artifact.content) : ''),
    [mounted, artifact.type, artifact.content],
  );

  const height = clampInlinePreviewHeight(
    contentHeight ?? INLINE_PREVIEW_DEFAULT_HEIGHT,
    viewportHeight,
  );

  return (
    <section
      className="w-full overflow-hidden rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)]"
      aria-label={`${title}, ${artifactTypeLabel(artifact.type)} ${ARTIFACT_KIND_LABEL.toLowerCase()}`}
      data-testid="inline-artifact-preview"
      data-shown-in-panel={shownInPanel ? 'true' : undefined}
    >
      <ArtifactCardHeader
        artifact={artifact}
        subtitle={`${artifactTypeLabel(artifact.type)} · ${ARTIFACT_KIND_LABEL}`}
        onOpen={onOpen}
        shownInPanel={shownInPanel}
      />
      {!shownInPanel && (
        <div
          ref={frameRef}
          className="flex flex-col border-t border-[var(--chat-border)] bg-background"
          style={{ height }}
          data-testid="inline-artifact-frame"
        >
          {renderError ? (
            <div
              role="status"
              className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
            >
              <AlertTriangle className="h-5 w-5 text-warning-text" aria-hidden="true" />
              <p className="text-sm text-foreground">{RENDER_FAILED_COPY}</p>
              <button
                type="button"
                onClick={onOpen}
                className="rounded-lg border border-[var(--chat-border-strong)] px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ARTIFACT_OPEN_ACTION}
              </button>
            </div>
          ) : payload && near ? (
            <SandboxedIframe
              payload={payload}
              fallbackSrcDoc={fallbackDocument}
              title={title}
              className="block min-h-0 w-full flex-1 border-0"
              onContentHeight={setContentHeight}
              onRenderError={setRenderError}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <Spinner size="sm" aria-label="Loading the preview" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
