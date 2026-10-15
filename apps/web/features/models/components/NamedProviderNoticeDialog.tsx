'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { NamedProviderNotice } from '@agiworkforce/compliance';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui';

const SAVE_FAILED = 'Your choice could not be saved, so nothing was sent. Try again.';

export interface NamedProviderNoticeDialogProps {
  notice: NamedProviderNotice | null;
  alternativeName?: string | undefined;
  onAccept: () => Promise<void>;
  onUseAlternative?: (() => void) | undefined;
  onClose: () => void;
}

export function NamedProviderNoticeDialog({
  notice,
  alternativeName,
  onAccept,
  onUseAlternative,
  onClose,
}: NamedProviderNoticeDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openFor = notice?.version ?? null;

  useEffect(() => {
    setSaving(false);
    setError(null);
  }, [openFor]);

  if (!notice) return null;
  const [lead, ...statements] = notice.statements;

  async function accept() {
    setSaving(true);
    setError(null);
    try {
      await onAccept();
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg" data-testid="named-provider-notice">
        <DialogHeader>
          <DialogTitle>{notice.title}</DialogTitle>
          <DialogDescription>{lead}</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-2 ps-5 text-sm leading-relaxed text-foreground">
          {statements.map((statement) => (
            <li key={statement}>{statement}</li>
          ))}
        </ul>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {notice.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm text-[var(--chat-accent-primary-text)] underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
            >
              {link.label}
            </Link>
          ))}
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          {onUseAlternative && alternativeName ? (
            <Button variant="outline" disabled={saving} onClick={onUseAlternative}>
              {`Use ${alternativeName} instead`}
            </Button>
          ) : (
            <Button variant="outline" disabled={saving} onClick={onClose}>
              Not now
            </Button>
          )}
          <Button disabled={saving} onClick={() => void accept()}>
            {notice.acceptLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
