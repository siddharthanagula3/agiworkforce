import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const invalidate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: () => Promise.resolve('csrf-token'),
}));
vi.mock('../../hooks/use-connectors', () => ({
  invalidateConnectorsCache: () => invalidate(),
}));

import { ConnectorApiKeyForm, credentialsPath } from '../ConnectorApiKeyForm';

const RECORD_ID = 'ai.keenable/web-search';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

const spec = {
  connectorId: RECORD_ID,
  name: 'Keenable',
  documentationUrl: 'https://keenable.ai/docs',
  connected: false,
  headerName: 'X-API-Key',
  valuePrefix: '',
  placement: 'header',
  source: 'registry',
  description: 'Optional Keenable API key.',
};

describe('ConnectorApiKeyForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the server which header to send, then tests and saves the key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, spec))
      .mockResolvedValueOnce(
        jsonResponse(201, { toolCount: 2, toolNames: ['web_search', 'fetch_page'] }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const onConnected = vi.fn();
    const user = userEvent.setup();

    render(<ConnectorApiKeyForm connectorId={RECORD_ID} onConnected={onConnected} />);

    expect(await screen.findByText('X-API-Key')).toBeVisible();
    expect(screen.getByText('Optional Keenable API key.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Where to find this key' })).toHaveAttribute(
      'href',
      'https://keenable.ai/docs',
    );
    const submit = screen.getByRole('button', { name: 'Test and save' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('API key'), 'kb_example');
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() =>
      expect(onConnected).toHaveBeenCalledWith({
        toolCount: 2,
        toolNames: ['web_search', 'fetch_page'],
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      credentialsPath(RECORD_ID),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-csrf-token': 'csrf-token' }),
        body: JSON.stringify({ apiKey: 'kb_example' }),
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Connected. 2 tools discovered.');
    expect(screen.getByText('web_search')).toBeVisible();
    expect(invalidate).toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('kb_example');
  });

  it('shows the server sentence when the key is rejected and keeps the form open', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, spec))
        .mockResolvedValueOnce(
          jsonResponse(400, {
            error: { code: 'VALIDATION_ERROR', message: 'Keenable rejected that API key.' },
          }),
        ),
    );
    const user = userEvent.setup();

    render(<ConnectorApiKeyForm connectorId={RECORD_ID} />);

    await user.type(await screen.findByLabelText('API key'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Test and save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Keenable rejected that API key.');
    expect(screen.getByRole('button', { name: 'Test and save' })).toBeEnabled();
  });

  it('offers to replace a key that is already saved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { ...spec, connected: true })),
    );

    render(<ConnectorApiKeyForm connectorId={RECORD_ID} />);

    expect(await screen.findByText(/already saved/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Test and replace' })).toBeInTheDocument();
  });

  it('reports a failed requirements lookup with a retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(404, { error: { message: 'Connector directory entry not found' } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, spec));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<ConnectorApiKeyForm connectorId={RECORD_ID} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Connector directory entry not found',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('API key')).toBeInTheDocument();
  });
});
