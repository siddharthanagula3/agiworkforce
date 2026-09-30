import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CopyrightNoticeQueuePanel from './CopyrightNoticeQueuePanel';

function respondWith(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        ({
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
        }) as unknown as Response,
    ),
  );
}

describe('CopyrightNoticeQueuePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the load error instead of crashing when a response carries no notice list', async () => {
    respondWith({});

    render(<CopyrightNoticeQueuePanel />);

    expect(await screen.findByText('Notices could not be loaded.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Rights notices' })).toBeNull();
  });

  it('shows the empty queue when the list is empty', async () => {
    respondWith({ notices: [] });

    render(<CopyrightNoticeQueuePanel />);

    expect(await screen.findByText('No notice is waiting for a decision.')).toBeTruthy();
    expect(screen.queryByText('Notices could not be loaded.')).toBeNull();
  });
});
