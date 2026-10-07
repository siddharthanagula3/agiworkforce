'use client';

import { useEffect, useRef, useState } from 'react';
import type { LifecycleStatus } from '@agiworkforce/types';
import { Button } from '@agiworkforce/ui';
import { Check, Copy } from 'lucide-react';

const CONFIRMATION_MS = 2000;

type CopyStatus = Extract<LifecycleStatus, 'idle' | 'pending' | 'failed'> | 'copied';

export function CopyTextButton({
  text,
  label,
  copiedLabel,
}: {
  text: string;
  label: string;
  copiedLabel: string;
}) {
  const [copyState, setCopyState] = useState<{ status: CopyStatus; text: string | null }>({
    status: 'idle',
    text: null,
  });
  const mounted = useRef(true);
  const pending = useRef(false);
  const status =
    copyState.status === 'pending' || copyState.text === text ? copyState.status : 'idle';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (copyState.status !== 'copied') return;
    const timer = window.setTimeout(() => {
      if (mounted.current) setCopyState({ status: 'idle', text: null });
    }, CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copy() {
    if (pending.current) return;
    pending.current = true;
    setCopyState({ status: 'pending', text });
    try {
      await navigator.clipboard.writeText(text);
      if (mounted.current) setCopyState({ status: 'copied', text });
    } catch {
      if (mounted.current) setCopyState({ status: 'failed', text });
    } finally {
      pending.current = false;
    }
  }

  const announcement =
    status === 'copied'
      ? copiedLabel
      : status === 'failed'
        ? 'Copy failed. Try again.'
        : status === 'pending'
          ? 'Copying to clipboard.'
          : '';

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="dx-action"
        onClick={copy}
        aria-disabled={status === 'pending' || undefined}
        aria-busy={status === 'pending' || undefined}
      >
        {status === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span>
          {status === 'copied'
            ? 'Copied'
            : status === 'failed'
              ? 'Copy failed'
              : status === 'pending'
                ? 'Copying…'
                : label}
        </span>
      </Button>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </>
  );
}

export function CopyPageButton({ markdown }: { markdown: string }) {
  return <CopyTextButton text={markdown} label="Copy page" copiedLabel="Page copied" />;
}
