import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  createCloudMemoryFixture,
  getCloudMemoryFixtureSession,
} from '@/features/memory/__tests__/cloud-memory-fixture';

vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/identity/useSessionSnapshot')>()),
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

import { ProjectMemoryPanel } from '../ProjectMemoryPanel';
import type { ManagedMemoryRecord } from '@agiworkforce/types';

const transport = vi.fn<typeof fetch>();
let rows: ManagedMemoryRecord[];
let updateReply: ((content: string) => Promise<Response>) | null = null;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  transport.mockReset();
  updateReply = null;
  rows = [
    {
      id: 'fact-1',
      content: 'Targets the EU market.',
      projectId: 'project-1',
      category: null,
      source: 'web',
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    },
    {
      id: 'fact-2',
      content: 'Belongs elsewhere.',
      projectId: 'project-2',
      category: null,
      source: 'web',
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    },
  ];
  transport.mockImplementation(async (input, init) => {
    if (String(input).startsWith('/api/memory?')) return json({ memories: rows, hasMore: false });
    if (String(input) === '/api/memory/fact-1' && init?.method === 'PUT') {
      const { content } = JSON.parse(String(init.body)) as { content: string };
      if (updateReply) return updateReply(content);
      rows = rows.map((row) => (row.id === 'fact-1' ? { ...row, content } : row));
      return json({ memory: rows[0] });
    }
    throw new Error(`Unexpected fixture request: ${String(input)}`);
  });
  vi.stubGlobal('fetch', transport);
});

async function renderPanel() {
  const view = render(<ProjectMemoryPanel projectId="project-1" projectName="Launch" />, {
    wrapper: cloud.wrapper,
  });
  await screen.findByText('Targets the EU market.');
  return view;
}

const writes = () => transport.mock.calls.filter(([, init]) => init?.method === 'PUT');

describe('Unexecuted cloud ProjectMemoryPanel editing', () => {
  it('lists only this project memories, each with edit and delete', async () => {
    await renderPanel();
    expect(screen.queryByText('Belongs elsewhere.')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Edit project memory: Targets the EU market.' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Delete project memory: Targets the EU market.' }),
    ).toBeEnabled();
  });

  it('saves trimmed edited text through the canonical cloud owner', async () => {
    const user = userEvent.setup();
    await renderPanel();
    await user.click(
      screen.getByRole('button', { name: 'Edit project memory: Targets the EU market.' }),
    );
    const field = screen.getByRole('textbox', {
      name: 'Edit project memory: Targets the EU market.',
    });
    await user.clear(field);
    await user.type(field, '  Targets the EU and UK markets.  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Targets the EU and UK markets.');
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(String(writes()[0]?.[1]?.body))).toEqual({
      content: 'Targets the EU and UK markets.',
    });
    expect(writes()[0]?.[1]?.credentials).toBe('omit');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('does not save an empty memory and cancels without writing', async () => {
    const user = userEvent.setup();
    await renderPanel();
    await user.click(
      screen.getByRole('button', { name: 'Edit project memory: Targets the EU market.' }),
    );
    await user.clear(
      screen.getByRole('textbox', { name: 'Edit project memory: Targets the EU market.' }),
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(writes()).toHaveLength(0);
    expect(screen.getByText('Targets the EU market.')).toBeVisible();
  });

  it('keeps the unsaved edit and says why a definitely rejected edit failed', async () => {
    updateReply = async () => json({ error: 'Edit rejected' }, 422);
    const user = userEvent.setup();
    await renderPanel();
    await user.click(
      screen.getByRole('button', { name: 'Edit project memory: Targets the EU market.' }),
    );
    const field = screen.getByRole('textbox', {
      name: 'Edit project memory: Targets the EU market.',
    });
    await user.type(field, ' Also the UK.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(field).toHaveValue('Targets the EU market. Also the UK.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('keeps the draft and prevents duplicate submission while saving', async () => {
    let resolve!: (value: Response) => void;
    updateReply = () =>
      new Promise<Response>((done) => {
        resolve = done;
      });
    const user = userEvent.setup();
    await renderPanel();
    await user.click(
      screen.getByRole('button', { name: 'Edit project memory: Targets the EU market.' }),
    );
    const field = screen.getByRole('textbox', {
      name: 'Edit project memory: Targets the EU market.',
    });
    await user.type(field, ' Also the UK.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(field).toHaveValue('Targets the EU market. Also the UK.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    resolve(json({ error: 'Edit rejected' }, 422));
    await screen.findByRole('alert');
    expect(writes()).toHaveLength(1);
  });
});
