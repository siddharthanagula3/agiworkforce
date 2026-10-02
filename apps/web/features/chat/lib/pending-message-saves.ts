const pendingSaves = new Map<string, Promise<string>>();

export function trackMessageSave(messageId: string, save: Promise<{ id: string } | null>): void {
  const settled = save.then(
    (saved) => saved?.id ?? messageId,
    () => messageId,
  );
  pendingSaves.set(messageId, settled);
  void settled.then(() => {
    if (pendingSaves.get(messageId) === settled) pendingSaves.delete(messageId);
  });
}

export function savedMessageId(messageId: string): Promise<string> {
  return pendingSaves.get(messageId) ?? Promise.resolve(messageId);
}
