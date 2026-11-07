import { ManagedCloudAgentRunAbortError } from '@agiworkforce/cloud-contracts';

export type ScheduledTaskFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Private control flow: shared durable-follow retries must not retry authority failures. */
export class ScheduledTaskTransportControl extends ManagedCloudAgentRunAbortError {
  constructor(readonly original: unknown) {
    super();
  }
}

export interface ScheduledTaskTransport {
  fetch: ScheduledTaskFetch;
  beforeModelAccess: () => Promise<void>;
}

export function createScheduledTaskTransport(
  assertAuthority: () => Promise<void>,
  onRequestStarted: () => void,
  assertCurrent: () => void,
  fetchImpl: ScheduledTaskFetch = (input, init) => fetch(input, init),
): ScheduledTaskTransport {
  const authorize = async (): Promise<void> => {
    try {
      await assertAuthority();
    } catch (error) {
      throw error instanceof ScheduledTaskTransportControl
        ? error : new ScheduledTaskTransportControl(error);
    }
  };
  return {
    fetch: async (input, init) => {
      await authorize();
      try { assertCurrent(); } catch (error) { throw new ScheduledTaskTransportControl(error); }
      // Recheck a transport's own signal after the asynchronous authority read.
      init?.signal?.throwIfAborted();
      onRequestStarted();
      return fetchImpl(input, init);
    },
    beforeModelAccess: async () => {
      await authorize();
      try { assertCurrent(); } catch (error) { throw new ScheduledTaskTransportControl(error); }
      // The model-access helper issues its reads synchronously on entry.
      onRequestStarted();
    },
  };
}
