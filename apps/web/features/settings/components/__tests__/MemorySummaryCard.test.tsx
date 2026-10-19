import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string> = {}) => ({
    ...headers,
    'x-csrf-token': 'test-token',
  })),
}));

import { MemorySummaryCard } from '../MemorySummaryCard';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('MemorySummaryCard', () => {
  it('writes a summary only when asked, then shows who you are and what you prefer', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          summary: { about: [], preferences: [] },
          memoryCount: 3,
          generatedAt: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          summary: {
            about: ['You run a two-person design studio.'],
            preferences: ['You want answers in British English.'],
          },
          memoryCount: 3,
          generatedAt: '2026-10-19T09:00:00.000Z',
        }),
      );
    const user = userEvent.setup();

    render(<MemorySummaryCard memoryCount={3} />);

    const write = await screen.findByRole('button', { name: 'Summarise my memories' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1]?.method).toBeUndefined();

    await user.click(write);

    expect(await screen.findByText('You run a two-person design studio.')).toBeVisible();
    expect(screen.getByText('You want answers in British English.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'About you' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Update summary' })).toBeVisible();
    const [, init] = fetchMock.mock.calls[1]!;
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'test-token' });
  });

  it('says there is nothing to summarise when no memory is saved', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ summary: { about: [], preferences: [] }, memoryCount: 0, generatedAt: null }),
    );

    render(<MemorySummaryCard memoryCount={0} />);

    expect(
      await screen.findByText('Nothing is saved yet, so there is nothing to summarise.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Summarise my memories' })).toBeNull();
  });

  it('keeps the card usable and says why when the summary cannot be written', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          summary: { about: [], preferences: [] },
          memoryCount: 2,
          generatedAt: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Busy, try later.' } }, 503),
      );
    const user = userEvent.setup();

    render(<MemorySummaryCard memoryCount={2} />);
    await user.click(await screen.findByRole('button', { name: 'Summarise my memories' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Busy, try later.');
    expect(screen.getByRole('button', { name: 'Summarise my memories' })).toBeEnabled();
  });
});
