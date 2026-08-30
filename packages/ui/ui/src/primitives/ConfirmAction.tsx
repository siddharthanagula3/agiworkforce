'use client';

import * as React from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './AlertDialog';
import { cn } from '../cn';

export interface ConfirmActionRequest {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => unknown | Promise<unknown>;
}

interface PendingConfirm extends ConfirmActionRequest {
  key: number;
}

/**
 * One confirmation surface for irreversible actions. Before this, ten
 * destructive controls across settings, workspace and chat fired their
 * mutation straight from onClick, so a single mis-click revoked access,
 * unlinked a device or deleted a file with no way back.
 */
export function useConfirmAction(): {
  confirm: (request: ConfirmActionRequest) => void;
  dialog: React.ReactElement | null;
} {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);
  const [busy, setBusy] = React.useState(false);
  const nextKey = React.useRef(0);

  const confirm = React.useCallback((request: ConfirmActionRequest) => {
    nextKey.current += 1;
    setPending({ ...request, key: nextKey.current });
  }, []);

  const close = React.useCallback(() => {
    setPending(null);
    setBusy(false);
  }, []);

  const run = React.useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.onConfirm();
    } finally {
      close();
    }
  }, [pending, close]);

  const dialog = pending ? (
    <AlertDialog
      key={pending.key}
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending.title}</AlertDialogTitle>
          <AlertDialogDescription>{pending.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{pending.cancelLabel ?? 'Cancel'}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void run();
            }}
            className={cn(
              pending.destructive !== false &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90',
            )}
          >
            {busy ? 'Working…' : (pending.confirmLabel ?? 'Confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return { confirm, dialog };
}
