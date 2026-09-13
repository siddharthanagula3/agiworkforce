'use client';

import { useCallback, useEffect, useState } from 'react';
import { DesktopRuntimeError, type WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { useDesktopHost } from '../lib/host';
import {
  listWorkspaceRoots,
  pickWorkspaceRoot,
  revealWorkspaceRoot,
  revokeWorkspaceRoot,
} from '../lib/runtime-client';

const HEADING = 'Local folders';
const INTRO =
  'Folders on this Mac that AGI Cloud may open. Files you attach from one are uploaded to your account the same way any attachment is.';
const EMPTY_COPY =
  'No folders approved yet. Add one to attach its files without leaving the app, and to let AGI read it when you ask.';
const LOAD_FAILED = 'Approved folders could not be read.';
const ADD_FAILED = 'That folder was not approved.';
const REVOKE_FAILED = 'That folder was not removed.';
const ADD_LABEL = 'Add a folder';
const ADD_BUSY_LABEL = 'Choosing…';

const BUTTON_CLASS =
  'min-h-[32px] rounded-md border border-border/60 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60';

function messageFor(error: unknown, fallback: string): string | null {
  if (error instanceof DesktopRuntimeError) {
    return error.code === 'cancelled' ? null : `${fallback} ${error.message}`;
  }
  return fallback;
}

export function LocalFoldersSection() {
  const host = useDesktopHost();
  const [roots, setRoots] = useState<WorkspaceRoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const refresh = useCallback(async () => {
    try {
      setRoots(await listWorkspaceRoots());
      setError(null);
    } catch (cause) {
      setError(messageFor(cause, LOAD_FAILED));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!host) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [host, refresh]);

  const onAdd = useCallback(async () => {
    setBusy(true);
    try {
      await pickWorkspaceRoot();
      setError(null);
      await refresh();
    } catch (cause) {
      setError(messageFor(cause, ADD_FAILED));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const onRevoke = useCallback(
    (root: WorkspaceRoot) => {
      confirm({
        title: `Remove access to ${root.name}?`,
        description: `AGI stops being able to read or write anything under ${root.path}, and the folder leaves the composer's attach menu. Nothing on disk changes, and you can approve the folder again whenever you want.`,
        confirmLabel: 'Remove access',
        destructive: true,
        onConfirm: async () => {
          try {
            await revokeWorkspaceRoot(root.id);
            setError(null);
            await refresh();
          } catch (cause) {
            setError(messageFor(cause, REVOKE_FAILED));
          }
        },
      });
    },
    [confirm, refresh],
  );

  if (!host) return null;

  return (
    <section className="flex flex-col gap-4">
      {confirmDialog}
      <div>
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {HEADING}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{INTRO}</p>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {loading ? (
        <Spinner aria-label="Loading approved folders" />
      ) : roots.length === 0 ? (
        <p className="text-xs text-muted-foreground">{EMPTY_COPY}</p>
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          {roots.map((root) => (
            <li
              key={root.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border/40 p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{root.name}</p>
                <p className="break-words text-xs text-muted-foreground">{root.path}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  onClick={() => void revealWorkspaceRoot(root.id)}
                >
                  Reveal
                </button>
                <button type="button" className={BUTTON_CLASS} onClick={() => onRevoke(root)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={() => void onAdd()}>
          {busy ? ADD_BUSY_LABEL : ADD_LABEL}
        </button>
      </div>
    </section>
  );
}
