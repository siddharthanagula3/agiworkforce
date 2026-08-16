import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VideoGenerationPlaceholder } from '../VideoGenerationPlaceholder';

/**
 * /api/media/video/cancel was fully implemented, tested, and called by nothing.
 * A video runs as a durable background job, so the composer's Stop button —
 * driven by the SSE chat stream — never appears for it. There was no way to
 * stop a generation at all.
 */

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TASK_ID = '4d1a9b7e-2c3f-4a58-9e11-6b7c8d9e0f12';

function ok(body: Record<string, unknown>) {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe('VideoGenerationPlaceholder · stopping a generation', () => {
  it('offers no stop control when there is no job to stop', () => {
    render(<VideoGenerationPlaceholder />);
    expect(screen.queryByRole('button', { name: /stop generating/i })).toBeNull();
  });

  it('posts the task id to the cancel route', async () => {
    fetchMock.mockResolvedValue(ok({ success: true, message: 'Cancellation requested.' }));
    const user = userEvent.setup();
    render(<VideoGenerationPlaceholder taskId={TASK_ID} />);

    await user.click(screen.getByRole('button', { name: /stop generating/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/media/video/cancel');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ task_id: TASK_ID });
  });

  it("repeats the route's own wording instead of claiming the job stopped", async () => {
    // Some providers expose no verified cancellation. The route says so; the UI
    // must not overwrite that with a cheerful "Cancelled".
    const honest =
      'Cancellation was recorded, but this provider exposes no verified cancellation operation.';
    fetchMock.mockResolvedValue(ok({ success: true, message: honest }));
    const user = userEvent.setup();
    render(<VideoGenerationPlaceholder taskId={TASK_ID} />);

    await user.click(screen.getByRole('button', { name: /stop generating/i }));

    expect(await screen.findByText(honest)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /stop generating/i })).toBeNull();
  });

  it('says so and stays clickable when the request fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'That job already finished.' } }),
    } as unknown as Response);
    const user = userEvent.setup();
    render(<VideoGenerationPlaceholder taskId={TASK_ID} />);

    await user.click(screen.getByRole('button', { name: /stop generating/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That job already finished.');
    expect(screen.getByRole('button', { name: /stop generating/i })).toBeTruthy();
  });

  it('reports a network failure rather than silently doing nothing', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<VideoGenerationPlaceholder taskId={TASK_ID} />);

    await user.click(screen.getByRole('button', { name: /stop generating/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });
});
