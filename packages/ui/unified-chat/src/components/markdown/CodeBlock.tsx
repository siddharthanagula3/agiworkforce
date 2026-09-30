import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Maximize2, SquarePen, X } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  useUiTranslation,
} from '@agiworkforce/ui';
import { reportClientFailure } from '../../lib/client-failures';
import { spreadsheetSafeExport } from '../../lib/tabular';
import { cn } from '../../lib/utils';
import { useCodeBlockEditor } from './codeBlockEditor';
import { codeFileFor } from './codeFileName';
import { downloadTextFile } from './downloadTextFile';
import { HighlightedCode } from './HighlightedCode';
import { MermaidDiagram } from './MermaidDiagram';
import { reactNodeText } from './reactNodeText';
import { useIsStreamTail } from './streamTailContext';
import './codeBlock.css';

type CopyState = 'idle' | 'copied' | 'failed';

const LANGUAGE_CLASS_PATTERN = /language-(\w+)/;
const TRAILING_NEWLINE_PATTERN = /\n$/;
const COPIED_RESET_MS = 2000;
const COPY_FAILED_RESET_MS = 4000;

const HEADER_BUTTON_CLASS =
  'text-[var(--chat-code-lang-label)] hover:bg-[var(--chat-code-copy-hover-bg)] hover:text-[var(--chat-code-copy-hover-fg)]';
const COPY_BUTTON_CLASS = cn(
  HEADER_BUTTON_CLASS,
  'h-8 gap-1.5 px-2.5 text-xs [@media(pointer:coarse)]:h-11',
);
const ICON_BUTTON_CLASS = cn(
  HEADER_BUTTON_CLASS,
  'h-8 w-8 p-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
);

interface FencedCodeBlockProps {
  className?: string;
  language: string;
  code: string;
  isStreamTail: boolean;
}

function FencedCodeBlock({ className, language, code, isStreamTail }: FencedCodeBlockProps) {
  const { t } = useUiTranslation('chat');
  const openInEditor = useCodeBlockEditor();
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(code);
      setCopyState('copied');
      resetTimer.current = setTimeout(() => setCopyState('idle'), COPIED_RESET_MS);
    } catch {
      reportClientFailure({ failure: 'code_copy', detail: 'permission_denied' });
      setCopyState('failed');
      resetTimer.current = setTimeout(() => setCopyState('idle'), COPY_FAILED_RESET_MS);
    }
  }, [code]);

  const codeFile = codeFileFor(language);

  const handleDownload = useCallback(() => {
    const file = codeFileFor(language);
    const { body, mimeType } = spreadsheetSafeExport(code, file.extension);
    downloadTextFile(body, file.fileName, mimeType);
  }, [code, language]);

  const copyText =
    copyState === 'failed'
      ? t('markdown.copyFailed', 'Copy failed')
      : copyState === 'copied'
        ? t('markdown.copied', 'Copied')
        : t('markdown.copy', 'Copy');
  const copyLabel =
    copyState === 'failed'
      ? t('markdown.copyFailedLabel', 'Copying code failed')
      : copyState === 'copied'
        ? t('markdown.copiedLabel', 'Code copied')
        : t('markdown.copyLabel', 'Copy code');
  const downloadLabel = t('markdown.download', 'Download {{fileName}}', {
    fileName: codeFile.fileName,
  });
  const expandLabel = t('markdown.expand', 'Expand code');
  const editLabel = t('markdown.editLabel', 'Edit this code beside the chat');
  const closeLabel = t('markdown.close', 'Close expanded code');
  const blockLabel = t('markdown.codeBlockLabel', '{{language}} code block', { language });

  const copyButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className={COPY_BUTTON_CLASS}
      aria-label={copyLabel}
    >
      {copyState === 'copied' ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {copyText}
    </Button>
  );

  const downloadButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleDownload}
      className={ICON_BUTTON_CLASS}
      aria-label={downloadLabel}
      title={downloadLabel}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
    </Button>
  );

  const highlighted = (
    <HighlightedCode
      code={code}
      language={language}
      enabled={!isStreamTail}
      className={className}
    />
  );

  return (
    <div className="code-block-container group relative my-4">
      <div className="code-block-header-bar">
        <span className="code-block-lang-label">{language}</span>
        <div className="flex items-center gap-0.5">
          {copyButton}
          {openInEditor && !isStreamTail ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openInEditor(code)}
              className={COPY_BUTTON_CLASS}
              aria-label={editLabel}
            >
              <SquarePen className="h-3.5 w-3.5" aria-hidden="true" />
              {t('markdown.edit', 'Edit')}
            </Button>
          ) : null}
          {downloadButton}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(true)}
            className={ICON_BUTTON_CLASS}
            aria-label={expandLabel}
            title={expandLabel}
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="code-block-body">
        <pre tabIndex={0} aria-label={blockLabel}>
          {highlighted}
        </pre>
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          hideCloseButton
          disableAnimation
          aria-describedby={undefined}
          className="inset-4 flex w-auto max-h-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border border-[var(--chat-code-border)] bg-[var(--chat-code-bg)] p-0 backdrop-blur-none"
        >
          <div className="code-block-header-bar">
            <DialogTitle className="font-mono text-xs font-normal text-[var(--chat-code-lang-label)]">
              {t('markdown.codeTitle', '{{language}} code', { language })}
            </DialogTitle>
            <div className="flex items-center gap-0.5">
              {copyButton}
              {downloadButton}
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={ICON_BUTTON_CLASS}
                  aria-label={closeLabel}
                  title={closeLabel}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </DialogClose>
            </div>
          </div>
          <div
            className="code-block-body min-h-0 flex-1 overflow-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus-ring)]"
            role="region"
            aria-label={blockLabel}
            tabIndex={0}
          >
            <pre>{highlighted}</pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const CodeBlock = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  const isStreamTail = useIsStreamTail();
  const match = LANGUAGE_CLASS_PATTERN.exec(className || '');
  const language = match?.[1] ?? '';
  const code = reactNodeText(children).replace(TRAILING_NEWLINE_PATTERN, '');

  if (language === 'mermaid') {
    return (
      <MermaidDiagram source={code} isStreaming={isStreamTail} className="mermaid-block my-4" />
    );
  }

  if (!match) {
    return (
      <code className="rounded-md bg-[var(--chat-surface-hover)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--chat-text-primary)]">
        {children}
      </code>
    );
  }

  return (
    <FencedCodeBlock
      className={className}
      language={language}
      code={code}
      isStreamTail={isStreamTail}
    />
  );
};
