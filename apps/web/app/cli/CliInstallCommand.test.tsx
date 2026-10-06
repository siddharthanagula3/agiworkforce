import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliInstallCommand } from './CliInstallCommand';

const fetchMock = vi.fn<typeof fetch>();

function pendingResponse() {
  let complete: (response: Response) => void = () => undefined;
  const response = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  return { response, complete };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CLI release availability', () => {
  it('exposes a busy status until the release response arrives and keeps an unpublished command unavailable', async () => {
    const pending = pendingResponse();
    fetchMock.mockReturnValueOnce(pending.response);
    render(<CliInstallCommand />);

    expect(
      screen.getByRole('status', { name: 'Checking for a signed CLI release' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(/curl -fsSL/)).not.toBeInTheDocument();
    await act(async () => pending.complete(Response.json({}, { status: 404 })));

    expect(screen.getByRole('status')).toHaveTextContent('No signed release is published yet');
    expect(screen.queryByLabelText('Checking for a signed CLI release')).not.toBeInTheDocument();
    expect(screen.queryByText(/curl -fsSL/)).not.toBeInTheDocument();
  });

  it('shows the version returned by a published release after loading finishes', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ version: '1.2.3' }));
    render(<CliInstallCommand />);

    expect(await screen.findByText(/agi 1\.2\.3/)).toBeInTheDocument();
    expect(screen.getByText(/curl -fsSL/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Checking for a signed CLI release')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument();
  });

  it('lets a failed lookup retry while exposing the new pending request', async () => {
    const retry = pendingResponse();
    fetchMock.mockRejectedValueOnce(new Error('Fixture connection failure'));
    fetchMock.mockReturnValueOnce(retry.response);
    render(<CliInstallCommand />);

    const button = await screen.findByRole('button', { name: 'Check again' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'We could not check the CLI release channel.',
    );
    expect(screen.queryByText(/curl -fsSL/)).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(
      screen.getByRole('status', { name: 'Checking for a signed CLI release' }),
    ).toHaveAttribute('aria-busy', 'true');
    await act(async () => retry.complete(Response.json({}, { status: 404 })));

    expect(screen.getByRole('status')).toHaveTextContent('No signed release is published yet');
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument();
  });
});
