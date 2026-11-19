import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  createCloudMemoryFixture,
  getCloudMemoryFixtureSession,
} from '@/features/memory/__tests__/CloudMemoryFixture';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  useSessionSnapshot: () => getCloudMemoryFixtureSession,
}));

let cloud: ReturnType<typeof createCloudMemoryFixture>;
let version: string | null = null;
const transport = vi.fn<typeof fetch>();
beforeEach(() => {
  cloud = createCloudMemoryFixture();
  version = null;
  fetchPreferenceNamespace.mockReset().mockImplementation(async (_namespace, fallback) => fallback);
  savePreferenceNamespace.mockReset().mockResolvedValue(undefined);
  transport
    .mockReset()
    .mockImplementation(
      async () => new Response(JSON.stringify({ organizationMemoryAllowed: true })),
    );
  vi.stubGlobal('fetch', transport);
});
afterEach(() => {
  cloud.retire();
  vi.unstubAllGlobals();
});

const fetchPreferenceNamespace = vi.fn(async (_namespace: string, fallback: unknown) => fallback);
const savePreferenceNamespace = vi.fn(
  async (
    _namespace: string,
    _value: unknown,
    _options?: unknown,
  ): Promise<{ version: string | null } | undefined> => undefined,
);

vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  readOwnedPreferences: async () => ({
    settings: { capabilities: await fetchPreferenceNamespace('capabilities', {}) },
    version,
  }),
  saveOwnedPreferenceNamespace: (_owner: unknown, ...args: unknown[]) =>
    savePreferenceNamespace(...(args as [string, unknown])),
}));

vi.mock('@/lib/runtime/memory-capability', () => ({
  resetMemoryCapabilityCache: vi.fn(),
}));

vi.mock('../../components/ToolApprovalDefaultsPanel', () => ({
  ToolApprovalDefaultsPanel: () => null,
}));

vi.mock('../../components/ApprovalHistoryPanel', () => ({
  ApprovalHistoryPanel: () => null,
}));

vi.mock('@/features/settings/components/LockdownModePanel', () => ({
  LockdownModePanel: () => null,
}));

import { BYOK_SURFACES } from '@/lib/marketing-constants';
import { CLI_AVAILABILITY_NOTE } from '@/lib/surface-status';
import { CapabilitiesSection } from '../CapabilitiesSection';
import { PreferenceVersionConflictError } from '@/app/settings/_lib/preferences-client';
import { WEB_SETTINGS_NAV_FIELDS } from '@/features/settings/components/web-settings-navigation';

