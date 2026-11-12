import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { IDLE_REMOTE_CONTROL_STATE } from '@agiworkforce/local-runtime-contract';
import {
  VscodeRemoteControl,
  pairingRefusalMessage,
} from '../features/remote-control/remoteControlService';
import type { LocalRuntimePool } from '../integrations/localRuntimePool';
import * as api from '../utils/api';

const hostStart = vi.hoisted(() => vi.fn());
const hostStop = vi.hoisted(() => vi.fn());

type RemoteControlModule = typeof import('@agiworkforce/utils/remote-control');

vi.mock('@agiworkforce/utils/remote-control', async (importOriginal) => ({
  ...(await importOriginal<RemoteControlModule>()),
  createRemoteControlHost: () => ({
    start: hostStart,
    stop: hostStop,
    handleSessionEvent: vi.fn(),
  }),
}));

const PAIRING = {
  code: 'ABC123',
  expiresAt: Date.now() + 60_000,
  signaling: { wsUrl: 'wss://relay.example/ws' },
  pairTokens: { desktop: 'desktop-token' },
};

function deferredResponse(): {
  response: Promise<Response>;
  resolve: (body: unknown, status?: number) => void;
} {
  let resolve!: (body: unknown, status?: number) => void;
  const response = new Promise<Response>((done) => {
    resolve = (body, status = 200) => done(new Response(JSON.stringify(body), { status }));
  });
  return { response, resolve };
}

function createService(): VscodeRemoteControl {
  const context = {
    secrets: {},
    extensionMode: vscode.ExtensionMode.Production,
  } as unknown as vscode.ExtensionContext;
  const runtimes = {
    forWorkspace: () => ({
      onNotification: () => ({ dispose: () => undefined }),
      onEvent: () => ({ dispose: () => undefined }),
    }),
  } as unknown as LocalRuntimePool;
  return new VscodeRemoteControl(context, runtimes);
}

describe('Remote Control pairing start ownership', () => {
  beforeEach(() => {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
      { uri: vscode.Uri.file('/repo'), name: 'repo', index: 0 },
    ];
    hostStart.mockReset().mockReturnValue({ ...IDLE_REMOTE_CONTROL_STATE, status: 'waiting' });
    hostStop.mockReset().mockReturnValue({ ...IDLE_REMOTE_CONTROL_STATE });
    vi.spyOn(api, 'getAccountToken').mockResolvedValue('account-token');
    vi.spyOn(api, 'getCloudWebOrigin').mockReturnValue('https://agiworkforce.example');
  });

  afterEach(() => {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
    vi.restoreAllMocks();
  });

  it('does not start a pairing when Stop ran while the initiation was pending', async () => {
    const pending = deferredResponse();
    vi.spyOn(globalThis, 'fetch').mockReturnValue(pending.response);
    const service = createService();

    const starting = service.start();
    service.stop();
    pending.resolve(PAIRING);
    await starting;

    expect(hostStart).not.toHaveBeenCalled();
  });

  it('does not start a pairing when the service was disposed while pending', async () => {
    const pending = deferredResponse();
    vi.spyOn(globalThis, 'fetch').mockReturnValue(pending.response);
    const service = createService();

    const starting = service.start();
    service.dispose();
    pending.resolve(PAIRING);
    await starting;

    expect(hostStart).not.toHaveBeenCalled();
  });

  it('keeps a refused initiation quiet after Stop', async () => {
    const pending = deferredResponse();
    vi.spyOn(globalThis, 'fetch').mockReturnValue(pending.response);
    const service = createService();

    const starting = service.start();
    service.stop();
    pending.resolve({ error: 'rate limited' }, 429);

    await expect(starting).resolves.toBeDefined();
    expect(hostStart).not.toHaveBeenCalled();
  });

  it('reports a workspace policy refusal in the server wording and keeps the session', async () => {
    const secretsRead = vi.spyOn(api, 'getAccountToken');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            type: 'organization_policy',
            code: 'feature_disabled',
            message: 'Your workspace turned off remote control.',
          },
        }),
        { status: 403 },
      ),
    );

    await expect(createService().start()).rejects.toThrow(
      'Your workspace turned off remote control.',
    );

    expect(secretsRead).toHaveBeenCalledTimes(1);
    expect(hostStart).not.toHaveBeenCalled();
  });

  it('lets the newest of two pending starts win', async () => {
    const first = deferredResponse();
    const second = deferredResponse();
    vi.spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(first.response)
      .mockReturnValueOnce(second.response);
    const service = createService();

    const firstStart = service.start();
    const secondStart = service.start();
    first.resolve(PAIRING);
    await firstStart;
    expect(hostStart).not.toHaveBeenCalled();

    second.resolve(PAIRING);
    await secondStart;
    expect(hostStart).toHaveBeenCalledOnce();
  });

  it('starts a fresh pairing after a Stop', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValue(new Response(JSON.stringify(PAIRING)));
    const service = createService();

    service.stop();
    await service.start();

    expect(hostStart).toHaveBeenCalledOnce();
    expect(hostStart).toHaveBeenCalledWith({
      code: PAIRING.code,
      wsUrl: PAIRING.signaling.wsUrl,
      pairToken: PAIRING.pairTokens.desktop,
      expiresAt: PAIRING.expiresAt,
    });
  });
});

describe('Remote Control pairing refusal wording', () => {
  it('reads a plain refusal and a refusal in the error model', () => {
    expect(pairingRefusalMessage({ error: 'Authentication required' })).toBe(
      'Authentication required',
    );
    expect(
      pairingRefusalMessage({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
      }),
    ).toBe('Service temporarily unavailable');
    expect(
      pairingRefusalMessage({
        error: { type: 'organization_policy', code: 'feature_disabled', message: 'Blocked here.' },
      }),
    ).toBe('Blocked here.');
  });

  it('has no wording for a body that is not a refusal', () => {
    expect(pairingRefusalMessage(null)).toBeUndefined();
    expect(pairingRefusalMessage({ error: { code: 'X' } })).toBeUndefined();
    expect(pairingRefusalMessage({ code: 'ABC123' })).toBeUndefined();
  });
});
