import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ScheduleTriggersPanel from './ScheduleTriggersPanel';

const TRIGGER_ID = '88888888-8888-4888-8888-888888888888';
const NEW_SECRET = 'f'.repeat(64);

function trigger(patch: Record<string, unknown> = {}) {
  return {
    id: TRIGGER_ID,
    userId: 'user_1',
    organizationId: null,
    taskId: 'task-1',
    name: 'Invoices',
    source: 'connector',
    eventTypes: ['*'],
    sourceAccount: null,
    conditions: [],
    debounceSeconds: 0,
    maxAttempts: 3,
    isEnabled: true,
    verificationStatus: 'verified',
    verifiedAt: null,
    watchExpiresAt: null,
    watchError: null,
    lastFiredAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...patch,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/csrf') return json({ token: 'csrf-token', expiresIn: 3_600_000 });
    if (url.endsWith('/signing-secret') && init?.method === 'POST') {
      return json({
        trigger: trigger(),
        signingSecret: NEW_SECRET,
        webhookPath: `/api/webhooks/connectors/${TRIGGER_ID}`,
      });
    }
    if (url.startsWith('/api/triggers?taskId=')) {
      return json({ triggers: [trigger(), trigger({ id: 'gh-1', name: 'CI', source: 'github' })] });
    }
    return json({ error: 'unexpected' }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openPanel() {
  const { container } = render(
    <ScheduleTriggersPanel scheduleId="task-1" scheduleName="Billing" />,
  );
  const details = container.querySelector('details');
  details!.open = true;
  fireEvent(details!, new Event('toggle'));
  await screen.findByText('Invoices');
}

function rotateCalls() {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/signing-secret'));
}

describe('ScheduleTriggersPanel signing secret', () => {
  it('offers Regenerate only on a signed webhook trigger', async () => {
    await openPanel();

    expect(screen.getAllByRole('button', { name: 'Regenerate secret' })).toHaveLength(1);
  });

  it('asks first, naming that current senders stop working, and rotates nothing on cancel', async () => {
    await openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate secret' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/Every sender using the current secret stops working at once/);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(rotateCalls()).toHaveLength(0);
  });

  it('rotates with a CSRF token on confirm and shows the new secret once with an example request', async () => {
    await openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate secret' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Regenerate secret' }));

    expect(await screen.findByText(`Signing secret: ${NEW_SECRET}`)).toBeInTheDocument();
    expect(screen.getByText(/The previous one no longer works/)).toBeInTheDocument();
    const [, init] = rotateCalls()[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-token');

    const example = screen.getByText(/curl -X POST/);
    expect(example).toHaveTextContent(`/api/webhooks/connectors/${TRIGGER_ID}`);
    expect(example).toHaveTextContent(NEW_SECRET);
    expect(example).toHaveTextContent('x-agi-signature: sha256=$sig');
  });
});
