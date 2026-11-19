'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  cn,
  translateUiPlural,
} from '@agiworkforce/ui';
import {
  MAX_IMPORT_ITEMS,
  MAX_IMPORT_TEXT_CHARS,
  parseManagedMemoryImportCommitResponse,
  parseManagedMemoryImportPreviewResponse,
  type ManagedMemoryImportCommitResponse,
  type ManagedMemoryImportPreviewResponse,
  type ManagedMemoryImportRequest,
  type ManagedMemoryRecord,
} from '@agiworkforce/types';
import { useCloudMemory, useMemoryView } from '@/features/memory/use-cloud-memory';
import type { CloudMemoryController } from '@/features/memory/cloud-memory-controller';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';
import { safeClipboard } from '@shared/utils/browser-utils';
import { toUserMessage } from '@/lib/user-error-message';

const IMPORT_ENDPOINT = '/api/memory/import';
const IMPORT_FILE_ACCEPT = '.txt,.json,text/plain,application/json';
const IMPORT_SOURCE_PRESETS = ['ChatGPT', 'Claude', 'Gemini', 'Copilot', 'Other'] as const;
type ImportSourcePreset = (typeof IMPORT_SOURCE_PRESETS)[number];

const EXPORT_PROMPT =
  'List every memory you have stored about me and the lasting context you have learned from our past conversations: my preferences, details about me, my work and projects, and instructions I have given you. Write one fact per line, starting each line with a dash, and add nothing else.';
const COPY_FAILED_MESSAGE = 'The prompt was not copied. Select it and copy it yourself.';

type DialogStep = 'compose' | 'preview' | 'done';
type PromptCopyState = 'idle' | 'copied' | 'failed';

export interface ImportMemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (memories: ManagedMemoryRecord[]) => void;
}

export function useImportMemoryDialog() {
  const [isOpen, setIsOpen] = useState(false);
  return {
    isOpen,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
  };
}

async function requestImport<T>(
  controller: CloudMemoryController,
  current: () => boolean,
  request: ManagedMemoryImportRequest,
  parse: (value: unknown) => T | null,
): Promise<T> {
  return controller.request(
    IMPORT_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
    parse,
    { current, mutation: request.mode === 'commit', changesFacts: request.mode === 'commit' },
  );
}

export function ImportMemoryDialog(props: ImportMemoryDialogProps) {
  const controller = useCloudMemory();
  return props.open && controller ? (
    <OwnedImportMemoryDialog key={controller.key} {...props} controller={controller} />
  ) : null;
}