describe('CapabilitiesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no longer renders the memory toggles inline', () => {
    render(<CapabilitiesSection />, { wrapper: cloud.wrapper });

    expect(screen.queryByRole('switch', { name: 'Memory' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Save memories from chats' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Search past chats' })).toBeNull();
  });

  it('carries no relocation notes, because the nav lists both sections itself', () => {
    render(<CapabilitiesSection />, { wrapper: cloud.wrapper });

    expect(screen.queryByText(/has moved to/i)).toBeNull();
    expect(screen.queryByText(/have moved to/i)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Memory' })).toBeNull();
  });

  it('states provider-key availability from the surface release status', () => {
    render(<CapabilitiesSection />, { wrapper: cloud.wrapper });

    const note = screen.getByText(/Running models on your own provider keys/);
    expect(note).toHaveTextContent(BYOK_SURFACES.availability);
    if (CLI_AVAILABILITY_NOTE) expect(note.textContent).not.toMatch(/available in the CLI/);
  });

  it('titles the code execution group as a section and lists its row with a one-line helper', () => {
    render(<CapabilitiesSection />, { wrapper: cloud.wrapper });

    expect(
      screen.getByRole('heading', { level: 2, name: 'Code execution and file creation' }),
    ).toBeVisible();
    const row = screen
      .getByRole('switch', { name: 'Cloud code execution and file creation' })
      .closest('li');
    expect(row?.parentElement).toHaveClass('divide-y');
    expect(row).toHaveTextContent(
      'Run code and create files in a sandbox that can reach only GitHub, npm and PyPI.',
    );
  });

  it('still renders the code execution toggle it kept', () => {
    render(<CapabilitiesSection />, { wrapper: cloud.wrapper });

    expect(
      screen.getByRole('switch', { name: 'Cloud code execution and file creation' }),
    ).toBeVisible();
  });

  it('reports a failed save as a failure rather than another muted status line', async () => {
    savePreferenceNamespace.mockRejectedValueOnce(new Error('storage unavailable'));
    render(<CapabilitiesSection />, { wrapper: cloud.wrapper });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Synced|Saved/));
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Cloud code execution and file creation' }),
      ).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Cloud code execution and file creation' }));

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent('Save failed: storage unavailable');
    expect(failure).toHaveStyle({ color: 'var(--settings-destructive-text)' });
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try saving again' }));

    await waitFor(() => expect(savePreferenceNamespace).toHaveBeenCalledTimes(2));
    expect(savePreferenceNamespace).toHaveBeenLastCalledWith(
      'capabilities',
      { cloudCodeExecution: false },
      expect.objectContaining({ merge: true }),
    );
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('retries one version conflict with the same account batch and returned revision', async () => {
    version = 'read-version';
    savePreferenceNamespace
      .mockRejectedValueOnce(
        new PreferenceVersionConflictError({
          message: 'Changed elsewhere',
          namespace: 'capabilities',
          settings: { memory: true, cloudCodeExecution: true },
          version: 'conflict-version',
        }),
      )
      .mockResolvedValueOnce({ version: 'saved-version' });
    render(<CapabilitiesSection />, { wrapper: cloud.wrapper });
    const toggle = screen.getByRole('switch', { name: 'Cloud code execution and file creation' });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(savePreferenceNamespace).toHaveBeenCalledTimes(2));
    expect(savePreferenceNamespace).toHaveBeenNthCalledWith(
      1,
      'capabilities',
      { cloudCodeExecution: false },
      { merge: true, expectedVersion: 'read-version' },
    );
    expect(savePreferenceNamespace).toHaveBeenNthCalledWith(
      2,
      'capabilities',
      { cloudCodeExecution: false },
      { merge: true, expectedVersion: 'conflict-version' },
    );
    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it('does not retry a retired account conflict into a replacement account', async () => {
    let rejectSave!: (reason: unknown) => void;
    savePreferenceNamespace.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      }),
    );
    const view = render(<CapabilitiesSection />, { wrapper: cloud.wrapper });
    const oldToggle = screen.getByRole('switch', {
      name: 'Cloud code execution and file creation',
    });
    await waitFor(() => expect(oldToggle).toBeEnabled());
    fireEvent.click(oldToggle);
    await waitFor(() => expect(savePreferenceNamespace).toHaveBeenCalledTimes(1));
    cloud.retire();
    view.unmount();
    cloud = createCloudMemoryFixture();
    render(<CapabilitiesSection />, { wrapper: cloud.wrapper });
    const currentToggle = screen.getByRole('switch', {
      name: 'Cloud code execution and file creation',
    });
    await waitFor(() => expect(currentToggle).toBeEnabled());
    await act(async () =>
      rejectSave(
        new PreferenceVersionConflictError({
          message: 'Old conflict',
          namespace: 'capabilities',
          settings: {},
          version: 'other-account',
        }),
      ),
    );
    expect(savePreferenceNamespace).toHaveBeenCalledTimes(1);
    expect(currentToggle).toBeChecked();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('CapabilitiesSection search index', () => {
  it('renders the code execution switch the settings search lists', () => {
    render(<CapabilitiesSection />, { wrapper: cloud.wrapper });

    const labels = (WEB_SETTINGS_NAV_FIELDS.capabilities ?? []).map((field) => field.label);
    expect(labels).toContain('Cloud code execution and file creation');
    expect(
      screen.getByRole('switch', { name: 'Cloud code execution and file creation' }),
    ).toBeInTheDocument();
  });
});

type ImportedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
type ImportedModule1 = typeof import('@/app/settings/_lib/preferences-client');
