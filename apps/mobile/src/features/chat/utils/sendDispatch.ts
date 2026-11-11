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

export async function dispatchHandedOffSend(
  text: string,
  send: (text: string) => boolean | Promise<boolean>,
  restore: (text: string) => void,
): Promise<void> {
  try {
    if ((await send(text)) === false) restore(text);
  } catch {
    restore(text);
  }
}
