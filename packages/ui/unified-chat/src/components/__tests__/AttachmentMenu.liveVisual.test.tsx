import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttachmentMenu } from '../AttachmentMenu';
import { CapabilityProvider } from '../../lib/capabilities';

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  onAddFiles: vi.fn(),
  researchEnabled: false,
  onResearchToggle: vi.fn(),
};

const stopTrack = vi.fn();
let getUserMedia: ReturnType<typeof vi.fn>;
let getDisplayMedia: ReturnType<typeof vi.fn>;

function fakeStream() {
  const track = {
    kind: 'video',
    readyState: 'live',
    enabled: true,
    stop: stopTrack,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

function renderMenu(props: Record<string, unknown> = {}) {
  return render(
    <CapabilityProvider platform="desktop">
      <AttachmentMenu {...baseProps} onScreenshot={vi.fn()} {...props}>
        <button type="button">Plus</button>
      </AttachmentMenu>
    </CapabilityProvider>,
  );
}

function paintableCanvas(shade: () => number) {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4);
        const value = shade();
        for (let index = 0; index < width * height; index += 1) {
          const offset = index * 4;
          const pixel = index % width < width / 2 ? value : 255 - value;
          data[offset] = pixel;
          data[offset + 1] = pixel;
          data[offset + 2] = pixel;
          data[offset + 3] = 255;
        }
        return { data };
      },
    }),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: () => `data:image/jpeg;base64,${btoa('pixels')}`,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
    configurable: true,
    get: () => 32,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
    configurable: true,
    get: () => 32,
  });
}

beforeEach(() => {
  stopTrack.mockClear();
  getUserMedia = vi.fn(async () => fakeStream());
  getDisplayMedia = vi.fn(async () => fakeStream());
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, getDisplayMedia, enumerateDevices: vi.fn(async () => []) },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AttachmentMenu, live visual session', () => {
  it('offers a live camera and a live screen entry beside the still captures', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: 'Share live camera' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share live screen' })).toBeTruthy();
  });

  it('renders no live entry when the host wires no capture sink', () => {
    renderMenu({ onScreenshot: undefined });

    expect(screen.queryByRole('button', { name: 'Share live camera' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share live screen' })).toBeNull();
  });

  it('asks for no source until the entry is clicked, then the one it names', async () => {
    renderMenu();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(getDisplayMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Share live screen' }));

    await waitFor(() => expect(getDisplayMedia).toHaveBeenCalled());
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Live screen' })).toBeTruthy();
  });

  it('marks the source live only once it is actually capturing', async () => {
    let release: ((stream: MediaStream) => void) | undefined;
    getUserMedia.mockImplementation(
      () =>
        new Promise<MediaStream>((resolve) => {
          release = resolve;
        }),
    );

    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Share live camera' }));

    expect((await screen.findByRole('status')).textContent).toBe('Starting…');

    await act(async () => {
      release?.(fakeStream());
    });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Sharing live'));
  });

  it('samples frames on the interval and attaches only the one the user keeps', async () => {
    vi.useFakeTimers();
    let shade = 10;
    paintableCanvas(() => shade);
    const onScreenshot = vi.fn();
    const onLiveVisualFrame = vi.fn();

    renderMenu({ onScreenshot, onLiveVisualFrame });
    fireEvent.click(screen.getByRole('button', { name: 'Share live camera' }));
    await act(async () => {
      await Promise.resolve();
    });

    const attach = screen.getByRole('button', {
      name: /attach latest frame/i,
    }) as HTMLButtonElement;
    expect(attach.disabled).toBe(true);
    expect(onLiveVisualFrame).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(onLiveVisualFrame).toHaveBeenCalledTimes(1);

    shade = 240;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(onLiveVisualFrame).toHaveBeenCalledTimes(2);
    expect(onScreenshot).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /attach latest frame/i }));
    expect(onScreenshot).toHaveBeenCalledTimes(1);
    expect((onScreenshot.mock.calls[0]?.[0] as File).type).toBe('image/jpeg');
    expect(screen.queryByRole('dialog', { name: 'Live camera' })).toBeNull();
  });

  it('keeps a still scene out of the buffer instead of resending it', async () => {
    vi.useFakeTimers();
    paintableCanvas(() => 90);
    const onLiveVisualFrame = vi.fn();

    renderMenu({ onLiveVisualFrame });
    fireEvent.click(screen.getByRole('button', { name: 'Share live camera' }));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    expect(onLiveVisualFrame).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/1 kept · 3 skipped/)).toBeTruthy();
  });

  it('stops every track when the user stops sharing', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Share live camera' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));

    await waitFor(() => expect(stopTrack).toHaveBeenCalled());
    expect(screen.queryByRole('dialog', { name: 'Live camera' })).toBeNull();
  });

  it('names a camera held by another app instead of blaming permissions', async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('busy'), { name: 'NotReadableError' }));

    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Share live camera' }));

    const status = await screen.findByRole('status');
    await waitFor(() => expect(status.textContent).toMatch(/in use by another app/i));
  });
});
