import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalCaptureAnnotator } from './LocalCaptureAnnotator';

const CAPTURE = 'data:image/png;base64,AAAA';
const PICTURE = { width: 1200, height: 800 };

const context = {
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  rect: vi.fn(),
  ellipse: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  strokeStyle: '',
  fillStyle: '',
  lineCap: '',
  lineJoin: '',
  lineWidth: 0,
  font: '',
  textBaseline: '',
};

let pictureLoads = true;

class FakePicture {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = PICTURE.width;
  naturalHeight = PICTURE.height;

  set src(_value: string) {
    queueMicrotask(() => (pictureLoads ? this.onload?.() : this.onerror?.()));
  }
}

function renderAnnotator() {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  render(
    <LocalCaptureAnnotator image={CAPTURE} name="capture.png" onAdd={onAdd} onClose={onClose} />,
  );
  return { onAdd, onClose };
}

async function loadedCanvas(): Promise<HTMLCanvasElement> {
  const canvas = screen.getByLabelText<HTMLCanvasElement>('Capture to draw on');
  await screen.findByRole('button', { name: 'Add to chat' });
  await vi.waitFor(() => expect(canvas.width).toBe(PICTURE.width));
  return canvas;
}

function drag(canvas: HTMLCanvasElement, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(canvas, { clientX: from[0], clientY: from[1], pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: to[0], clientY: to[1], pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: to[0], clientY: to[1], pointerId: 1 });
}

beforeEach(() => {
  vi.clearAllMocks();
  pictureLoads = true;
  vi.stubGlobal('Image', FakePicture);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) {
    callback(new Blob(['png'], { type: 'image/png' }));
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 600,
    bottom: 400,
    width: 600,
    height: 400,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('marking up a capture', () => {
  it('opens the capture at its own size and draws it', async () => {
    renderAnnotator();

    const canvas = await loadedCanvas();

    expect(canvas.height).toBe(PICTURE.height);
    await vi.waitFor(() => expect(context.drawImage).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Add to chat' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Undo the last mark' })).toBeDisabled();
  });

  it('says so when the capture cannot be opened, and adds nothing', async () => {
    pictureLoads = false;
    const { onAdd } = renderAnnotator();

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be opened');
    expect(screen.getByRole('button', { name: 'Add to chat' })).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('draws a pen stroke in picture coordinates and takes it back', async () => {
    const user = userEvent.setup();
    renderAnnotator();
    const canvas = await loadedCanvas();

    drag(canvas, [10, 10], [300, 200]);

    expect(context.moveTo).toHaveBeenCalledWith(20, 20);
    expect(context.lineTo).toHaveBeenCalledWith(600, 400);
    const undo = screen.getByRole('button', { name: 'Undo the last mark' });
    expect(undo).toBeEnabled();

    await user.click(undo);
    expect(undo).toBeDisabled();
  });

  it('draws the chosen shape', async () => {
    const user = userEvent.setup();
    renderAnnotator();
    const canvas = await loadedCanvas();

    await user.click(screen.getByRole('button', { name: 'Rectangle' }));
    drag(canvas, [50, 50], [150, 100]);
    expect(context.rect).toHaveBeenCalledWith(100, 100, 200, 100);

    await user.click(screen.getByRole('button', { name: 'Choose a shape' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Ellipse' }));
    drag(canvas, [0, 0], [100, 100]);
    expect(context.ellipse).toHaveBeenCalledWith(100, 100, 100, 100, 0, 0, Math.PI * 2);
  });

  it('places a typed note where the capture was clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderAnnotator();
    const canvas = await loadedCanvas();

    await user.click(screen.getByRole('button', { name: 'Text' }));
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 50, pointerId: 1 });
    await user.type(await screen.findByRole('textbox', { name: 'Type a note' }), 'Too wide{Enter}');

    expect(context.fillText).toHaveBeenCalledWith('Too wide', 200, 100);
    expect(screen.queryByRole('textbox', { name: 'Type a note' })).not.toBeInTheDocument();

    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    await user.type(await screen.findByRole('textbox', { name: 'Type a note' }), 'dropped{Escape}');

    expect(context.fillText).not.toHaveBeenCalledWith(
      'dropped',
      expect.anything(),
      expect.anything(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hands back a picture under the name it was given', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderAnnotator();
    await loadedCanvas();

    await user.click(screen.getByRole('button', { name: 'Add to chat' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [file] = onAdd.mock.calls[0] as [File];
    expect(file.name).toBe('capture.png');
    expect(file.type).toBe('image/png');
  });

  it('closes from its button and on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderAnnotator();
    await loadedCanvas();

    await user.click(screen.getByRole('button', { name: 'Close without adding' }));
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('offers six colours and three line weights', async () => {
    const user = userEvent.setup();
    renderAnnotator();
    await loadedCanvas();

    const colours = screen.getAllByRole('radio');
    expect(colours).toHaveLength(6);
    await user.click(screen.getByRole('radio', { name: 'Blue' }));
    expect(screen.getByRole('radio', { name: 'Blue' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Line weight: Medium' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Bold' }));
    expect(screen.getByRole('button', { name: 'Line weight: Bold' })).toBeInTheDocument();
  });
});
