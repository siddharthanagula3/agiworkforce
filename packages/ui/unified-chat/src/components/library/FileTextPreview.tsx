import { useEffect, useMemo, useState } from 'react';
import {
  FileTextPreviewSchema,
  type FileTextPreview as FileTextPreviewData,
} from '@agiworkforce/cloud-contracts';
import { parseTabular } from '../../lib/tabular';

export type FileTextPreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; preview: FileTextPreviewData }
  | { status: 'failed' };

const TEXT_PREVIEW_ROW_CAP = 500;

export function useFileTextPreview(
  uri: string | null,
  load: ((uri: string) => Promise<Response>) | undefined,
): FileTextPreviewState {
  const [state, setState] = useState<FileTextPreviewState>({ status: 'idle' });
  useEffect(() => {
    if (!uri || !load) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    void load(uri)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = FileTextPreviewSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Unexpected preview');
        if (!cancelled) setState({ status: 'ready', preview: parsed.data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [uri, load]);
  return state;
}

export function FileTextPreview({ preview }: { preview: FileTextPreviewData }) {
  const table = useMemo(
    () => (preview.kind === 'table' ? parseTabular(preview.text) : null),
    [preview.kind, preview.text],
  );
  const rows = table ? table.rows.slice(0, TEXT_PREVIEW_ROW_CAP) : [];
  const cut = preview.truncated || (table !== null && table.rows.length > rows.length);
  return (
    <div
      data-testid="library-text-preview"
      className="flex max-h-full w-full max-w-4xl flex-col gap-2 self-start overflow-auto rounded-lg bg-[var(--chat-surface-base)] p-4 text-sm text-[var(--chat-text-primary)]"
    >
      {table ? (
        <table className="w-full border-collapse text-start text-xs">
          <thead>
            <tr>
              {table.columns.map((header, index) => (
                <th
                  key={index}
                  className="border-b border-[var(--chat-border)] px-2 py-1 font-semibold"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border-b border-[var(--chat-border)] px-2 py-1 align-top"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <pre className="whitespace-pre-wrap break-words font-[var(--chat-font-mono)] text-xs">
          {preview.text}
        </pre>
      )}
      {cut ? (
        <p className="text-xs text-[var(--chat-text-secondary)]">
          Showing the start of this file. Download it to see all of it.
        </p>
      ) : null}
    </div>
  );
}
