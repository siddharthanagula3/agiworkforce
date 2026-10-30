import { useMemo, useState } from 'react';
import { Button, Spinner, useUiTranslation } from '@agiworkforce/ui';
import { useSameDocumentScriptSupport } from '../../hooks/useSameDocumentScriptSupport';
import { htmlDeclaresScripts, SCRIPTS_BLOCKED_NOTICE } from '../../lib/artifact-preview-capability';
import {
  buildSandboxedHtml,
  getArtifactSandboxOrigin,
  type ArtifactRenderPayload,
} from '../../lib/artifact-sandbox';
import { ArtifactSandboxFrame } from '../artifact-components/ArtifactSandboxFrame';

const FRAME_CLASS =
  'h-48 w-full border-b border-[var(--chat-code-border)] bg-[var(--chat-code-bg)]';

function StaticHtmlPreview({ code }: { code: string }) {
  const { t } = useUiTranslation('chat');
  const prepared = useMemo(() => buildSandboxedHtml(code), [code]);
  return (
    <div data-html-preview-static>
      <p className="border-b border-[var(--chat-code-border)] px-4 py-2 text-xs text-[var(--chat-text-secondary)]">
        {t('markdown.staticHtmlPreview', 'Static HTML preview')}
      </p>
      <iframe
        title={t('markdown.htmlPreview', 'HTML preview')}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={prepared}
        data-html-preview=""
        className={FRAME_CLASS}
      />
    </div>
  );
}

function SameDocumentHtmlPreview({ code }: { code: string }) {
  const { t } = useUiTranslation('chat');
  const support = useSameDocumentScriptSupport();
  const prepared = useMemo(() => {
    try {
      return buildSandboxedHtml(code);
    } catch {
      return null;
    }
  }, [code]);
  if (support !== 'allowed' || prepared === null)
    return (
      <p
        role="status"
        data-html-preview-unavailable
        className="border-b border-[var(--chat-code-border)] px-4 py-3 text-sm text-[var(--chat-text-secondary)]"
      >
        {support === 'blocked'
          ? SCRIPTS_BLOCKED_NOTICE
          : t(
              'markdown.htmlPreviewUnavailable',
              'This HTML preview is unavailable. Its source is kept below.',
            )}
      </p>
    );
  return (
    <iframe
      title={t('markdown.htmlPreview', 'HTML preview')}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={prepared}
      data-html-preview=""
      className={FRAME_CLASS}
    />
  );
}

export function HtmlCodePreview({ code }: { code: string }) {
  const { t } = useUiTranslation('chat');
  const origin = getArtifactSandboxOrigin();
  const [degradedOrigin, setDegradedOrigin] = useState<string | null>(null);
  const [readySource, setReadySource] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const payload = useMemo<ArtifactRenderPayload>(
    () => ({ type: 'render', kind: 'html', html: code, runScripts: true }),
    [code],
  );
  const fallback = htmlDeclaresScripts(code) ? (
    <SameDocumentHtmlPreview code={code} />
  ) : (
    <StaticHtmlPreview code={code} />
  );
  if (!origin) return fallback;
  if (degradedOrigin === origin)
    return (
      <>
        <div className="border-b border-[var(--chat-code-border)] px-4 py-3 text-sm text-[var(--chat-text-secondary)]">
          <p>{t('markdown.isolatedPreviewUnavailable', 'The isolated preview did not respond.')}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDegradedOrigin(null);
              setReadySource(null);
              setFailedSource(null);
              setRefreshKey((current) => current + 1);
            }}
          >
            {t('markdown.retryIsolatedPreview', 'Retry isolated preview')}
          </Button>
        </div>
        {fallback}
      </>
    );
  if (failedSource === code)
    return (
      <div
        role="status"
        className="border-b border-[var(--chat-code-border)] px-4 py-3 text-sm text-[var(--chat-text-secondary)]"
      >
        <p>
          {t(
            'markdown.htmlPreviewFailed',
            'This HTML preview could not be rendered. Its source is kept below.',
          )}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setFailedSource(null);
            setReadySource(null);
            setRefreshKey((current) => current + 1);
          }}
        >
          {t('markdown.retryHtmlPreview', 'Retry preview')}
        </Button>
      </div>
    );
  return (
    <div className="relative" data-html-preview="" aria-busy={readySource !== code}>
      <ArtifactSandboxFrame
        payload={payload}
        fallbackSrcDoc=""
        fallbackSandbox=""
        title={t('markdown.htmlPreview', 'HTML preview')}
        className={FRAME_CLASS}
        refreshKey={refreshKey}
        onRenderComplete={() => setReadySource(code)}
        onRenderError={() => setFailedSource(code)}
        onFallback={() => setDegradedOrigin(origin)}
      />
      {readySource !== code ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner
            size="sm"
            aria-label={t('markdown.loadingHtmlPreview', 'Loading HTML preview')}
          />
        </div>
      ) : null}
    </div>
  );
}
