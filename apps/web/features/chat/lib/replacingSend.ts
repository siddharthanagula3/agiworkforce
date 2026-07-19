/**
 * Data-loss-safe "replace a turn and re-send" orchestration, shared by the edit-resubmit
 * and regenerate paths (WEBUI-REGEN-DELETE-BEFORE-RESEND).
 *
 * The bug both paths had: they deleted the rolled-back turn (server + local rows) BEFORE
 * the replacement send committed, so a send that bailed pre-commit (expired token, no
 * conversation) destroyed the original exchange with no recovery.
 *
 * The invariant this enforces: the server rows are the durable copy, so they are deleted
 * ONLY after the replacement turn has committed. The local transcript is removed up-front
 * for a clean UI (no duplicate flash while the replacement streams) and restored verbatim
 * if the send never commits. Worst case therefore degrades from permanent data loss to an
 * at-most-duplicate-row-on-reload, which the post-commit server delete then reconciles.
 *
 * Pure and dependency-injected (no store/React imports) so the ordering guarantees are
 * unit-testable in isolation.
 */

export interface ReplacingSendPorts<M> {
  /** Full current transcript, captured before removal for verbatim restore-on-failure. */
  snapshot: () => M[];
  /** Remove one message from the LOCAL transcript only (no server call). */
  removeLocal: (id: string) => void;
  /** Restore the transcript to a prior snapshot (used only when the send never commits). */
  restore: (messages: M[]) => void;
  /** Delete the given messages' durable SERVER rows (fire-and-forget, best-effort). */
  deleteServer: (ids: string[]) => void;
}

/**
 * Remove `rollbackIds` from the local transcript, run `send`, then — only if `send`
 * reports it committed the replacement turn — delete the old rows' server copy. If the
 * send did not commit (or threw), restore the exact pre-removal transcript so nothing is
 * lost. Never deletes a server row before the replacement is safe.
 */
export async function runReplacingSend<M>(
  ports: ReplacingSendPorts<M>,
  rollbackIds: string[],
  send: () => Promise<boolean>,
): Promise<void> {
  const snapshot = ports.snapshot();
  for (const id of rollbackIds) ports.removeLocal(id);
  let committed = false;
  try {
    committed = await send();
  } finally {
    if (committed) {
      ports.deleteServer(rollbackIds);
    } else {
      ports.restore(snapshot);
    }
  }
}
