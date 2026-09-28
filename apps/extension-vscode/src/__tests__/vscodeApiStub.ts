export function vscodeApiStub<T extends { postMessage: (message: unknown) => unknown }>(
  api: T,
): T & { getState: () => unknown; setState: (next: unknown) => unknown } {
  let state: unknown;
  return {
    ...api,
    getState: () => state,
    setState: (next: unknown) => {
      state = next;
      return next;
    },
  };
}
