import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';

import {
  createCloudMemoryFixture,
  getCloudMemoryFixtureSession,
} from '@/features/memory/__tests__/CloudMemoryFixture';

vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  useSessionSnapshot: () => getCloudMemoryFixtureSession,
  useReadonlyIdentityLifetime: () => () => {
    const session = getCloudMemoryFixtureSession();
    return { isCurrent: () => session?.isCurrent() === true };
  },
}));

let cloud: ReturnType<typeof createCloudMemoryFixture>;
beforeEach(() => {
  cloud = createCloudMemoryFixture();
});
afterEach(() => {
  cloud.retire();
  vi.unstubAllGlobals();
});

import type { ManagedMemoryRecord } from '@agiworkforce/types';
let rows: ManagedMemoryRecord[] = [];
const transport = vi.fn<typeof fetch>();

const fetchPreferenceNamespace = vi.fn(async (_namespace: string, fallback: unknown) => fallback);
const savePreferenceNamespace = vi.fn(async (_namespace: string, _value: unknown) => undefined);

vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  readOwnedPreferences: async () => ({
    settings: { capabilities: await fetchPreferenceNamespace('capabilities', {}) },
    version: null,
  }),
  saveOwnedPreferenceNamespace: (_owner: unknown, ...args: unknown[]) =>
    savePreferenceNamespace(...(args as [string, unknown])),
  fetchOwnedPreferenceNamespace: async () => ({}),
}));

vi.mock('@/lib/runtime/memory-capability', () => ({
  resetMemoryCapabilityCache: vi.fn(),
}));

import { MemorySection } from '../MemorySection';

let factSequence = 0;
function fact(): ManagedMemoryRecord {
  return {
    id: `fact-${++factSequence}`,
    content: 'Ships on Fridays.',
    category: null,
    source: 'web',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  };
}

describe('Unexecuted cloud MemorySection top-level settings entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows = [];
    fetchPreferenceNamespace.mockImplementation(async (_namespace, fallback) => fallback);
    transport.mockReset();
    transport.mockImplementation(async (input, init) => {
      const path = String(input);
      if (path === '/api/settings/preferences?namespace=capabilities') {
        return new Response(JSON.stringify({ organizationMemoryAllowed: true }));
      }
      if (path === '/api/memory' && init?.method === 'DELETE') {
        const deleted = rows.length;
        rows = [];
        return new Response(JSON.stringify({ deleted }));
      }
      const body = path.startsWith('/api/memory?')
        ? { memories: rows, hasMore: false }
        : path === '/api/memory/conflicts'
          ? { conflicts: [] }
          : path === '/api/memory/summary'
            ? {
                summary: { about: [], preferences: [] },
                memoryCount: rows.length,
                generatedAt: null,
              }
            : {};
      return new Response(JSON.stringify(body));
    });
    vi.stubGlobal('fetch', transport);
  });

  it('renders a persistent memory toggle that saves the capabilities namespace', async () => {
    const user = userEvent.setup();
    render(<MemorySection />, { wrapper: cloud.wrapper });

    const toggle = await screen.findByRole('switch', { name: 'Persistent memory' });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    const policyRequest = transport.mock.calls.find(
      ([input]) => String(input) === '/api/settings/preferences?namespace=capabilities',
    );
    expect(policyRequest?.[1]).toMatchObject({ credentials: 'omit', cache: 'no-store' });
    expect(new Headers(policyRequest?.[1]?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
      MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    );

    await user.click(toggle);

    await waitFor(() =>
      expect(savePreferenceNamespace).toHaveBeenCalledWith(
        'capabilities',
        { memory: true },
        { merge: true, expectedVersion: null },
      ),
    );
  });

  it('offers Include sensitive topics in memory, off by default and saved to capabilities', async () => {
    fetchPreferenceNamespace.mockImplementation(async (_namespace: string, fallback: unknown) => ({
      ...(fallback as Record<string, unknown>),
      memory: true,
    }));
    const user = userEvent.setup();
    render(<MemorySection />, { wrapper: cloud.wrapper });

    const toggle = await screen.findByRole('switch', {
      name: 'Include sensitive topics in memory',
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/from chats, not only when you ask/)).toBeInTheDocument();
    expect(screen.getByText(/^Remember your .+ from chats/)).toBeInTheDocument();

    await user.click(toggle);

    await waitFor(() =>
      expect(savePreferenceNamespace).toHaveBeenCalledWith(
        'capabilities',
        { includeSensitiveTopics: true },
        { merge: true, expectedVersion: null },
      ),
    );
  });

  it('keeps Include sensitive topics in memory unavailable while memory is off', async () => {
    render(<MemorySection />, { wrapper: cloud.wrapper });

    const toggle = await screen.findByRole('switch', {
      name: 'Include sensitive topics in memory',
    });
    expect(toggle).toBeDisabled();
  });

  it('keeps the acknowledged state and offers a retry when a save is rejected', async () => {
    savePreferenceNamespace.mockRejectedValueOnce(new Error('Network unreachable'));
    const user = userEvent.setup();
    render(<MemorySection />, { wrapper: cloud.wrapper });

    const toggle = await screen.findByRole('switch', { name: 'Persistent memory' });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your memory settings were not saved, so nothing changed.');
    await waitFor(() => expect(toggle).not.toBeChecked());

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(toggle).toBeChecked());
    expect(savePreferenceNamespace).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a live count of saved cloud memories', async () => {
    rows = [fact(), fact(), fact()];

    render(<MemorySection />, { wrapper: cloud.wrapper });

    expect(await screen.findByText('3 saved memories')).toBeVisible();
  });

  it('disables Manage memories and Clear all memories when there are none', () => {
    render(<MemorySection />, { wrapper: cloud.wrapper });

    expect(screen.getByRole('button', { name: 'Manage memories' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear all memories' })).toBeDisabled();
  });

  it('asks before clearing cloud memories, then refreshes the acknowledged count', async () => {
    rows = [fact(), fact()];
    const user = userEvent.setup();
    render(<MemorySection />, { wrapper: cloud.wrapper });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clear all memories' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Clear all memories' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete all memory facts?');
    expect(rows).toHaveLength(2);
    expect(transport.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Forget everything' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clear all memories' })).toBeDisabled(),
    );
    expect(rows).toHaveLength(0);
    expect(transport.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
  });
});

type ImportedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
type ImportedModule1 = typeof import('@/app/settings/_lib/preferences-client');
