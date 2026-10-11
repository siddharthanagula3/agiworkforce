'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe } from '@agiworkforce/icons';
import { cn } from '@shared/lib/utils';
import { buildSandboxSrcDoc } from '@shared/utils/html-sanitizer';
import { getSandboxOrigin } from '@/lib/artifact-sandbox';
import { SandboxedIframe } from '@features/chat/components/SandboxedIframe';
import {
  buildPublishedFallbackSrcDoc,
  buildPublishedSandboxPayload,
  buildPublishedSvgImageSrc,
  isSandboxedPublishedKind,
} from '@features/chat/components/artifacts/publishedArtifactRender';
import { readPublishedSiteVersion, type PublishedSite } from '../services/sites-service';

const THUMBNAIL_SCALE = 0.25;
const TEXT_EXCERPT_CHARS = 1_200;

type ThumbnailSite = Pick<PublishedSite, 'token' | 'version' | 'kind' | 'title'>;

function useNearViewport(ref: React.RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || near) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, near]);
  return near;
}

const LIGHT_CANVAS: React.CSSProperties = { colorScheme: 'light', background: 'Canvas' };

const scaledFrameStyle: React.CSSProperties = {
  ...LIGHT_CANVAS,
  width: `${100 / THUMBNAIL_SCALE}%`,
  height: `${100 / THUMBNAIL_SCALE}%`,
  transform: `scale(${THUMBNAIL_SCALE})`,
};

const scaledFrameClass = 'pointer-events-none absolute start-0 top-0 origin-top-left border-0';

function ThumbnailPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Globe className="h-6 w-6 text-[var(--chat-text-muted)]" aria-hidden="true" />
    </div>
  );
}

function ThumbnailBody({ site, content }: { site: ThumbnailSite; content: string }) {
  const origin = getSandboxOrigin();
  const sandboxed = useMemo(
    () =>
      isSandboxedPublishedKind(site.kind) && origin
        ? {
            payload: buildPublishedSandboxPayload(site.kind, content),
            fallbackSrcDoc: buildPublishedFallbackSrcDoc(site.kind, content),
          }
        : null,
    [site.kind, content, origin],
  );
  const svgSrc = useMemo(
    () => (site.kind === 'svg' ? buildPublishedSvgImageSrc(content) : null),
    [site.kind, content],
  );
  const staticHtml = useMemo(
    () => (site.kind === 'html' && !origin ? buildSandboxSrcDoc(content) : null),
    [site.kind, content, origin],
  );

  if (sandboxed) {
    return (
      <SandboxedIframe
        payload={sandboxed.payload}
        fallbackSrcDoc={sandboxed.fallbackSrcDoc}
        title={`Preview of ${site.title || 'site'}`}
        className={scaledFrameClass}
        style={scaledFrameStyle}
      />
    );
  }
  if (staticHtml !== null) {
    return (
      <iframe
        title={`Preview of ${site.title || 'site'}`}
        sandbox=""
        srcDoc={staticHtml}
        tabIndex={-1}
        className={scaledFrameClass}
        style={scaledFrameStyle}
      />
    );
  }
  if (svgSrc) {
    return (
      <img src={svgSrc} alt="" className="h-full w-full object-contain p-3" style={LIGHT_CANVAS} />
    );
  }
  if (site.kind === 'markdown' || site.kind === 'text' || site.kind === 'code') {
    return (
      <pre className="h-full w-full overflow-hidden whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-[var(--chat-text-secondary)]">
        {content.slice(0, TEXT_EXCERPT_CHARS)}
      </pre>
    );
  }
  return <ThumbnailPlaceholder />;
}

/**
 * A picture of a published site, never a working copy of it: the frame takes
 * no focus or pointer input and answers every AI or storage call with a
 * refusal, so rendering a list of sites costs nothing and changes nothing.
 */
export function SiteThumbnail({ site, className }: { site: ThumbnailSite; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const near = useNearViewport(containerRef);
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    if (!near || site.version < 1) return undefined;
    const controller = new AbortController();
    readPublishedSiteVersion(site.token, site.version, controller.signal)
      .then((detail) => setContent(detail.content))
      .catch(() => setContent(null));
    return () => controller.abort();
  }, [near, site.token, site.version]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      inert
      data-testid="site-thumbnail"
      className={cn('relative overflow-hidden bg-[var(--chat-surface-hover)]', className)}
    >
      {content === null ? (
        <ThumbnailPlaceholder />
      ) : (
        <ThumbnailBody site={site} content={content} />
      )}
    </div>
  );
}
