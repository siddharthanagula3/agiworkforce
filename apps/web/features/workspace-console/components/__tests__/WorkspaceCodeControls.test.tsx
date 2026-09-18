import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WORKSPACE_CODE_CONTROLS,
  WORKSPACE_CODE_CONTROL_LABELS,
  WORKSPACE_CODE_TOGGLE_KEYS,
  resolveWorkspaceCodeControls,
  type WorkspaceCodeControls as CodeControls,
  type WorkspaceCodePolicyResponse,
} from '@agiworkforce/types';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: async () => 'token' }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));

import { WorkspaceCodeControls } from '../WorkspaceCodeControls';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function response(
  controls: Partial<CodeControls> = {},
  overrides: Partial<WorkspaceCodePolicyResponse> = {},
): WorkspaceCodePolicyResponse {
  const merged = { ...DEFAULT_WORKSPACE_CODE_CONTROLS, ...controls };
  return {
    organizationId: 'org-1',
    configured: true,
    canManagePolicy: true,
    controls: merged,
    effective: resolveWorkspaceCodeControls(merged, [], 3),
    ...overrides,
  };
}

function ok(body: WorkspaceCodePolicyResponse) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceCodeControls />
    </QueryClientProvider>,
  );
}

function patchCall(): RequestInit | undefined {
  const call = fetchMock.mock.calls.find(
    ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
  );
  return call?.[1] as RequestInit | undefined;
}

async function patchBody(): Promise<CodeControls> {
  await waitFor(() => expect(patchCall()).toBeDefined());
  return JSON.parse(String(patchCall()?.body)) as CodeControls;
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('WorkspaceCodeControls', () => {
  it('governs every Code connection the contract carries, so none is left ungovernable', async () => {
    fetchMock.mockResolvedValue(ok(response()));
    renderPanel();

    for (const key of WORKSPACE_CODE_TOGGLE_KEYS) {
      expect(
        await screen.findByRole('switch', { name: `Allow ${WORKSPACE_CODE_CONTROL_LABELS[key]}` }),
      ).toBeInTheDocument();
    }
  });

  it('confirms before turning a connection off and names what stops', async () => {
    fetchMock.mockResolvedValue(ok(response()));
    renderPanel();

    const github = await screen.findByRole('switch', {
      name: `Allow ${WORKSPACE_CODE_CONTROL_LABELS.allowGithubConnection}`,
    });
    fireEvent.click(github);
    fireEvent.click(screen.getByRole('button', { name: 'Save Code connections' }));

    expect(await screen.findByText(/Members cannot connect GitHub/)).toBeInTheDocument();
    expect(patchCall()).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect((await patchBody()).allowGithubConnection).toBe(false);
  });

  it('saves the desktop sync switch without a confirmation when it is turned back on', async () => {
    fetchMock.mockResolvedValue(ok(response({ allowDesktopCloudSync: false })));
    renderPanel();

    const desktop = await screen.findByRole('switch', {
      name: `Allow ${WORKSPACE_CODE_CONTROL_LABELS.allowDesktopCloudSync}`,
    });
    expect(desktop).not.toBeChecked();
    fireEvent.click(desktop);
    fireEvent.click(screen.getByRole('button', { name: 'Save Code connections' }));

    expect((await patchBody()).allowDesktopCloudSync).toBe(true);
  });

  it('normalises the MCP and egress host lists before saving them', async () => {
    fetchMock.mockResolvedValue(ok(response()));
    renderPanel();

    const mcp = await screen.findByPlaceholderText('mcp.example.com, *.tools.example.com');
    fireEvent.change(mcp, { target: { value: 'MCP.Example.com,  mcp.example.com b.example.com' } });
    fireEvent.change(screen.getByPlaceholderText('api.example.com'), {
      target: { value: 'api.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Code connections' }));

    const body = await patchBody();
    expect(body.allowedMcpServers).toEqual(['b.example.com', 'mcp.example.com']);
    expect(body.allowedEgressHosts).toEqual(['api.example.com']);
  });

  it('shows the automated review policy as read-only for a member who cannot manage policy', async () => {
    fetchMock.mockResolvedValue(ok(response({}, { canManagePolicy: false })));
    renderPanel();

    const review = await screen.findByRole('switch', {
      name: `Allow ${WORKSPACE_CODE_CONTROL_LABELS.allowAutomatedReview}`,
    });
    expect(review).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save Code connections' })).toBeNull();
  });

  it('names the exception that narrows a control further for this member', async () => {
    const controls = { ...DEFAULT_WORKSPACE_CODE_CONTROLS };
    const body = response();
    body.effective = resolveWorkspaceCodeControls(
      controls,
      [
        {
          id: 'override-1',
          organizationId: 'org-1',
          subjectType: 'group',
          subjectId: 'group-1',
          layer: { code: { allowMcpServers: false } },
          updatedAt: '2026-09-17T00:00:00.000Z',
        },
      ],
      3,
    );
    fetchMock.mockResolvedValue(ok(body));
    renderPanel();

    expect(await screen.findByText(/Narrowed further for you by a group exception/)).toBeVisible();
  });
});