function OwnedImportMemoryDialog({
  open,
  onOpenChange,
  onImported,
  controller,
}: ImportMemoryDialogProps & { controller: CloudMemoryController }) {
  const capture = useMemoryView(controller);
  const closed = useRef(false);
  const readerRef = useRef<FileReader | null>(null);
  const requestGeneration = useRef(0);
  const commitPending = useRef(false);
  useEffect(
    () => () => {
      readerRef.current?.abort();
    },
    [],
  );
  const captureDialog = useCallback(() => {
    const current = capture();
    return () => current() && !closed.current;
  }, [capture]);
  const [step, setStep] = useState<DialogStep>('compose');
  const [text, setText] = useState('');
  const [sourcePreset, setSourcePreset] = useState<ImportSourcePreset>('ChatGPT');
  const [customSourceName, setCustomSourceName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [promptCopy, setPromptCopy] = useState<PromptCopyState>('idle');
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ManagedMemoryImportPreviewResponse | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<ManagedMemoryImportCommitResponse | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const resetState = useCallback(() => {
    setStep('compose');
    setText('');
    setSourcePreset('ChatGPT');
    setCustomSourceName('');
    setFileError(null);
    setPromptCopy('idle');
    setPreviewing(false);
    setPreviewError(null);
    setPreview(null);
    setSelected(new Set());
    setCommitting(false);
    setCommitError(null);
    setCommitResult(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && committing) return;
      if (!next) {
        closed.current = true;
        readerRef.current?.abort();
      }
      onOpenChange(next);
      if (!next) resetState();
    },
    [committing, onOpenChange, resetState],
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const current = captureDialog();
      if (!current()) return;
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      requestGeneration.current += 1;
      setPreviewing(false);
      readerRef.current?.abort();
      setFileError(null);
      if (file.size > MAX_IMPORT_TEXT_CHARS) {
        setFileError('That file is too large to import.');
        return;
      }
      const reader = new FileReader();
      readerRef.current?.abort();
      readerRef.current = reader;
      reader.onload = () => {
        if (current() && readerRef.current === reader && typeof reader.result === 'string') {
          requestGeneration.current += 1;
          setPreviewing(false);
          setText(reader.result);
        }
      };
      reader.onerror = () => {
        if (current() && readerRef.current === reader) setFileError('Could not read that file.');
      };
      reader.readAsText(file);
    },
    [captureDialog],
  );

  const handleCopyPrompt = useCallback(async () => {
    const current = captureDialog();
    if (!current()) return;
    const copied = await safeClipboard.writeText(EXPORT_PROMPT);
    if (current()) setPromptCopy(copied ? 'copied' : 'failed');
  }, [captureDialog]);

  const resolvedSourceName = sourcePreset === 'Other' ? customSourceName : sourcePreset;

  const handlePreview = useCallback(async () => {
    readerRef.current?.abort();
    readerRef.current = null;
    const dialogCurrent = captureDialog();
    const generation = ++requestGeneration.current;
    const current = () => dialogCurrent() && generation === requestGeneration.current;
    if (!current()) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setPreviewError(null);
    setPreviewing(true);
    try {
      const result = await requestImport(
        controller,
        current,
        { mode: 'dry-run', text: trimmed, sourceName: resolvedSourceName },
        parseManagedMemoryImportPreviewResponse,
      );
      if (!current()) return;
      setPreview(result);
      setSelected(
        new Set(
          result.items
            .map((item, index) => (item.duplicate ? -1 : index))
            .filter((index) => index !== -1),
        ),
      );
      setStep('preview');
    } catch (error) {
      if (current()) setPreviewError(toUserMessage(error, 'Could not read that text.'));
    } finally {
      if (current()) setPreviewing(false);
    }
  }, [text, resolvedSourceName, controller, captureDialog]);

  const toggleItem = useCallback((index: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const selectedCount = selected.size;
  const totalPreviewItems = preview?.items.length ?? 0;
  const allSelected = totalPreviewItems > 0 && selectedCount === totalPreviewItems;
  const someSelected = selectedCount > 0 && !allSelected;
  const selectionLabel = allSelected ? 'Deselect all' : 'Select all';

  const toggleSelectAll = useCallback(() => {
    if (!preview) return;
    setSelected(allSelected ? new Set() : new Set(preview.items.map((_, index) => index)));
  }, [allSelected, preview]);

  const handleCommit = useCallback(async () => {
    if (commitPending.current) return;
    const current = captureDialog();
    if (!current()) return;
    if (!preview) return;
    const items = preview.items
      .filter((_, index) => selected.has(index))
      .map((item) => item.content);
    if (items.length === 0) return;
    commitPending.current = true;
    setCommitError(null);
    setCommitting(true);
    try {
      const result = await requestImport(
        controller,
        current,
        { mode: 'commit', items, sourceName: preview.sourceName },
        parseManagedMemoryImportCommitResponse,
      );
      if (!current()) return;
      setCommitResult(result);
      setStep('done');
      onImported?.(result.memories);
    } catch (error) {
      if (current())
        setCommitError(
          toUserMessage(
            error,
            'Could not confirm the import. Check your saved memories before trying again.',
          ),
        );
    } finally {
      commitPending.current = false;
      if (current()) setCommitting(false);
    }
  }, [preview, selected, onImported, controller, captureDialog]);

  const charCount = text.length;
  const overCharLimit = charCount > MAX_IMPORT_TEXT_CHARS;

  const doneSummary = useMemo(() => {
    if (!commitResult) return '';
    return translateUiPlural(
      'settings',
      'counts.importedMemories',
      commitResult.insertedCount,
      {
        one: 'Imported {{count}} memory from {{source}}.',
        other: 'Imported {{count}} memories from {{source}}.',
      },
      { source: commitResult.sourceName },
    );
  }, [commitResult]);

  const excludedSummary = useMemo(() => {
    const count = commitResult?.excludedCount ?? 0;
    if (count === 0) return null;
    return translateUiPlural('settings', 'counts.excludedMemories', count, {
      one: '{{count}} memory matched a term on your never remember list and was not saved.',
      other: '{{count}} memories matched a term on your never remember list and were not saved.',
    });
  }, [commitResult]);

  const blockedSummary = useMemo(() => {
    const count = commitResult?.blockedCount ?? 0;
    if (count === 0) return null;
    return translateUiPlural('settings', 'counts.blockedMemories', count, {
      one: '{{count}} memory was blocked by your memory settings or workspace policy and was not saved.',
      other:
        '{{count}} memories were blocked by your memory settings or workspace policy and were not saved.',
    });
  }, [commitResult]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[min(96vw,40rem)]"
        onEscapeKeyDown={(event) => {
          if (committing) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (committing) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Import memory from other AI providers</DialogTitle>
          <DialogDescription>
            Send the prompt below to your other assistant, then paste its reply to review before
            saving.
          </DialogDescription>
          <div>
            <HelpArticleLink docId="memory" label="Learn more" />
          </div>
        </DialogHeader>

        {step === 'compose' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span id="import-memory-prompt" className="text-sm font-medium text-foreground">
                  Prompt for your other assistant
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyPrompt()}
                  className="rounded-full border border-border px-3 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {promptCopy === 'copied' ? 'Copied' : 'Copy prompt'}
                </button>
              </div>
              <p
                aria-labelledby="import-memory-prompt"
                className="select-all rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              >
                {EXPORT_PROMPT}
              </p>
              <span className="sr-only" aria-live="polite">
                {promptCopy === 'copied' ? 'Prompt copied' : ''}
              </span>
              {promptCopy === 'failed' && (
                <p role="alert" className="text-sm text-danger">
                  {COPY_FAILED_MESSAGE}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="import-memory-source" className="text-sm font-medium text-foreground">
                Source
              </label>
              <select
                id="import-memory-source"
                value={sourcePreset}
                onChange={(event) => {
                  requestGeneration.current += 1;
                  setPreviewing(false);
                  setSourcePreset(event.target.value as ImportSourcePreset);
                }}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                {IMPORT_SOURCE_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
              {sourcePreset === 'Other' && (
                <input
                  type="text"
                  value={customSourceName}
                  onChange={(event) => {
                    requestGeneration.current += 1;
                    setPreviewing(false);
                    setCustomSourceName(event.target.value);
                  }}
                  placeholder="Assistant name"
                  aria-label="Custom source name"
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="import-memory-text" className="text-sm font-medium text-foreground">
                  Paste memories
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Upload file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={IMPORT_FILE_ACCEPT}
                  className="sr-only"
                  aria-label="Upload a memory export file"
                  onChange={handleFileChange}
                />
              </div>
              <textarea
                id="import-memory-text"
                value={text}
                onChange={(event) => {
                  requestGeneration.current += 1;
                  setPreviewing(false);
                  readerRef.current?.abort();
                  setText(event.target.value);
                }}
                rows={8}
                placeholder="- Prefers concise answers&#10;- Works as a backend engineer&#10;- Lives in Berlin"
                className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div
                className={cn('text-xs', overCharLimit ? 'text-danger' : 'text-muted-foreground')}
              >
                {charCount.toLocaleString()} / {MAX_IMPORT_TEXT_CHARS.toLocaleString()}
              </div>
            </div>

            {fileError && (
              <p role="alert" className="text-xs text-danger">
                {fileError}
              </p>
            )}
            {previewError && (
              <p role="alert" className="text-xs text-danger">
                {previewError}
              </p>
            )}
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  ref={(node) => {
                    selectAllRef.current = node;
                    if (node) node.indeterminate = someSelected;
                  }}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label={selectionLabel}
                />
                {selectionLabel}
              </label>
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {selectedCount} of {totalPreviewItems} selected
              </span>
            </div>

            {preview.itemsTruncated && (
              <p className="text-xs text-muted-foreground">
                Only the first {MAX_IMPORT_ITEMS.toLocaleString()} memories are shown, out of{' '}
                {preview.totalCandidates.toLocaleString()} found.
              </p>
            )}

            <ul
              aria-label="Memories to import"
              className="flex max-h-72 flex-col gap-1.5 overflow-y-auto"
            >
              {preview.items.map((item, index) => (
                <li
                  key={item.normalizedKey + index}
                  className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={() => toggleItem(index)}
                    aria-label={`Import: ${item.content}`}
                    className="mt-0.5"
                  />
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="text-sm text-foreground">{item.content}</span>
                    {item.duplicate && (
                      <span className="w-fit rounded-compact bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        Already saved
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {commitError && (
              <p role="alert" className="text-xs text-danger">
                {commitError}
              </p>
            )}
          </div>
        )}

        {step === 'done' && commitResult && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground">{doneSummary}</p>
            {commitResult.skippedDuplicateCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {commitResult.skippedDuplicateCount} already matched a memory just imported from
                this source and were not duplicated.
              </p>
            )}
            {excludedSummary && <p className="text-xs text-muted-foreground">{excludedSummary}</p>}
            {blockedSummary && <p className="text-xs text-muted-foreground">{blockedSummary}</p>}
          </div>
        )}

        <DialogFooter>
          {step === 'compose' && (
            <>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handlePreview()}
                disabled={text.trim().length === 0 || overCharLimit || previewing}
                className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {previewing && <Spinner size="sm" />}
                Preview
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => setStep('compose')}
                disabled={committing}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleCommit()}
                disabled={selectedCount === 0 || committing}
                className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {committing && <Spinner size="sm" />}
                Import {selectedCount > 0 ? selectedCount : ''} selected
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Done
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
