import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

const { mockCapabilities, memoryState, openImport } = vi.hoisted(() => ({
  mockCapabilities: vi.fn(),
  memoryState: { count: 0 },
  openImport: vi.fn(),
}));

vi.mock('../hooks/use-capabilities-preferences', () => ({
  useCapabilitiesPreferences: () => mockCapabilities(),
}));

vi.mock('@/features/settings/components/MemoryConflicts', () => ({
  MemoryConflicts: () => null,
}));
vi.mock('@/features/settings/components/MemoryExclusions', () => ({
  MemoryExclusions: () => null,
}));

vi.mock('@/features/settings/components/ImportMemoryDialog', () => ({
  ImportMemoryDialog: () => null,
  useImportMemoryDialog: () => ({ isOpen: false, open: openImport, close: vi.fn() }),
}));

import { MemorySection } from './MemorySection';
import { WEB_SETTINGS_NAV_FIELDS } from '@/features/settings/components/web-settings-navigation';

const transport = vi.fn<typeof fetch>();
function memoryResponse(input: RequestInfo | URL) {
  const path = String(input);
  const rows = Array.from({ length: memoryState.count }, (_, index) => ({
    id: `cloud-${index}`,
    content: `Saved fact ${index}`,
    category: null,
    source: 'web',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  }));
  return new Response(
    JSON.stringify(
      path.startsWith('/api/memory?')
        ? { memories: rows, hasMore: false }
        : { summary: { about: [], preferences: [] }, memoryCount: rows.length, generatedAt: null },
    ),
  );
}
beforeEach(() => {
  memoryState.count = 0;
  transport.mockReset();
  transport.mockImplementation(async (input) => memoryResponse(input));
  vi.stubGlobal('fetch', transport);
});

const TOGGLES = [
  'Persistent memory',
  'Save memories from chats',
  'Search past chats',
  'Include sensitive topics in memory',
  'Allow memory generation from tool-assisted chats',
];

function capabilities(organizationMemoryAllowed: boolean) {
  return {
    loaded: true,
    settings: {
      memory: true,
      generateFromHistory: true,
      allowToolAssistedGeneration: false,
      searchPastChats: true,
      includeSensitiveTopics: false,
      cloudCodeExecution: true,
    },
    organizationMemoryAllowed,
    saving: false,
    saveError: null,
    savedAt: null,
    loadError: null,
    retry: vi.fn(),
    retrySave: null,
    setBoolean: vi.fn(),
  };
}

describe('Unexecuted cloud MemorySection under a workspace policy', () => {
  beforeEach(() => mockCapabilities.mockReset());

  it('says the workspace turned memory off and names where it changes', () => {
    mockCapabilities.mockReturnValue(capabilities(false));
    render(<MemorySection />, { wrapper: cloud.wrapper });

    expect(screen.getByText(/workspace has memory off/i)).toBeInTheDocument();
    expect(screen.getByText(/Workspace → Policy/)).toBeInTheDocument();
  });

  it('disables every memory toggle while the workspace gate is closed', () => {
    mockCapabilities.mockReturnValue(capabilities(false));
    render(<MemorySection />, { wrapper: cloud.wrapper });

    for (const label of TOGGLES) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
  });

  // The three scopes and the disabled contract are the two questions Settings
  // could not answer before: where a fact applies, and what turning memory off
  // does to the facts already saved.
  it('explains account, workspace and project scope, and what disabling memory does', () => {
    mockCapabilities.mockReturnValue(capabilities(true));
    render(<MemorySection />, { wrapper: cloud.wrapper });

    const explanation = screen.getByRole('region', { name: 'Where a memory applies' });
    expect(explanation).toHaveTextContent('Account');
    expect(explanation).toHaveTextContent('Workspace');
    expect(explanation).toHaveTextContent('Project');
    expect(explanation).toHaveTextContent(/never sees your account facts/i);
    expect(explanation).toHaveTextContent(/nothing is saved or read/i);
  });

  it('says the history switch saves details on its own, not that it reads old chats', () => {
    mockCapabilities.mockReturnValue(capabilities(true));
    render(<MemorySection />, { wrapper: cloud.wrapper });

    expect(screen.getByRole('switch', { name: 'Save memories from chats' })).toBeInTheDocument();
    expect(
      screen.getByText(/save lasting details you mention in a chat without being asked/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/saves only what you ask it to remember/i)).toBeInTheDocument();
  });

  it('leaves the toggles usable when the workspace allows memory', () => {
    mockCapabilities.mockReturnValue(capabilities(true));
    render(<MemorySection />, { wrapper: cloud.wrapper });

    expect(screen.queryByText(/workspace has memory off/i)).toBeNull();
    for (const label of TOGGLES) {
      expect(screen.getByLabelText(label)).toBeEnabled();
    }
  });

  it('does not enable account controls before the current owner preferences load', () => {
    mockCapabilities.mockReturnValue({ ...capabilities(true), loaded: false });
    render(<MemorySection />, { wrapper: cloud.wrapper });
    for (const label of TOGGLES) expect(screen.getByLabelText(label)).toBeDisabled();
  });
});

