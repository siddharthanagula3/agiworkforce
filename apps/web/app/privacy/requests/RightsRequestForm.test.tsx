import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RightsRequestForm } from './RightsRequestForm';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/Which right are you exercising/i), {
    target: { value: 'access' },
  });
  fireEvent.change(screen.getByLabelText(/Email address we should reply to/i), {
    target: { value: 'subject@example.test' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Record my request/i }));
}

describe('RightsRequestForm', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('matches the API contact-email length boundary in the browser', () => {
    render(<RightsRequestForm />);

    expect(screen.getByLabelText(/Email address we should reply to/i)).toHaveAttribute(
      'maxlength',
      '254',
    );
  });

  it('does not claim nothing was stored when the response is lost, and retries with the same token', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network dropped')).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ reference: 'DPDP-ABC1234567', operatorNotified: true }),
    });
    render(<RightsRequestForm />);

    fillAndSubmit();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/nothing was stored/i);
    expect(alert.textContent).toMatch(/could not confirm/i);

    fireEvent.click(screen.getByRole('button', { name: /Record my request/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const tokens = fetchMock.mock.calls.map(
      (call) => JSON.parse((call[1] as { body: string }).body).submissionToken as string,
    );
    expect(tokens[0]).toBeTruthy();
    expect(tokens[1]).toBe(tokens[0]);
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
