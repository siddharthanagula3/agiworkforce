'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MarkdownContent } from '@agiworkforce/unified-chat';
import { SandboxedIframe } from '@/features/chat/components/SandboxedIframe';
import {
  buildPublishedFallbackSrcDoc,
  buildPublishedSandboxPayload,
  buildPublishedSvgImageSrc,
  isSandboxedPublishedKind,
  type PublishedArtifactKind,
} from '@/features/chat/components/artifacts/publishedArtifactRender';

/**
 * Public viewer for a published artifact (CAP-015 slice 2).
 *
 * Renders untrusted, publicly reachable content, so the kind branch here is the
 * security boundary, see `publishedArtifactRender.ts` for the rule. Scripted
 * kinds go through {@link SandboxedIframe} (cross-origin sandbox origin, or the
 * null-origin `srcDoc` fallback); everything else renders inert.
 */

export interface PublishedArtifactViewProps {
  title: string;
  kind: PublishedArtifactKind;
  language: string | null;
  content: string;
  publishedAt: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function PublishedArtifactView({
  title,
  kind,
  language,
  content,
  publishedAt,
}: PublishedArtifactViewProps) {
  const { t } = useTranslation('chat');
  const sandboxed = isSandboxedPublishedKind(kind);
  const [renderError, setRenderError] = useState<string | null>(null);

  const payload = useMemo(() => buildPublishedSandboxPayload(kind, content), [kind, content]);
  const fallbackSrcDoc = useMemo(
    () => buildPublishedFallbackSrcDoc(kind, content),
    [kind, content],
  );
  const svgSrc = useMemo(
    () => (kind === 'svg' ? buildPublishedSvgImageSrc(content) : null),
    [kind, content],
  );

  const publishedLabel = formatDate(publishedAt);
  const heading = title || t('artifactPublish.untitled', 'Published artifact');

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{heading}</h1>
        <p className="text-xs text-muted-foreground">
          {publishedLabel
            ? `${t('artifactPublish.publishedOn', 'Published {{date}}', { date: publishedLabel })} · `
            : ''}
          {t('artifactPublish.sharedFrom', 'Shared from AGI')}
        </p>
      </header>

      {renderError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-danger"
        >
          {t('artifactPublish.renderFailed', 'This artifact failed to render: {{error}}', {
            error: renderError,
          })}
        </div>
      ) : null}

      {sandboxed ? (
        <SandboxedIframe
          payload={payload}
          fallbackSrcDoc={fallbackSrcDoc}
          title={heading}
          className="h-[70vh] w-full rounded-lg border border-border/40 bg-white"
          onRenderError={setRenderError}
        />
      ) : kind === 'svg' ? (
        svgSrc ? (
          <img
            src={svgSrc}
            alt={heading}
            className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg border border-border/40 bg-white p-4"
          />
        ) : (
          <p className="rounded-lg border border-border/40 px-4 py-3 text-sm text-muted-foreground">
            {t(
              'artifactPublish.svgUnavailable',
              'This SVG contained nothing that could be safely displayed.',
            )}
          </p>
        )
      ) : kind === 'markdown' ? (
        <div className="rounded-lg border border-border/40 px-5 py-4">
          <MarkdownContent content={content} />
        </div>
      ) : (
        <pre className="overflow-x-auto rounded-lg border border-border/40 px-5 py-4 text-sm">
          <code data-language={language ?? undefined}>{content}</code>
        </pre>
      )}
    </main>
  );
}
