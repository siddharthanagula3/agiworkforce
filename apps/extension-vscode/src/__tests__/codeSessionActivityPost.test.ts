import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { LOCAL_CODE_SESSION_ACTIVITY_PATH } from '@agiworkforce/cloud-contracts';
import { postCodeSessionActivity } from '../features/remote-control/remoteControlService';
import * as api from '../utils/api';

const ACTIVITY = {
  event: 'approval_required' as const,
  rootId: 'root-1',
  threadId: 'thread-1',
  turnId: 'turn-1',
  approvalId: 'approval-1',
  sessionTitle: 'Fix the flaky test',
};

describe('local session activity from VS Code', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts the activity to the account with the editor session', async () => {
    vi.spyOn(api, 'getAccountToken').mockResolvedValue('editor-token');
    vi.spyOn(api, 'getCloudWebOrigin').mockReturnValue('https://agiworkforce.com');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

    await postCodeSessionActivity({} as vscode.SecretStorage, ACTIVITY);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`https://agiworkforce.com${LOCAL_CODE_SESSION_ACTIVITY_PATH}`);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer editor-token');
    expect(JSON.parse(String(init?.body))).toEqual(ACTIVITY);
  });

  it('sends nothing while the editor holds no account session', async () => {
    vi.spyOn(api, 'getAccountToken').mockResolvedValue(undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await postCodeSessionActivity({} as vscode.SecretStorage, ACTIVITY);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
