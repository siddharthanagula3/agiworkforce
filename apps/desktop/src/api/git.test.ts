import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({
  isTauri: false,
  invoke: vi.fn(),
}));

vi.mock('../lib/tauri-mock', () => ({
  get isTauri() {
    return tauri.isTauri;
  },
  invoke: tauri.invoke,
}));

import { gitCreatePr } from './git';

describe('gitCreatePr native execution boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauri.isTauri = false;
  });

  it('does not fabricate a PR creation result outside the native desktop runtime', async () => {
    await expect(
      gitCreatePr('/repo', { base_branch: 'main', head_branch: 'feature/x' }),
    ).rejects.toThrow(/desktop app/);
    expect(tauri.invoke).not.toHaveBeenCalled();
  });

  it('returns the pull request identity the backend reports', async () => {
    tauri.isTauri = true;
    tauri.invoke.mockResolvedValue({
      pr_number: 42,
      pr_url: 'https://github.com/acme/app/pull/42',
      title: 'Add widget',
      description: 'body',
      draft: false,
      files_changed: 1,
      additions: 3,
      deletions: 1,
    });

    const result = await gitCreatePr('/repo', {
      base_branch: 'main',
      head_branch: 'feature/x',
      draft: false,
    });

    expect(result.pr_number).toBe(42);
    expect(result.pr_url).toBe('https://github.com/acme/app/pull/42');
    expect(tauri.invoke).toHaveBeenCalledWith('git_create_pr', {
      path: '/repo',
      config: { base_branch: 'main', head_branch: 'feature/x', draft: false },
    });
  });

  it('surfaces a backend refusal instead of swallowing it', async () => {
    tauri.isTauri = true;
    tauri.invoke.mockRejectedValue('Failed to create PR via gh CLI: gh CLI not found');

    await expect(
      gitCreatePr('/repo', { base_branch: 'main', head_branch: 'feature/x' }),
    ).rejects.toThrow(/gh CLI not found/);
  });
});
