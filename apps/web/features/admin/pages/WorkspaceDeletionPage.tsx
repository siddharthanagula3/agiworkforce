'use client';

import { useCallback, useEffect, useState } from 'react';
import { useConfirmAction } from '@agiworkforce/ui';
import { getCsrfToken } from '@/lib/client/csrf';

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  currentUserRole: string;
}

interface DeletionStatus {
  pending: boolean;
  requestedAt: string | null;
  scheduledFor: string | null;
  canCancel: boolean;
}

const NO_PENDING_DELETION: DeletionStatus = {
  pending: false,
  requestedAt: null,
  scheduledFor: null,
  canCancel: false,
};

function formatTimestamp(value: string | null): string {
  if (!value) return 'an unknown date';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'an unknown date' : parsed.toLocaleString();
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } | string };
    if (typeof body.error === 'string') return body.error;
    if (body.error?.message) return body.error.message;
  } catch {
    // fall through to the status line
  }
  return `Request failed (${response.status})`;
}

/**
 * The confirmation names the three things "are you sure" leaves out: what
 * stops working, who loses it, and whether it can be taken back. The member
 * count is read from the workspace rather than written into the sentence,
 * because "everyone" reads very differently to an owner with 40 colleagues.
 */
function deletionConsequence(workspace: WorkspaceSummary): string {
  const others = Math.max(workspace.memberCount - 1, 0);
  const whoLosesAccess =
    others === 0
      ? 'You are the only member, so you are the only one who loses it.'
      : `All ${workspace.memberCount} members lose it, not only you: ${others} ${others === 1 ? 'colleague' : 'colleagues'} will be signed out of this workspace.`;
  return (
    `Every chat, project, file, connector and API key in ${workspace.name} is scheduled for ` +
    `permanent erasure. The audit trail is kept without its link to the workspace. ` +
    `${whoLosesAccess} Nothing is deleted today: you can ` +
    'cancel from this page until the scheduled date, and after it nobody can restore any of it.'
  );
}

export default function WorkspaceDeletionPage() {
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [deletion, setDeletion] = useState<DeletionStatus>(NO_PENDING_DELETION);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/organization', { credentials: 'include' });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const body = (await response.json()) as {
        organization?: WorkspaceSummary | null;
        deletion?: DeletionStatus;
      };
      setWorkspace(body.organization ?? null);
      setDeletion(body.deletion ?? NO_PENDING_DELETION);
    } catch {
      setError('Could not reach the workspace settings API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const scheduleDeletion = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch('/api/settings/organization', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ confirm: typedConfirmation.trim() }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const body = (await response.json()) as { message?: string };
      setNotice(body.message ?? 'Workspace deletion scheduled.');
      setTypedConfirmation('');
      await load();
    } catch {
      setError('Could not reach the workspace settings API. Nothing was scheduled.');
    } finally {
      setBusy(false);
    }
  }, [load, typedConfirmation]);

  const cancelDeletion = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch('/api/settings/organization/deletion/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const body = (await response.json()) as { message?: string };
      setNotice(body.message ?? 'Workspace deletion cancelled.');
      await load();
    } catch {
      setError('Could not reach the workspace settings API. The deletion is still scheduled.');
    } finally {
      setBusy(false);
    }
  }, [load]);

  const isOwner = workspace?.currentUserRole === 'owner';
  // The server takes the name or the slug; accepting only one of them here
  // would refuse a phrase it would have honoured.
  const confirmationMatches =
    workspace !== null &&
    (typedConfirmation.trim() === workspace.name || typedConfirmation.trim() === workspace.slug);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {confirmDialog}
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <header>
          <h1 className="text-2xl font-medium text-foreground">Delete this workspace</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Deleting a workspace erases everything inside it for every member. It is deliberately
            slow: you type the workspace name to schedule it, and it stays cancellable here until
            the scheduled date passes.
          </p>
        </header>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-danger-text"
          >
            {error}
          </p>
        ) : null}

        {notice ? (
          <p role="status" className="rounded-md border border-border bg-card p-3 text-sm">
            {notice}
          </p>
        ) : null}

        {loading ? <p className="text-sm text-muted-foreground">Loading this workspace…</p> : null}

        {!loading && !workspace ? (
          <p className="text-sm text-muted-foreground">
            You are not in a workspace. Select one from the account menu first.
          </p>
        ) : null}

        {workspace ? (
          <section className="rounded-md border border-border bg-card p-5">
            <h2 className="text-base font-medium text-foreground">{workspace.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {workspace.slug} · {workspace.memberCount}{' '}
              {workspace.memberCount === 1 ? 'member' : 'members'}
            </p>

            {deletion.pending ? (
              <div className="mt-5 flex flex-col gap-3">
                <p className="text-sm text-foreground">
                  Deletion is scheduled for {formatTimestamp(deletion.scheduledFor)}.{' '}
                  {deletion.canCancel
                    ? 'Cancel before then and nothing is lost.'
                    : 'The cancellation window has closed and erasure is underway.'}
                </p>
                {deletion.canCancel ? (
                  <button
                    type="button"
                    disabled={busy || !isOwner}
                    onClick={() => void cancelDeletion()}
                    className="self-start rounded border border-border px-3 py-2 text-sm text-foreground disabled:opacity-50"
                  >
                    Cancel deletion and keep this workspace
                  </button>
                ) : null}
              </div>
            ) : (
              <form
                className="mt-5 flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  confirm({
                    title: `Schedule ${workspace.name} for deletion?`,
                    description: deletionConsequence(workspace),
                    confirmLabel: 'Schedule deletion',
                    onConfirm: () => scheduleDeletion(),
                  });
                }}
              >
                <label
                  htmlFor="workspace-deletion-confirmation"
                  className="text-sm text-foreground"
                >
                  Type <span className="font-medium">{workspace.name}</span> to continue
                </label>
                <input
                  id="workspace-deletion-confirmation"
                  value={typedConfirmation}
                  onChange={(event) => setTypedConfirmation(event.target.value)}
                  autoComplete="off"
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || !confirmationMatches || !isOwner}
                  className="self-start rounded border border-destructive/50 px-3 py-2 text-sm text-danger-text disabled:opacity-50"
                >
                  Schedule deletion
                </button>
                {!isOwner ? (
                  <p className="text-sm text-muted-foreground">
                    Only the workspace owner can delete it. Ask them, or transfer ownership first.
                  </p>
                ) : null}
              </form>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
