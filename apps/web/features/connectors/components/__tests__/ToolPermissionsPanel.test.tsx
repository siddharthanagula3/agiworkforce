import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn().mockResolvedValue('csrf-1') }));
vi.mock('@shared/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const capabilities = vi.hoisted(() => ({
  result: {
    catalog: null as unknown,
    loading: false,
    error: null as string | null,
    retry: vi.fn(),
  },
}));

vi.mock('../../hooks/use-connector-capabilities', () => ({
  useConnectorCapabilities: () => capabilities.result,
}));

import { ToolPermissionsPanel } from '../ToolPermissionsPanel';
import {
  useToolPermissionsStore,
  PERMISSION_SAVE_FAILED_COPY,
} from '../../stores/tool-permissions-store';

const CONNECTOR = { id: 'github', name: 'GitHub', iconText: 'GH', iconBg: 'from-a to-b' };

const fetchMock = vi.fn();

function catalogWith(tools: string[]) {
  return {
    connectorId: CONNECTOR.id,
    tools: tools.map((name) => ({ name })),
  };
}

beforeEach(() => {
  useToolPermissionsStore.setState({ permissions: {}, saving: {}, saveError: {} });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
  capabilities.result = {
    catalog: catalogWith(['create_issue']),
    loading: false,
    error: null,
    retry: vi.fn(),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ToolPermissionsPanel', () => {
  it('writes the chosen level and marks the pressed verdict', async () => {
    const user = userEvent.setup();
    render(<ToolPermissionsPanel connector={CONNECTOR} open onOpenChange={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Deny' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Deny' })).toHaveAttribute('aria-pressed', 'true');
    });
    const put = fetchMock.mock.calls.find((call) => (call[1] as RequestInit)?.method === 'PUT');
    expect(JSON.parse((put![1] as RequestInit).body as string)).toMatchObject({
      connectorId: 'github',
      toolName: 'create_issue',
      level: 'deny',
    });
  });

  it('shows the failure notice and the enforced level when the server refuses the write', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    useToolPermissionsStore.setState({
      permissions: { github: { create_issue: 'allow' } },
      saving: {},
      saveError: {},
    });
    const user = userEvent.setup();
    render(<ToolPermissionsPanel connector={CONNECTOR} open onOpenChange={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Deny' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(PERMISSION_SAVE_FAILED_COPY);
    expect(screen.getByRole('button', { name: 'Allow' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Deny' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('asks for confirmation before resetting every verdict, and does nothing if cancelled', async () => {
    useToolPermissionsStore.setState({
      permissions: { github: { create_issue: 'allow' } },
      saving: {},
      saveError: {},
    });
    const user = userEvent.setup();
    render(<ToolPermissionsPanel connector={CONNECTOR} open onOpenChange={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Reset all to default/ }));
    expect(await screen.findByText(/Reset every tool permission\?/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit)?.method === 'DELETE')).toBe(
      false,
    );
    expect(useToolPermissionsStore.getState().getToolPermission('github', 'create_issue')).toBe(
      'allow',
    );
  });

  it('revokes on the server once the reset is confirmed', async () => {
    useToolPermissionsStore.setState({
      permissions: { github: { create_issue: 'allow' } },
      saving: {},
      saveError: {},
    });
    const user = userEvent.setup();
    render(<ToolPermissionsPanel connector={CONNECTOR} open onOpenChange={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Reset all to default/ }));
    await user.click(await screen.findByRole('button', { name: 'Reset permissions' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (entry) => (entry[1] as RequestInit)?.method === 'DELETE',
      );
      expect(String(call?.[0])).toContain('connectorId=github');
    });
    expect(useToolPermissionsStore.getState().getToolPermission('github', 'create_issue')).toBe(
      'ask',
    );
  });

  it('offers a retry when discovery fails with no known tools to fall back on', async () => {
    const retry = vi.fn();
    capabilities.result = { catalog: null, loading: false, error: 'boom', retry };
    const user = userEvent.setup();
    render(
      <ToolPermissionsPanel
        connector={{ ...CONNECTOR, id: 'dir-abcdef123456' }}
        open
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText('Tool discovery could not be loaded.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
  });
});
