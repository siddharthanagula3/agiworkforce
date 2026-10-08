import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MediaGenerationPlaceholder } from '../MediaGenerationPlaceholder';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));

const TASK_ID = '4d1a9b7e-2c3f-4a58-9e11-6b7c8d9e0f12';
const FRAME_ID = 71;
const PANEL = { width: 280, height: 140 };
const DOT_PITCH_PX = 14;
const DOTS_PER_PAINT = (PANEL.width / DOT_PITCH_PX) * (PANEL.height / DOT_PITCH_PX);

const fetchMock = vi.fn();
const context = {
  clearRect: vi.fn(),
  setTransform: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  fillStyle: '',
  globalAlpha: 1,
};

let reducedMotion = false;
let scheduledFrames: FrameRequestCallback[] = [];
let viewportCallbacks: IntersectionObserverCallback[] = [];
let viewportDisconnects = 0;
const requestFrame = vi.fn((callback: FrameRequestCallback) => {
  scheduledFrames.push(callback);
  return FRAME_ID;
});
const cancelFrame = vi.fn();

function ok(body: Record<string, unknown>) {
  return { ok: true, json: async () => body } as unknown as Response;
}

function setTabVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function setOnScreen(isIntersecting: boolean) {
  for (const callback of viewportCallbacks) {
    callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  }
}

beforeEach(() => {
  fetchMock.mockReset();
  reducedMotion = false;
  scheduledFrames = [];
  viewportCallbacks = [];
  viewportDisconnects = 0;
  requestFrame.mockClear();
  cancelFrame.mockClear();
  for (const call of [context.clearRect, context.arc, context.fill]) call.mockClear();

  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: reducedMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        viewportCallbacks.push(callback);
      }
      observe() {}
      disconnect() {
        viewportDisconnects += 1;
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(PANEL as DOMRect);
});

afterEach(() => {
  cleanup();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MediaGenerationPlaceholder · what it says while the turn runs', () => {
  it.each([
    ['image', 'image-card', 'Creating your image'],
    ['video', 'video-player', 'Creating your video'],
  ] as const)('names the %s being made in a status region', (category, frame, label) => {
    render(<MediaGenerationPlaceholder category={category} frame={frame} />);
    expect(screen.getByRole('status')).toHaveTextContent(label);
    expect(screen.getByTestId('media-generation-placeholder')).toHaveAttribute(
      'data-category',
      category,
    );
  });

  it('counts elapsed time from the start of the turn, outside the status region', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T10:01:05.000Z'));
    render(
      <MediaGenerationPlaceholder
        category="video"
        frame="video-player"
        startedAt="2026-10-08T10:00:00.000Z"
      />,
    );

    const placeholder = screen.getByTestId('media-generation-placeholder');
    expect(placeholder).toHaveTextContent('Elapsed 1m 05s');
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(placeholder).toHaveTextContent('Elapsed 1m 08s');
    expect(screen.getByRole('status').textContent).toBe('Creating your video');
    expect(placeholder.querySelectorAll('[aria-live]')).toHaveLength(0);
  });

  it('shows the percentage the route reported', () => {
    render(<MediaGenerationPlaceholder category="video" frame="video-player" progress={42} />);
    const pill = screen.getByRole('progressbar', { name: 'Video progress' });
    expect(pill).toHaveTextContent('42%');
    expect(pill).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByRole('status')).not.toContainElement(pill);
  });

  it('clamps a percentage reported outside the 0 to 100 range', () => {
    render(<MediaGenerationPlaceholder category="video" frame="video-player" progress={140} />);
    expect(screen.getByRole('progressbar')).toHaveTextContent('100%');
  });

  it('shows no percentage when the route reports none', () => {
    render(<MediaGenerationPlaceholder category="image" frame="image-card" />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByTestId('media-generation-placeholder').textContent).not.toContain('%');
  });

  it('reserves the shape of the media that is coming', () => {
    const { rerender } = render(<MediaGenerationPlaceholder category="image" frame="image-card" />);
    const frame = () => screen.getByTestId('media-generation-frame').getAttribute('style') ?? '';
    expect(frame()).toContain('aspect-ratio: 1');

    rerender(
      <MediaGenerationPlaceholder category="video" frame="video-player" aspectRatio="9:16" />,
    );
    expect(frame()).toContain(`aspect-ratio: ${9 / 16}`);
    expect(frame()).toContain('width: min(100%, 216px)');

    rerender(
      <MediaGenerationPlaceholder category="video" frame="video-player" aspectRatio="auto" />,
    );
    expect(frame()).toContain(`aspect-ratio: ${16 / 9}`);

    rerender(
      <MediaGenerationPlaceholder category="image" frame="inline-image" aspectRatio="1024:1024" />,
    );
    expect(frame()).toContain('width: min(100%, 512px)');
  });
});

