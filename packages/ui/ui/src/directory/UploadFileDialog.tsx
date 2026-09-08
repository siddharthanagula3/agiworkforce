'use client';

import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { cn } from '../cn';
import { toUserMessage } from '../lib/network-error';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../primitives/Dialog';
import { Spinner } from '../primitives/Spinner';
import {
  UPLOAD_BUSY_LABEL,
  UPLOAD_CANCEL_LABEL,
  UPLOAD_CHOOSE_FILE_LABEL,
  UPLOAD_DONE_LABEL,
  UPLOAD_NO_FILE_LABEL,
  UPLOAD_SUBMIT_LABEL,
} from './constants';
import { DIRECTORY_CREATE_BUTTON, DIRECTORY_FOCUS_RING } from './styles';
import type { DirectoryUploadResult } from './types';

export function UploadFileDialog({
  open,
  title,
  description,
  accept,
  failureCopy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  accept: string;
  failureCopy: string;
  onClose: () => void;
  onSubmit: (file: File) => Promise<DirectoryUploadResult>;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DirectoryUploadResult | null>(null);

  const close = () => {
    setFile(null);
    setBusy(false);
    setError(null);
    setResult(null);
    if (input.current) input.current.value = '';
    onClose();
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await onSubmit(file));
    } catch (caught) {
      setError(toUserMessage(caught, failureCopy));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) close();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{result ? result.title : title}</DialogTitle>
          <DialogDescription>{result ? '' : description}</DialogDescription>
        </DialogHeader>

        {result ? (
          <ul className="flex flex-col gap-1 text-sm text-foreground">
            {result.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              ref={input}
              type="file"
              accept={accept}
              aria-label={UPLOAD_CHOOSE_FILE_LABEL}
              onChange={(event) => {
                setError(null);
                setFile(event.target.files?.[0] ?? null);
              }}
              className={cn(
                'block w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground',
                'file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:text-foreground',
                DIRECTORY_FOCUS_RING,
              )}
            />
            <p className="text-xs text-muted-foreground">
              {file ? file.name : UPLOAD_NO_FILE_LABEL}
            </p>
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-danger"
              >
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <button type="button" onClick={close} className={DIRECTORY_CREATE_BUTTON}>
              {UPLOAD_DONE_LABEL}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className={cn(
                  'inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-sm text-foreground disabled:opacity-60',
                  DIRECTORY_FOCUS_RING,
                )}
              >
                {UPLOAD_CANCEL_LABEL}
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !file}
                className={cn(DIRECTORY_CREATE_BUTTON, 'gap-2 disabled:opacity-60')}
              >
                {busy ? (
                  <Spinner aria-label={UPLOAD_BUSY_LABEL} className="size-4" />
                ) : (
                  <Upload aria-hidden className="size-4" />
                )}
                {busy ? UPLOAD_BUSY_LABEL : UPLOAD_SUBMIT_LABEL}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
