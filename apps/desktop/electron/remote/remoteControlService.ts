import { app } from 'electron';
import {
  IDLE_REMOTE_CONTROL_STATE,
  type DeveloperSessionEvent,
  type RemoteControlState,
} from '@agiworkforce/local-runtime-contract';
import { CLOUD_APP_ORIGIN } from '../config';
import { deviceIdentity } from '../runtime/deviceIdentity';
import {
  answerDeveloperApproval,
  interruptDeveloperTurn,
  listDeveloperSessions,
  readDeveloperSessionActivity,
  startDeveloperTurn,
} from '../runtime/developerSessionService';
import { readWorkingTreeDiff } from '../runtime/gitService';
import { getRoot } from '../runtime/workspaceStore';
import { createRemoteControlHost, type RemoteControlHost } from './remoteControlHost';

type WebSocketWithHeaders = new (
  url: string,
  init: { headers: Record<string, string> },
) => WebSocket;

let host: RemoteControlHost | null = null;

function createSocket(wsUrl: string): WebSocket {
  const Socket = globalThis.WebSocket as unknown as WebSocketWithHeaders;
  return new Socket(wsUrl, { headers: { Origin: CLOUD_APP_ORIGIN } });
}

export function configureRemoteControl(emit: (state: RemoteControlState) => void): void {
  host?.stop();
  host = createRemoteControlHost({
    code: {
      listSessions: listDeveloperSessions,
      readActivity: readDeveloperSessionActivity,
      startTurn: startDeveloperTurn,
      interruptTurn: interruptDeveloperTurn,
      answerApproval: answerDeveloperApproval,
      readDiff: async (rootId, paths) => {
        const root = getRoot(rootId);
        return root ? readWorkingTreeDiff(root.path, paths) : null;
      },
    },
    deviceName: () => deviceIdentity().deviceName,
    appVersion: () => app.getVersion(),
    createSocket,
    onStateChanged: emit,
  });
}

export function remoteControlAvailable(): boolean {
  return host !== null && typeof globalThis.WebSocket === 'function';
}

export function remoteControlState(): RemoteControlState {
  return host?.state() ?? { ...IDLE_REMOTE_CONTROL_STATE };
}

export function startRemoteControl(args: Record<string, unknown>): RemoteControlState {
  if (!host)
    return { ...IDLE_REMOTE_CONTROL_STATE, status: 'error', error: 'Remote Control is not ready.' };
  return host.start(args);
}

export function stopRemoteControl(): RemoteControlState {
  return host?.stop() ?? { ...IDLE_REMOTE_CONTROL_STATE };
}

export function relayDeveloperSessionEvent(rootId: string, event: DeveloperSessionEvent): void {
  host?.handleSessionEvent(rootId, event);
}