describe('MediaGenerationPlaceholder · the dot field', () => {
  it('paints a moving field while the panel is on screen', () => {
    render(<MediaGenerationPlaceholder category="video" frame="video-player" />);
    expect(requestFrame).toHaveBeenCalledTimes(1);

    scheduledFrames[0]?.(1_000);
    expect(context.arc).toHaveBeenCalledTimes(DOTS_PER_PAINT);
    expect(requestFrame).toHaveBeenCalledTimes(2);

    scheduledFrames[1]?.(2_000);
    expect(context.arc).toHaveBeenCalledTimes(DOTS_PER_PAINT * 2);
  });

  it('paints one still field and schedules nothing under reduced motion', () => {
    reducedMotion = true;
    render(<MediaGenerationPlaceholder category="image" frame="image-card" />);

    expect(context.arc).toHaveBeenCalledTimes(DOTS_PER_PAINT);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Creating your image');
  });

  it('stops while the tab is hidden and resumes when it is shown', () => {
    render(<MediaGenerationPlaceholder category="video" frame="video-player" />);
    requestFrame.mockClear();

    setTabVisibility('hidden');
    expect(cancelFrame).toHaveBeenCalledWith(FRAME_ID);
    expect(requestFrame).not.toHaveBeenCalled();

    setTabVisibility('visible');
    expect(requestFrame).toHaveBeenCalledTimes(1);
  });

  it('stops while the panel is scrolled out of view', () => {
    render(<MediaGenerationPlaceholder category="video" frame="video-player" />);
    requestFrame.mockClear();

    setOnScreen(false);
    expect(cancelFrame).toHaveBeenCalledWith(FRAME_ID);
    expect(requestFrame).not.toHaveBeenCalled();

    setOnScreen(true);
    expect(requestFrame).toHaveBeenCalledTimes(1);
  });

  it('keeps one loop across the once-a-second clock re-render', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    render(<MediaGenerationPlaceholder category="video" frame="video-player" />);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId('media-generation-placeholder')).toHaveTextContent('Elapsed 5s');
    expect(requestFrame).toHaveBeenCalledTimes(1);
  });

  it('cancels its frame and observers when the turn ends', () => {
    const { unmount } = render(
      <MediaGenerationPlaceholder category="video" frame="video-player" />,
    );
    cancelFrame.mockClear();

    unmount();
    expect(cancelFrame).toHaveBeenCalledWith(FRAME_ID);
    expect(viewportDisconnects).toBe(1);
  });
});

describe('MediaGenerationPlaceholder · stopping a durable video job', () => {
  it('offers no stop control when there is no job to stop', () => {
    render(<MediaGenerationPlaceholder category="video" frame="video-player" />);
    expect(screen.queryByRole('button', { name: /stop generating/i })).toBeNull();
  });

  it('posts the task id to the cancel route', async () => {
    fetchMock.mockResolvedValue(ok({ success: true, message: 'Cancellation requested.' }));
    const user = userEvent.setup();
    render(<MediaGenerationPlaceholder category="video" frame="video-player" taskId={TASK_ID} />);

    await user.click(screen.getByRole('button', { name: /stop generating/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/media/video/cancel');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ task_id: TASK_ID });
  });

  it("repeats the route's own wording instead of claiming the job stopped", async () => {
    const honest =
      'Cancellation was recorded, but this provider exposes no verified cancellation operation.';
    fetchMock.mockResolvedValue(ok({ success: true, message: honest }));
    const user = userEvent.setup();
    render(<MediaGenerationPlaceholder category="video" frame="video-player" taskId={TASK_ID} />);

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
    render(<MediaGenerationPlaceholder category="video" frame="video-player" taskId={TASK_ID} />);

    await user.click(screen.getByRole('button', { name: /stop generating/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That job already finished.');
    expect(screen.getByRole('button', { name: /stop generating/i })).toBeTruthy();
  });

  it('reports a network failure rather than silently doing nothing', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<MediaGenerationPlaceholder category="video" frame="video-player" taskId={TASK_ID} />);

    await user.click(screen.getByRole('button', { name: /stop generating/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });
});
