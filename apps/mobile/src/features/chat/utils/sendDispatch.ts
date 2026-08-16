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
