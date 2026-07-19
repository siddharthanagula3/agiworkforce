/**
 * Shared composer send-dispatch contract for the chat screens (home tab + conversation).
 *
 * Both screens dispatch a typed send the identical way: resolve `true` the instant the
 * store commits the user message (`onAccepted`) so the composer clears its draft THEN —
 * not on tap and not only at stream end — falling back to the send's own accepted/blocked
 * return value; on rejection, surface the error (the composer keeps the draft because we
 * resolve `false`) and never fail silently. This is the one source of truth for that
 * contract so the two screens can't drift.
 *
 * NOTE: the voice/hands-free `awaitCompletion` path (which must resolve at STREAM
 * COMPLETION so the caller can read the full reply) stays inline in each screen — the two
 * deliberately differ in how a rejection there is routed, so unifying it would change a
 * screen's behavior. Only the shared, identical accept-race lives here.
 */
export function resolveOnAcceptedSend(
  send: (onAccepted: () => void) => Promise<boolean>,
  onError: (err: unknown) => void,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    send(() => resolve(true))
      .then((accepted) => resolve(accepted))
      .catch((err: unknown) => {
        onError(err);
        resolve(false);
      });
  });
}
