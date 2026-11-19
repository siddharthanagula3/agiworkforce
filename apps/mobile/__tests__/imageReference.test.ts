import { MANAGED_MEDIA_IMAGE_REF_MAX_B64_LENGTH } from '@agiworkforce/cloud-contracts';

const mockReadAsString = jest.fn();
const mockDeleteAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: (...args: unknown[]) => mockReadAsString(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

interface FakeRef {
  width: number;
  height: number;
  release: jest.Mock;
  saveAsync: jest.Mock;
}

const mockContexts: { source: unknown; resize: jest.Mock; release: jest.Mock }[] = [];
let mockLoaded: FakeRef;
let mockResized: FakeRef;
const mockManipulate = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: (...args: unknown[]) => mockManipulate(...args) },
}));

import {
  REFERENCE_IMAGE_TOO_LARGE,
  ReferenceImageTooLargeError,
  readReferenceImageBase64,
} from '../src/features/image/services/imageReference';

function jpegBase64(width: number, height: number, payloadChars = 0): string {
  const bytes = new Uint8Array(30);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  bytes[7] = height >> 8;
  bytes[8] = height & 0xff;
  bytes[9] = width >> 8;
  bytes[10] = width & 0xff;
  const header = Buffer.from(bytes).toString('base64');
  return header + 'A'.repeat(payloadChars);
}

function fakeRef(width: number, height: number, sizes: Record<number, number>): FakeRef {
  return {
    width,
    height,
    release: jest.fn(),
    saveAsync: jest.fn(async ({ compress }: { compress: number }) => ({
      uri: `file:///cache/ImageManipulator/${compress}.jpg`,
      width,
      height,
      base64: 'B'.repeat(sizes[compress] ?? 1),
    })),
  };
}

function photo(width: number, height: number, sizes: Record<number, number>) {
  mockLoaded = fakeRef(width, height, sizes);
  mockResized = fakeRef(
    width >= height ? 2048 : Math.round((2048 * width) / height),
    width >= height ? Math.round((2048 * height) / width) : 2048,
    sizes,
  );
}

const LIMIT = MANAGED_MEDIA_IMAGE_REF_MAX_B64_LENGTH;
const OVER = LIMIT + 4;

