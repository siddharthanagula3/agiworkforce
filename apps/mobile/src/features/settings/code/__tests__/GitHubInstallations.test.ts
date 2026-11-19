const mockGet = jest.fn();
const mockApiFetch = jest.fn();

jest.mock('@/lib/constants', () => ({ API_URL: 'https://agiworkforce.com' }));
jest.mock('expo-web-browser', () => ({}));
jest.mock('@/services/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args), post: jest.fn() },
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import {
  disconnectGitHubInstallation,
  fetchGitHubInstallations,
} from '@/src/features/cloud-code/githubInstall';

describe('linked GitHub accounts', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockApiFetch.mockReset();
  });

  it('reads the linked accounts and ignores the columns the phone does not use', async () => {
    mockGet.mockResolvedValue({
      installations: [
        {
          id: 'row-1',
          installation_id: 11,
          account_login: 'acme-inc',
          account_type: 'Organization',
          pr_review_enabled: false,
          created_at: '2026-11-01T00:00:00Z',
        },
      ],
    });

    await expect(fetchGitHubInstallations()).resolves.toEqual([
      { installation_id: 11, account_login: 'acme-inc', account_type: 'Organization' },
    ]);
    expect(mockGet).toHaveBeenCalledWith('/api/github/installations', undefined);
  });

  it('rejects an answer that is not a list of accounts', async () => {
    mockGet.mockResolvedValue({ installations: [{ account_login: 'acme-inc' }] });

    await expect(fetchGitHubInstallations()).rejects.toThrow();
  });

  it('removes an account with the installation id in the body', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await disconnectGitHubInstallation(11);

    expect(mockApiFetch).toHaveBeenCalledWith('/api/github/installations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId: 11 }),
    });
  });

  it('throws the server message when GitHub still holds the installation', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'The GitHub App is still installed on your account.' }),
        {
          status: 502,
        },
      ),
    );

    await expect(disconnectGitHubInstallation(11)).rejects.toThrow(
      'The GitHub App is still installed on your account.',
    );
  });
});
