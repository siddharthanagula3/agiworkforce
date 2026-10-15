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

  return {
    onEvent: { addListener: (listener: EventListener) => listeners.add(listener) },
    reset() {
      frame.loaderId = 'fixture-loader';
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
      } else if (method === 'Runtime.enable') {
        callback({});
      } else if (method === 'Page.createIsolatedWorld') {
        const contextId = ++contextSequence;
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
