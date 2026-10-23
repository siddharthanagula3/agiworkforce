'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@agiworkforce/ui';
import { MarkdownContent } from '@agiworkforce/unified-chat';
import { SandboxedIframe } from '@/features/chat/components/SandboxedIframe';
import {
  buildPublishedFallbackSrcDoc,
  buildPublishedSandboxPayload,
  buildPublishedSvgImageSrc,
  isSandboxedPublishedKind,
  type PublishedArtifactKind,
} from '@/features/chat/components/artifacts/publishedArtifactRender';
import { ArtifactConnectorConsent } from './ArtifactConnectorConsent';
import { usePublishedArtifactRuntime } from './usePublishedArtifactRuntime';
import { copySharedArtifactToChat } from '@/features/chat/lib/copy-shared-artifact';
import { webEntryHref, webSignInHref } from '@/features/marketing/components/system/nav';
import { toUserMessage } from '@/lib/user-error-message';

export interface PublishedArtifactViewProps {
  title: string;
  kind: PublishedArtifactKind;
  language: string | null;
  content: string;
  publishedAt: string;
  /** Who the publication is for. Drives the line under the title, nothing else. */
  audience?: 'public' | 'organization' | 'invited';
  token?: string;
  aiEnabled?: boolean;
}

function connectorList(connectors: readonly string[]): string {
  const names = connectors.map((id) =>
    id
      .split(/[_.-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
  );
  return new Intl.ListFormat(undefined, { type: 'conjunction' }).format(names);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Untrusted content: the kind branch is the security boundary (publishedArtifactRender.ts). */
export function PublishedArtifactView({
  title,
  kind,
  language,
  content,
  publishedAt,
  audience = 'public',
  token,
  aiEnabled = false,
}: PublishedArtifactViewProps) {
  const { t } = useTranslation('chat');
  const sandboxed = isSandboxedPublishedKind(kind);
  const runnable = kind === 'html' || kind === 'react';
  const runtime = usePublishedArtifactRuntime(runnable ? token : undefined, content, aiEnabled);
  const [renderError, setRenderError] = useState<string | null>(null);
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [dataRefresh, setDataRefresh] = useState(0);

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
  const returnPath = token ? `/shared-artifact/${token}` : '/chat';

  const saveCopy = async () => {
    setCopying(true);
    setCopyError(null);
    try {
      const result = await copySharedArtifactToChat({ title: heading, kind, language, content });
      if (result.kind === 'sign-in') {
        router.push(webEntryHref(returnPath));
        return;
      }
      router.push(`/chat/${encodeURIComponent(result.conversationId)}`);
    } catch (error) {
      setCopyError(
        toUserMessage(
          error,
          t('artifactPublish.saveCopyFailed', 'This artifact could not be copied.'),
        ),
      );
    } finally {
      setCopying(false);
    }
  };

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-4 py-8"
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-h2 text-foreground">{heading}</h1>
          <Button
            size="sm"
            variant="outline"
            disabled={copying}
            onClick={() => void saveCopy()}
            data-testid="published-artifact-save-copy"
          >
            {copying
              ? t('artifactPublish.saveCopyBusy', 'Copying…')
              : t('artifactPublish.saveCopy', 'Save a copy to my chats')}
          </Button>
        </div>
        {copyError ? (
          <p role="alert" className="text-xs text-danger">
            {copyError}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {publishedLabel
            ? `${t('artifactPublish.publishedOn', 'Published {{date}}', { date: publishedLabel })} · `
            : ''}
          <Link
            href={audience === 'public' ? '/' : '/chat'}
            className="underline-offset-2 hover:underline"
          >
            {audience === 'organization'
              ? t('artifactPublish.sharedWithWorkspace')
              : audience === 'invited'
                ? t('artifactPublish.sharedWithYou', 'Shared with you')
                : t('artifactPublish.sharedFrom', 'Shared from AGI')}
          </Link>
        </p>
      </header>

      {renderError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-danger"
        >
          {t(
            'artifactPublish.renderFailed',
            'This artifact could not be rendered. Try again later or return to AGI.',
          )}
        </div>
      ) : null}

      {runtime.signInNeeded && token ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 bg-muted/40 px-4 py-3 text-sm text-foreground"
        >
          <p className="min-w-0 flex-1">
            {t(
              'artifactPublish.runtimeSignIn',
              "Create an account or sign in to use this app's AI and saved data.",
            )}
          </p>
          <Button asChild size="sm">
            <a href={webEntryHref(returnPath)}>
              {t('artifactPublish.runtimeSignUpAction', 'Create an account')}
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={webSignInHref(returnPath)}>
              {t('artifactPublish.runtimeSignInAction', 'Sign in')}
            </a>
          </Button>
        </div>
      ) : null}

      {runtime.askingForAi ? (
        <ArtifactConnectorConsent
          request={runtime.askingForAi}
          appNames={connectorList(runtime.askingForAi.connectorIds)}
          onAnswer={runtime.answerAiRequest}
        />
      ) : runtime.grantedConnectorSets.length > 0 ? (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDataRefresh((count) => count + 1)}
            data-testid="artifact-runtime-refresh-data"
          >
            {t('artifactPublish.runtimeRefreshData', 'Refresh data')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const latest = runtime.grantedConnectorSets[runtime.grantedConnectorSets.length - 1];
              if (latest) runtime.reviewConnectors(latest);
            }}
            data-testid="artifact-runtime-manage-connectors"
          >
            {t('artifactPublish.runtimeManageConnectors', 'Connected apps')}
          </Button>
        </div>
      ) : null}

      {sandboxed ? (
        <SandboxedIframe
          payload={payload}
          fallbackSrcDoc={fallbackSrcDoc}
          title={heading}
          className="h-[70vh] w-full rounded-lg border border-border/40 bg-white"
          onRenderError={setRenderError}
          runtime={runtime.host}
          refreshKey={dataRefresh}
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