describe('readReferenceImageBase64', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContexts.length = 0;
    mockDeleteAsync.mockResolvedValue(undefined);
    mockManipulate.mockImplementation((source: unknown) => {
      const context = {
        source,
        resize: jest.fn(),
        release: jest.fn(),
        renderAsync: jest.fn(async () => (source === mockLoaded ? mockResized : mockLoaded)),
      };
      context.resize.mockReturnValue(context);
      mockContexts.push(context);
      return context;
    });
  });

  it('sends a photo that already fits as it is, without opening the image encoder', async () => {
    const original = jpegBase64(1600, 1200, 400);
    mockReadAsString.mockResolvedValue(original);

    await expect(readReferenceImageBase64('file:///photo.jpg')).resolves.toBe(original);

    expect(mockManipulate).not.toHaveBeenCalled();
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('rejects a file that cannot be read', async () => {
    mockReadAsString.mockResolvedValue('');

    await expect(readReferenceImageBase64('file:///gone.jpg')).rejects.toThrow(
      'The reference image could not be read from this device.',
    );
  });

  it('shrinks a 12 MP photo whose long edge is over the limit to 2048 px and sends the smaller copy', async () => {
    mockReadAsString.mockResolvedValue(jpegBase64(4032, 3024, 2_000_000));
    photo(4032, 3024, { 0.85: 900_000 });

    const result = await readReferenceImageBase64('file:///12mp.jpg');

    expect(result).toBe('B'.repeat(900_000));
    expect(mockContexts[0]!.source).toBe('file:///12mp.jpg');
    expect(mockContexts[1]!.source).toBe(mockLoaded);
    expect(mockContexts[1]!.resize).toHaveBeenCalledWith({ width: 2048 });
    expect(mockLoaded.saveAsync).not.toHaveBeenCalled();
    expect(mockResized.saveAsync).toHaveBeenCalledTimes(1);
    expect(mockResized.saveAsync).toHaveBeenCalledWith({
      format: 'jpeg',
      compress: 0.85,
      base64: true,
    });
  });

  it('shrinks a 48 MP landscape photo to 2048 px wide', async () => {
    mockReadAsString.mockResolvedValue(jpegBase64(8064, 6048, OVER));
    photo(8064, 6048, { 0.85: 1_500_000 });

    await readReferenceImageBase64('file:///48mp.jpg');

    expect(mockContexts[1]!.resize).toHaveBeenCalledWith({ width: 2048 });
  });

  it('shrinks a 48 MP portrait photo to 2048 px tall', async () => {
    mockReadAsString.mockResolvedValue(jpegBase64(6048, 8064, OVER));
    photo(6048, 8064, { 0.85: 1_500_000 });

    await readReferenceImageBase64('file:///48mp-portrait.jpg');

    expect(mockContexts[1]!.resize).toHaveBeenCalledWith({ height: 2048 });
  });

  it('steps the quality down until the copy fits, then stops', async () => {
    mockReadAsString.mockResolvedValue(jpegBase64(4032, 3024, OVER));
    photo(4032, 3024, { 0.85: OVER, 0.7: OVER, 0.55: LIMIT - 8 });

    const result = await readReferenceImageBase64('file:///dense.jpg');

    expect(result).toBe('B'.repeat(LIMIT - 8));
    expect(mockResized.saveAsync.mock.calls.map(([options]) => options.compress)).toEqual([
      0.85, 0.7, 0.55,
    ]);
  });

  it('keeps the 0.85 copy when it fits and does not try a lower quality', async () => {
    mockReadAsString.mockResolvedValue(jpegBase64(4032, 3024, OVER));
    photo(4032, 3024, { 0.85: LIMIT });

    await readReferenceImageBase64('file:///fits.jpg');

    expect(mockResized.saveAsync).toHaveBeenCalledTimes(1);
  });

  it('refuses with the shrink message only after every quality is too large', async () => {
    mockReadAsString.mockResolvedValue(jpegBase64(4032, 3024, OVER));
    photo(4032, 3024, { 0.85: OVER, 0.7: OVER, 0.55: OVER });

    const attempt = readReferenceImageBase64('file:///huge.jpg');

    await expect(attempt).rejects.toBeInstanceOf(ReferenceImageTooLargeError);
    await expect(attempt).rejects.toThrow(
      'This image is too large to use as a reference, even after shrinking it.',
    );
    expect(REFERENCE_IMAGE_TOO_LARGE).toBe(
      'This image is too large to use as a reference, even after shrinking it.',
    );
    expect(mockResized.saveAsync).toHaveBeenCalledTimes(3);
  });

  it('re-encodes without resizing a photo that is small in pixels but over the byte limit', async () => {
    mockReadAsString.mockResolvedValue(jpegBase64(2000, 1500, OVER));
    photo(2000, 1500, { 0.85: 1_000_000 });

    await readReferenceImageBase64('file:///png-like.jpg');

    expect(mockContexts).toHaveLength(1);
    expect(mockLoaded.saveAsync).toHaveBeenCalledTimes(1);
    expect(mockLoaded.release).toHaveBeenCalledTimes(1);
  });

  it('reads the size from the decoded image when the header does not give one', async () => {
    mockReadAsString.mockResolvedValue('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    photo(3000, 2000, { 0.85: 600_000 });

    await readReferenceImageBase64('file:///heic-like.heic');

    expect(mockContexts[1]!.resize).toHaveBeenCalledWith({ width: 2048 });
  });

  it('deletes every temporary file and releases every native image, also when it gives up', async () => {
    mockReadAsString.mockResolvedValue(jpegBase64(4032, 3024, OVER));
    photo(4032, 3024, { 0.85: OVER, 0.7: OVER, 0.55: OVER });

    await expect(readReferenceImageBase64('file:///huge.jpg')).rejects.toThrow();

    expect(mockDeleteAsync.mock.calls.map(([uri]) => uri)).toEqual([
      'file:///cache/ImageManipulator/0.85.jpg',
      'file:///cache/ImageManipulator/0.7.jpg',
      'file:///cache/ImageManipulator/0.55.jpg',
    ]);
    expect(mockDeleteAsync).toHaveBeenCalledWith(expect.any(String), { idempotent: true });
    expect(mockLoaded.release).toHaveBeenCalledTimes(1);
    expect(mockResized.release).toHaveBeenCalledTimes(1);
    for (const context of mockContexts) expect(context.release).toHaveBeenCalledTimes(1);
  });

  it('does not fail a send because a temporary file could not be deleted', async () => {
    mockReadAsString.mockResolvedValue(jpegBase64(4032, 3024, OVER));
    photo(4032, 3024, { 0.85: 800_000 });
    mockDeleteAsync.mockRejectedValue(new Error('gone'));

    await expect(readReferenceImageBase64('file:///photo.jpg')).resolves.toBe('B'.repeat(800_000));
  });
  it('decodes one photo at a time when several are read together', async () => {
    mockReadAsString.mockResolvedValue(jpegBase64(4032, 3024, OVER));
    photo(4032, 3024, { 0.85: 800_000 });
    let open = 0;
    let mostOpen = 0;
    const gates: (() => void)[] = [];
    mockManipulate.mockImplementation((source: unknown) => {
      const context = {
        source,
        resize: jest.fn(),
        release: jest.fn(),
        renderAsync: jest.fn(async () => {
          open += 1;
          mostOpen = Math.max(mostOpen, open);
          await new Promise<void>((resolve) => gates.push(resolve));
          open -= 1;
          return source === mockLoaded ? mockResized : mockLoaded;
        }),
      };
      context.resize.mockReturnValue(context);
      mockContexts.push(context);
      return context;
    });

    const all = Promise.all([
      readReferenceImageBase64('file:///a.jpg'),
      readReferenceImageBase64('file:///b.jpg'),
      readReferenceImageBase64('file:///c.jpg'),
    ]);
    for (let step = 0; step < 20; step += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      gates.splice(0).forEach((release) => release());
    }

    await expect(all).resolves.toHaveLength(3);
    expect(mostOpen).toBe(1);
  });

  it('keeps shrinking the next photo after one fails', async () => {
    mockReadAsString.mockResolvedValue(jpegBase64(4032, 3024, OVER));
    photo(4032, 3024, { 0.85: OVER, 0.7: OVER, 0.55: OVER });
    const failing = readReferenceImageBase64('file:///huge.jpg');
    const following = readReferenceImageBase64('file:///huge-too.jpg');

    await expect(failing).rejects.toBeInstanceOf(ReferenceImageTooLargeError);
    await expect(following).rejects.toBeInstanceOf(ReferenceImageTooLargeError);
  });
});
