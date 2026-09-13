import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HostBridge, ShellPolicy } from '@agiworkforce/local-runtime-contract';

const listWorkspaceRoots = vi.fn();
const pickWorkspaceRoot = vi.fn();
const revealWorkspaceRoot = vi.fn();
const revokeWorkspaceRoot = vi.fn();
const readLocalCommandPolicy = vi.fn();
const writeLocalCommandPolicy = vi.fn();

vi.mock('../lib/runtime-client', () => ({
  listWorkspaceRoots,
  pickWorkspaceRoot,
  revealWorkspaceRoot,
  revokeWorkspaceRoot,
  readLocalCommandPolicy,
  writeLocalCommandPolicy,
}));

const { LocalAccessSection } = await import('../components/LocalAccessSection');

const root = {
  id: 'root-1',
  path: '/Users/me/project',
  name: 'project',
  grantedAtMs: 0,
  lastOpenedAtMs: 0,
};

function installHost() {
  window.agiHost = {
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    invokeRuntime: async () => ({
      ok: false as const,
      error: { code: 'unsupported-platform' as const, message: 'not used here' },
    }),
    onDeepLink: () => () => undefined,
    onVoiceHotkey: () => () => undefined,
    onRuntimeEvent: () => () => undefined,
    openExternal: async () => undefined,
    notify: async () => undefined,
  } satisfies HostBridge;
}

beforeEach(() => {
  vi.clearAllMocks();
  listWorkspaceRoots.mockResolvedValue([root]);
  readLocalCommandPolicy.mockResolvedValue({ allow: ['git'], deny: ['rm'] });
  writeLocalCommandPolicy.mockImplementation(async (policy: ShellPolicy) => policy);
  installHost();
});

describe('LocalAccessSection', () => {
  it('renders nothing in a browser', () => {
    delete window.agiHost;
    const { container } = render(<LocalAccessSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the approved folders and the command policy', async () => {
    render(<LocalAccessSection />);
    expect(await screen.findByText('project')).toBeInTheDocument();
    expect(await screen.findByText('git')).toBeInTheDocument();
    expect(screen.getByText('rm')).toBeInTheDocument();
  });

  it('says plainly that nothing runs without asking when the list is empty', async () => {
    readLocalCommandPolicy.mockResolvedValue({ allow: [], deny: [] });
    render(<LocalAccessSection />);
    expect(await screen.findByText('Nothing runs without asking.')).toBeInTheDocument();
    expect(screen.getByText('Nothing is blocked outright.')).toBeInTheDocument();
  });

  it('allows a program the user types', async () => {
    const user = userEvent.setup();
    render(<LocalAccessSection />);
    await screen.findByText('git');

    await user.type(screen.getByLabelText(/Program name/), 'pnpm');
    await user.click(screen.getByRole('button', { name: 'Allow' }));

    await waitFor(() =>
      expect(writeLocalCommandPolicy).toHaveBeenCalledWith({
        allow: ['git', 'pnpm'],
        deny: ['rm'],
      }),
    );
  });

  it('moves a program across when it is blocked after being allowed', async () => {
    const user = userEvent.setup();
    render(<LocalAccessSection />);
    await screen.findByText('git');

    await user.type(screen.getByLabelText(/Program name/), 'git');
    await user.click(screen.getByRole('button', { name: 'Block' }));

    await waitFor(() =>
      expect(writeLocalCommandPolicy).toHaveBeenCalledWith({ allow: [], deny: ['rm', 'git'] }),
    );
  });

  it('goes back to asking when an allowed program is removed', async () => {
    const user = userEvent.setup();
    render(<LocalAccessSection />);
    await screen.findByText('git');

    await user.click(screen.getByRole('button', { name: 'Ask before running git' }));

    await waitFor(() =>
      expect(writeLocalCommandPolicy).toHaveBeenCalledWith({ allow: [], deny: ['rm'] }),
    );
  });

  it('names the programs no list can ever reach', async () => {
    render(<LocalAccessSection />);
    expect(await screen.findByText(/sudo/)).toBeInTheDocument();
  });

  it('reports a policy that could not be read', async () => {
    readLocalCommandPolicy.mockRejectedValue(new Error('gone'));
    render(<LocalAccessSection />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
