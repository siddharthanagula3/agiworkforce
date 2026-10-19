type EventListener = (
  source: { tabId: number },
  method: string,
  params: Record<string, unknown>,
) => void;

export function createCdpInspectionFixture(url: string) {
  const listeners = new Set<EventListener>();
  const frame = { id: 'fixture-frame', loaderId: 'fixture-loader', url };
  let contextSequence = 0;
  let uniqueContextId = '';
  let defaultContext = false;
  let navigateDuringCreation = false;
  const worlds = new Map<string, number>();
  let runtimeEnabled = false;

  return {
    onEvent: { addListener: (listener: EventListener) => listeners.add(listener) },
    reset() {
      frame.loaderId = 'fixture-loader';
      frame.url = url;
      worlds.clear();
      runtimeEnabled = false;
      uniqueContextId = '';
      defaultContext = false;
      navigateDuringCreation = false;
    },
    setDefaultContext(value: boolean) {
      defaultContext = value;
    },
    setNavigateDuringCreation(value: boolean) {
      navigateDuringCreation = value;
    },
    abandonCaptureInThisSession(worldName: string) {
      const contextId = ++contextSequence;
      worlds.set(`${frame.loaderId}:${worldName}`, contextId);
      uniqueContextId = `fixture-context-${contextId}`;
      runtimeEnabled = true;
    },
    get uniqueContextId() {
      return uniqueContextId;
    },
    reply(
      target: { tabId: number },
      method: string,
      params: Record<string, unknown>,
      callback: (result: unknown) => void,
    ): boolean {
      if (method === 'Page.getFrameTree') {
        callback({ frameTree: { frame: { ...frame } } });
      } else if (method === 'Runtime.disable') {
        runtimeEnabled = false;
        callback({});
      } else if (method === 'Runtime.enable') {
        // Enabling the runtime reports every context the document already has,
        // and only the first time: a second enable in the same session is silent.
        if (runtimeEnabled) {
          callback({});
          return true;
        }
        runtimeEnabled = true;
        for (const [worldKey, contextId] of worlds) {
          const [loaderId, worldName] = worldKey.split(':');
          if (loaderId !== frame.loaderId) continue;
          for (const listener of listeners)
            listener(target, 'Runtime.executionContextCreated', {
              context: {
                id: contextId,
                uniqueId: `fixture-context-${contextId}`,
                name: worldName,
                auxData: { frameId: frame.id, isDefault: defaultContext },
              },
            });
        }
        callback({});
      } else if (method === 'Page.createIsolatedWorld') {
        // Chrome hands back the world a document already has and reports it
        // only the first time it is created.
        const worldKey = `${frame.loaderId}:${String(params['worldName'])}`;
        const existing = worlds.get(worldKey);
        if (existing !== undefined) {
          callback({ executionContextId: existing });
          return true;
        }
        const contextId = ++contextSequence;
        worlds.set(worldKey, contextId);
        uniqueContextId = `fixture-context-${contextId}`;
        for (const listener of listeners)
          listener(target, 'Runtime.executionContextCreated', {
            context: {
              id: contextId,
              uniqueId: uniqueContextId,
              name: params['worldName'],
              auxData: { frameId: params['frameId'], isDefault: defaultContext },
            },
          });
        if (navigateDuringCreation) frame.loaderId = 'fixture-navigated-loader';
        callback({ executionContextId: contextId });
      } else return false;
      return true;
    },
  };
}
