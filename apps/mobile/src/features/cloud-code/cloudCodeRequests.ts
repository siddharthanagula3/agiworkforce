import { useSyncExternalStore } from 'react';
import { createStore } from '@agiworkforce/client-runtime/state';
import {
  CLOUD_CODE_TURN_STILL_RUNNING_CODE,
  CloudCodeApiError,
} from '@agiworkforce/cloud-contracts';
import { subscribeCloudAccountEpochChange } from '@/src/features/auth/services/cloudAccountSession';

type CloudCodeRequest =
  | { kind: 'send'; goal: string; baseline: string | null }
  | { kind: 'approve' | 'reject'; approvalKey: string };

type PendingRequest = CloudCodeRequest & { controller: AbortController };
interface RefusedSend {
  goal: string;
  message: string;
}

interface CloudCodeRequests {
  pending: ReadonlyMap<string, PendingRequest>;
  refused: ReadonlyMap<string, RefusedSend>;
}

const emptyRequests: CloudCodeRequests = { pending: new Map(), refused: new Map() };
const requests = createStore(emptyRequests);

subscribeCloudAccountEpochChange(() => {
  const active = requests.getState().pending;
  requests.setState(() => emptyRequests);
  for (const request of active.values()) request.controller.abort();
});

export function useCloudCodeRequests() {
  return useSyncExternalStore(requests.subscribe, requests.getState);
}

export function isCloudCodeTurnStillRunning(error: unknown): boolean {
  return error instanceof CloudCodeApiError && error.code === CLOUD_CODE_TURN_STILL_RUNNING_CODE;
}

export function beginCloudCodeRequest(sessionId: string, input: CloudCodeRequest) {
  if (requests.getState().pending.has(sessionId)) return null;
  const request: PendingRequest = { ...input, controller: new AbortController() };
  requests.setState((current) => ({
    ...current,
    pending: new Map(current.pending).set(sessionId, request),
  }));
  return {
    request,
    signal: request.controller.signal,
    finish: (refused?: RefusedSend) => {
      requests.setState((current) => {
        if (current.pending.get(sessionId) !== request) return current;
        const pending = new Map(current.pending);
        pending.delete(sessionId);
        return {
          pending,
          refused: refused ? new Map(current.refused).set(sessionId, refused) : current.refused,
        };
      });
    },
  };
}

export function takeRefusedCloudCodeSend(sessionId: string): RefusedSend | undefined {
  const entry = requests.getState().refused.get(sessionId);
  if (entry) {
    requests.setState((current) => {
      const refused = new Map(current.refused);
      refused.delete(sessionId);
      return { ...current, refused };
    });
  }
  return entry;
}
