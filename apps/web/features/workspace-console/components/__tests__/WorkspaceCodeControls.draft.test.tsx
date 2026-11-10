import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WORKSPACE_CODE_CONTROLS,
  WORKSPACE_CODE_CONTROL_LABELS,
  resolveWorkspaceCodeControls,
  type WorkspaceCodeControls as CodeControls,
} from '@agiworkforce/types';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: async () => 'token' }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));

import { WorkspaceCodeControls } from '../WorkspaceCodeControls';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function ok(controls: Partial<CodeControls> = {}) {
  const merged = { ...DEFAULT_WORKSPACE_CODE_CONTROLS, ...controls };
  return {
    ok: true,
    status: 200,
    json: async () => ({
      organizationId: 'org-1',
      configured: true,
      canManagePolicy: true,
      controls: merged,
      effective: resolveWorkspaceCodeControls(merged, [], 3),
    }),
  } as Response;
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceCodeControls />
    </QueryClientProvider>,
  );
  return client;
}

async function refresh(client: QueryClient) {
  await act(async () => {
    await client.invalidateQueries();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

const githubSwitch = () =>
  screen.getByRole('switch', {
    name: `Allow ${WORKSPACE_CODE_CONTROL_LABELS.allowGithubConnection}`,
  });

beforeEach(() => {
  fetchMock.mockReset();
});

describe('WorkspaceCodeControls draft lifecycle', () => {
  it('keeps unsaved switches and host lists when the server data changes underneath them', async () => {
    fetchMock.mockResolvedValue(ok());
    const client = renderPanel();
    await screen.findByRole('switch', {
      name: `Allow ${WORKSPACE_CODE_CONTROL_LABELS.allowGithubConnection}`,
    });

    fireEvent.click(githubSwitch());
    fireEvent.change(screen.getByPlaceholderText('mcp.example.com, *.tools.example.com'), {
      target: { value: 'mcp.example.com' },
    });

    fetchMock.mockResolvedValue(ok({ allowDesktopCloudSync: false }));
    await refresh(client);

    expect(githubSwitch()).not.toBeChecked();
    expect(screen.getByPlaceholderText('mcp.example.com, *.tools.example.com')).toHaveValue(
      'mcp.example.com',
    );
  });

  it('adopts a server change when nothing is unsaved', async () => {
    fetchMock.mockResolvedValue(ok());
    const client = renderPanel();
    await screen.findByRole('switch', {
      name: `Allow ${WORKSPACE_CODE_CONTROL_LABELS.allowGithubConnection}`,
    });

    fetchMock.mockResolvedValue(ok({ allowGithubConnection: false }));
    await refresh(client);

    expect(githubSwitch()).not.toBeChecked();
  });
});
