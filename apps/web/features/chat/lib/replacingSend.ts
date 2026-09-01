export interface ReplacingSendPorts<M> {
  snapshot: () => M[];
  removeLocal: (id: string) => void;
  restore: (messages: M[]) => void;
  deleteServer: (ids: string[]) => void;
}

export async function runReplacingSend<M>(
  ports: ReplacingSendPorts<M>,
  rollbackIds: string[],
  send: () => Promise<boolean>,
): Promise<boolean> {
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
  return committed;
}