describe('Unexecuted cloud MemorySection controls', () => {
  const createObjectURL = vi.fn(() => 'blob:memories');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    mockCapabilities.mockReset();
    mockCapabilities.mockReturnValue(capabilities(true));
    memoryState.count = 3;
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    memoryState.count = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('heads Memory as a section of the pane that holds it', () => {
    render(<MemorySection />, { wrapper: cloud.wrapper });

    expect(screen.getByRole('heading', { level: 2, name: 'Memory' })).toBeVisible();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('region', { name: 'Memory' })).toBeVisible();
  });

  it('draws the memory actions as pills and keeps their labels', () => {
    render(<MemorySection />, { wrapper: cloud.wrapper });

    for (const name of [
      'Start import',
      'Export memories',
      'Manage memories',
      'Clear all memories',
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button.style.borderRadius).toBe('var(--corner-pill)');
      expect(button.style.fontSize).toBe('14px');
    }
  });

  it('starts an import from its own row, even before any memory exists', async () => {
    memoryState.count = 0;
    render(<MemorySection />, { wrapper: cloud.wrapper });

    const start = screen.getByRole('button', { name: 'Start import' });
    expect(start.closest('li')).toHaveTextContent('Import memory from other AI providers');
    expect(start).toBeEnabled();
    await userEvent.click(start);
    expect(openImport).toHaveBeenCalledTimes(1);
  });

  it('offers no export while there is nothing to export', () => {
    memoryState.count = 0;
    render(<MemorySection />, { wrapper: cloud.wrapper });

    expect(screen.getByRole('button', { name: 'Export memories' })).toBeDisabled();
  });

  it('downloads the export under the name the server gives it', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('[]', {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="memories-2026-10-22.json"',
          },
        }),
    );
    transport.mockImplementation(async (input, init) =>
      String(input) === '/api/memory/export' ? fetchMock(input, init) : memoryResponse(input),
    );
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    render(<MemorySection />, { wrapper: cloud.wrapper });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export memories' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Export memories' }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/memory/export',
      expect.objectContaining({ credentials: 'omit', cache: 'no-store' }),
    );
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toMatch(
      /^Bearer fixture-token-/,
    );
    expect(downloads).toEqual(['memories-2026-10-22.json']);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:memories');
    expect(screen.getByRole('button', { name: 'Export memories' })).toBeEnabled();
  });

  it('says the export failed instead of downloading an error page', async () => {
    transport.mockImplementation(async (input) =>
      String(input) === '/api/memory/export'
        ? new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
            status: 429,
          })
        : memoryResponse(input),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    render(<MemorySection />, { wrapper: cloud.wrapper });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export memories' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Export memories' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Rate limit exceeded');
    expect(click).not.toHaveBeenCalled();
  });

  it('renders every memory control the settings search lists under Personalization', () => {
    render(<MemorySection />, { wrapper: cloud.wrapper });

    const labels = (WEB_SETTINGS_NAV_FIELDS.personalization ?? []).map((field) => field.label);
    for (const label of MEMORY_FIELD_LABELS) {
      expect(labels).toContain(label);
      expect(screen.getByRole('switch', { name: label })).toBeInTheDocument();
    }
  });
});

describe('Unexecuted cloud MemorySection while persistent memory is off', () => {
  beforeEach(() => mockCapabilities.mockReset());

  it('says why the tool-assisted toggle is locked and links the reason to it', () => {
    const value = capabilities(true);
    mockCapabilities.mockReturnValue({ ...value, settings: { ...value.settings, memory: false } });
    render(<MemorySection />, { wrapper: cloud.wrapper });

    const toggle = screen.getByRole('switch', {
      name: 'Allow memory generation from tool-assisted chats',
    });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAccessibleDescription('Turn on persistent memory to change this.');
    expect(screen.getByRole('switch', { name: 'Search past chats' })).not.toHaveAttribute(
      'aria-describedby',
    );
  });

  it('shows no locked hint once persistent memory is on', () => {
    mockCapabilities.mockReturnValue(capabilities(true));
    render(<MemorySection />, { wrapper: cloud.wrapper });

    expect(screen.queryByText('Turn on persistent memory to change this.')).toBeNull();
  });

  it('lists the memory rows as one divided list instead of boxed cards', () => {
    mockCapabilities.mockReturnValue(capabilities(true));
    render(<MemorySection />, { wrapper: cloud.wrapper });

    const row = screen.getByRole('switch', { name: 'Search past chats' }).closest('li');
    expect(row?.parentElement).toHaveClass('divide-y');
    expect(row).not.toHaveStyle({ borderRadius: 'var(--radius-md)' });
  });
});

const MEMORY_FIELD_LABELS = [
  'Persistent memory',
  'Save memories from chats',
  'Search past chats',
  'Include sensitive topics in memory',
  'Allow memory generation from tool-assisted chats',
];

type ImportedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
