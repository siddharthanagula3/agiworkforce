import { afterEach, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { browseAccountMarketplace } from '../features/surfaces/accountMarketplace';
import { getAccountToken } from '../utils/api';

type ApiModule = typeof import('../utils/api');
vi.mock('../utils/api', async (importOriginal) => ({
  ...(await importOriginal<ApiModule>()),
  getAccountToken: vi.fn(),
  getCloudWebOrigin: () => 'https://agiworkforce.com',
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('stops an account install when the credential changes during review', async () => {
  const entryId = '48068131-f259-43de-91b2-4328d70e10ee';
  const sourceId = '551d8825-72e4-4d9c-bdb0-c599d4c6b71a';
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith('/entries')) {
      return Response.json({
        entries: [
          {
            id: entryId,
            sourceId,
            name: 'Release helper',
            description: 'Review checklists',
            version: '1.0.0',
            permissions: ['Read release checklists'],
            requiredConnectors: [],
            declaredSkills: [],
            agents: [],
          },
        ],
      });
    }
    if (url.endsWith('/marketplaces')) {
      return Response.json({
        sources: [
          {
            id: sourceId,
            name: 'Fixture marketplace',
            repositoryUrl: null,
            ref: null,
            status: 'active',
            lastError: null,
            entryCount: 1,
          },
        ],
      });
    }
    return Response.json({ installations: [] });
  });
  vi.stubGlobal('fetch', fetch);
  vi.mocked(getAccountToken)
    .mockResolvedValueOnce('account-before')
    .mockResolvedValueOnce('account-after');
  vi.mocked(vscode.window.showQuickPick).mockImplementationOnce(
    (async (entries: vscode.QuickPickItem[]) => entries[0]) as never,
  );
  vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce(
    'Install in AGI Cloud' as never,
  );

  await browseAccountMarketplace({} as vscode.SecretStorage);

  expect(fetch).toHaveBeenCalledTimes(3);
  expect(vscode.window.showWarningMessage).toHaveBeenLastCalledWith(
    'Your AGI Cloud session changed. Reopen the marketplace before making changes.',
  );
});
