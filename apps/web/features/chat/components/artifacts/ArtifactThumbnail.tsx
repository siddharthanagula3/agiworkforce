'use client';

import { useMemo } from 'react';
import { useMounted } from '@shared/hooks/useMounted';
import { cn } from '@shared/lib/utils';
import { buildSandboxSrcDoc } from '@shared/utils/html-sanitizer';
import type { ArtifactData } from './ArtifactPreview';
import { TypeIcon } from './ArtifactLabels';
import { canRenderLivePreview } from './artifact-render';

const THUMBNAIL_SOURCE_CHARS = 4_000;
const THUMBNAIL_SCALE = 0.4;

function thumbnailDocument(type: ArtifactData['type'], content: string): string {
  const head = content.slice(0, THUMBNAIL_SOURCE_CHARS);
  if (type === 'html') return buildSandboxSrcDoc(head);
  return `<html><head><meta charset="UTF-8"><style>:root{color-scheme:light}body{margin:0;padding:8px;overflow:hidden;background:Canvas;color:CanvasText}*{max-width:100%}</style></head><body>${head}</body></html>`;
}

/**
 * A static picture of a renderable artifact. The frame allows no scripts: a
 * srcdoc document inherits this app's nonce-based CSP, so scripts would only
 * log violations, and a thumbnail has nothing to run. The interactive preview
 * is where execution is the point.
 */
export function ArtifactThumbnail({
  artifact,
  className,
}: {
  artifact: Pick<ArtifactData, 'type' | 'content' | 'title'>;
  className?: string;
}) {
  const mounted = useMounted();
  const renderable = mounted && canRenderLivePreview(artifact.type) && artifact.type !== 'react';
  const srcDoc = useMemo(
    () => (renderable ? thumbnailDocument(artifact.type, artifact.content) : ''),
    [renderable, artifact.type, artifact.content],
  );

  return (
    <div
      className={cn('relative overflow-hidden bg-[var(--chat-surface-hover)]', className)}
      aria-hidden="true"
    >
      {renderable ? (
        <iframe
          title={artifact.title || 'Artifact preview'}
          sandbox=""
          srcDoc={srcDoc}
          tabIndex={-1}
          className="pointer-events-none absolute start-0 top-0 origin-top-left border-0"
          style={{
            colorScheme: 'light',
            backgroundColor: 'Canvas',
            width: `${100 / THUMBNAIL_SCALE}%`,
            height: `${100 / THUMBNAIL_SCALE}%`,
            transform: `scale(${THUMBNAIL_SCALE})`,
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <TypeIcon type={artifact.type} className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
