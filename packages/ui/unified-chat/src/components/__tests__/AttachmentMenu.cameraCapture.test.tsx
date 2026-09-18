import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function fakeStream() {
  return { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
}

function renderMenu(onScreenshot?: (file: File) => void) {
  return render(
    <CapabilityProvider platform="desktop">
      <AttachmentMenu {...baseProps} onScreenshot={onScreenshot}>
        <button type="button">Plus</button>
      </AttachmentMenu>
    </CapabilityProvider>,
  );
}

beforeEach(() => {
  stopTrack.mockClear();
  getUserMedia = vi.fn(async () => fakeStream());
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AttachmentMenu, webcam capture', () => {
  it('offers "Take a photo" alongside screen capture when the host wires a capture sink', () => {
    renderMenu(vi.fn());

    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Take a screenshot' })).toBeTruthy();
  });

  it('hides the item when no host sink exists rather than rendering a dead control', () => {
    renderMenu(undefined);

    expect(screen.queryByRole('button', { name: 'Take a photo' })).toBeNull();
  });

  it('asks for no camera access until the item is clicked, then video only', async () => {
    renderMenu(vi.fn());
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false, video: expect.anything() }),
    );
    expect(screen.getByRole('dialog', { name: 'Take a photo' })).toBeTruthy();
  });

  it('delivers the captured frame to the host sink as a compressed JPEG File', async () => {
    const onScreenshot = vi.fn();
    const drawImage = vi.fn();
    const toBlob = vi.fn((cb: (blob: Blob) => void, type: string) =>
      cb(new Blob(['pixels'], { type })),
    );
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => ({ drawImage }),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: toBlob,
    });

    renderMenu(onScreenshot);
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));

    const capture = (await screen.findByRole('button', {
      name: /capture/i,
    })) as HTMLButtonElement;
    await waitFor(() => expect(capture.disabled).toBe(false));
    fireEvent.click(capture);

    expect(drawImage).toHaveBeenCalled();
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
    expect(onScreenshot).toHaveBeenCalledTimes(1);
    const file = onScreenshot.mock.calls[0]?.[0] as File;
    expect(file.type).toBe('image/jpeg');
    expect(file.name.endsWith('.jpg')).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Take a photo' })).toBeNull();
  });

  it('cannot capture before the stream is ready', async () => {
    const onScreenshot = vi.fn();
    getUserMedia.mockImplementation(() => new Promise<MediaStream>(() => {}));

    renderMenu(onScreenshot);
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));

    const capture = (await screen.findByRole('button', {
      name: /capture/i,
    })) as HTMLButtonElement;
    expect(capture.disabled).toBe(true);
    fireEvent.click(capture);
    expect(onScreenshot).not.toHaveBeenCalled();
  });

  it('stops every track when the overlay is cancelled', async () => {
    renderMenu(vi.fn());
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(stopTrack).toHaveBeenCalled());
    expect(screen.queryByRole('dialog', { name: 'Take a photo' })).toBeNull();
  });

  it('stops a stream that arrives after the overlay closed', async () => {
    let resolveStream: ((stream: MediaStream) => void) | undefined;
    getUserMedia.mockImplementation(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        }),
    );

    renderMenu(vi.fn());
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    resolveStream?.(fakeStream());

    await waitFor(() => expect(stopTrack).toHaveBeenCalled());
  });

  it('explains a blocked permission instead of failing silently', async () => {
    getUserMedia.mockRejectedValue(new Error('NotAllowedError'));

    renderMenu(vi.fn());
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));

    expect(await screen.findByText(/camera access was blocked/i)).toBeTruthy();
  });

  it('names a camera another app is holding rather than blaming permissions', async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('busy'), { name: 'NotReadableError' }));

    renderMenu(vi.fn());
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));

    expect(await screen.findByText(/in use by another app/i)).toBeTruthy();
  });

  it('offers no camera switch when the device has one camera', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: vi.fn(async () => [{ kind: 'videoinput', deviceId: 'front' }]),
      },
    });

    renderMenu(vi.fn());
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Take a photo' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /switch to rear camera/i })).toBeNull();
  });

  it('switches to the rear camera and stops the front one', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: vi.fn(async () => [
          { kind: 'videoinput', deviceId: 'front' },
          { kind: 'videoinput', deviceId: 'rear' },
          { kind: 'audioinput', deviceId: 'mic' },
        ]),
      },
    });

    renderMenu(vi.fn());
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'user' }, audio: false });

    const switchCamera = await screen.findByRole('button', { name: /switch to rear camera/i });
    fireEvent.click(switchCamera);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: { facingMode: 'environment' },
      audio: false,
    });
    expect(stopTrack).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: /switch to front camera/i })).toBeTruthy();
  });
});
