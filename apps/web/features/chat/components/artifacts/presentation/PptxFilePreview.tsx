'use client';

import { useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import { pptxToSlidesMarkdown } from '@features/chat/lib/office-file-preview';
import { PresentationWorkspace } from './PresentationWorkspace';

export const PPTX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const MAX_PPTX_PREVIEW_BYTES = 40 * 1024 * 1024;

export function isPptxFile(fileName: string, mimeType: string): boolean {
  return mimeType === PPTX_MIME_TYPE || /\.pptx$/i.test(fileName);
}

type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; markdown: string }
  | { status: 'failed'; reason: string };

const NOOP = () => undefined;

export function PptxFilePreview({
  source,
  fileName,
  byteCount,
}: {
  source: string | Blob;
  fileName: string;
  byteCount?: number;
}) {
  const [state, setState] = useState<PreviewState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    if (byteCount !== undefined && byteCount > MAX_PPTX_PREVIEW_BYTES) {
      setState({
        status: 'failed',
        reason: 'This presentation is too large to preview. Download it to open it.',
      });
      return;
    }
    const load = async () => {
      const buffer =
        typeof source === 'string'
          ? await fetch(source, { credentials: 'same-origin' }).then((response) => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              return response.arrayBuffer();
            })
          : await source.arrayBuffer();
      return pptxToSlidesMarkdown(buffer);
    };
    load()
      .then((markdown) => {
        if (cancelled) return;
        setState(
          markdown.trim()
            ? { status: 'ready', markdown }
            : { status: 'failed', reason: 'This presentation has no slides to show.' },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            status: 'failed',
            reason: 'This presentation could not be opened for preview.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source, byteCount]);

  if (state.status === 'loading') {
    return (
      <div className="flex w-full justify-center p-6">
        <Spinner size="sm" aria-label="Loading the presentation" />
      </div>
    );
  }
  if (state.status === 'failed') {
    return (
      <p className="w-full p-6 text-center text-sm text-muted-foreground" role="status">
        {state.reason}
      </p>
    );
  }
  return (
    <div className="w-full" data-testid="pptx-file-preview">
      <p className="px-4 pt-3 text-xs text-muted-foreground">
        Preview shows the text, tables and pictures of each slide. Download the file for its exact
        layout.
      </p>
      <PresentationWorkspace
        title={fileName.replace(/\.pptx$/i, '')}
        content={state.markdown}
        editable={false}
        handEdited={false}
        onSave={NOOP}
      />
    </div>
  );
}
