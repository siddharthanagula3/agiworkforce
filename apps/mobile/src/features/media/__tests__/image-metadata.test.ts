import type * as ImagePicker from 'expo-image-picker';
import { launchCameraAsync, launchImageLibraryAsync } from 'expo-image-picker';
import { readExifOrientation } from '@agiworkforce/utils';

import { PictureMetadataError, withoutPictureMetadata } from '../image-metadata';
import { captureImageAssetsFromCamera, pickImageAssetsFromLibrary } from '../photo-picker';

const mockFiles = new Map<string, Uint8Array>();

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('');
    }
    async bytes(): Promise<Uint8Array> {
      const stored = mockFiles.get(this.uri);
      if (!stored) throw new Error(`nothing at ${this.uri}`);
      return stored;
    }
    create(): void {
      mockFiles.set(this.uri, new Uint8Array());
    }
    write(content: Uint8Array): void {
      mockFiles.set(this.uri, new Uint8Array(content));
    }
  }
  return { File, Paths: { cache: { uri: 'file:///cache/' } } };
});

jest.mock('expo-image-picker', () => ({
  ...jest.requireActual('expo-image-picker'),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

const CAMERA = 'FIXTURECAMERA';
const PIXELS = 'FIXTUREPIXELS';

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** What Android's picker hands back: a compressed JPEG with the camera's Exif copied in. */
function pickerJpeg(orientation: number): Uint8Array {
  const camera = [...ascii(CAMERA), 0];
  const cameraAt = 8 + 2 + 2 * 12 + 4;
  const tiff = [
    ...ascii('MM'),
    ...u16(0x2a),
    ...u32(8),
    ...u16(2),
    ...u16(0x010f),
    ...u16(2),
    ...u32(camera.length),
    ...u32(cameraAt),
    ...u16(0x0112),
    ...u16(3),
    ...u32(1),
    ...u16(orientation),
    0,
    0,
    ...u32(0),
    ...camera,
  ];
  const exif = [...ascii('Exif'), 0, 0, ...tiff];
  const scan = [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00];
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    ...u16(exif.length + 2),
    ...exif,
    0xff,
    0xda,
    ...u16(scan.length + 2),
    ...scan,
    ...ascii(PIXELS),
    0xff,
    0xd9,
  ]);
}

function contains(bytes: Uint8Array, text: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(text, 'latin1'));
}

function asset(
  overrides: Partial<ImagePicker.ImagePickerAsset> = {},
): ImagePicker.ImagePickerAsset {
  return {
    uri: 'file:///picker/IMG_0001.jpg',
    width: 1,
    height: 1,
    fileName: 'IMG_0001.jpg',
    mimeType: 'image/jpeg',
    ...overrides,
  } as ImagePicker.ImagePickerAsset;
}

function cleanedCopies(): Uint8Array[] {
  return Array.from(mockFiles)
    .filter(([uri]) => uri.startsWith('file:///cache/'))
    .map(([, bytes]) => bytes);
}

function written(): Uint8Array {
  const [copy] = cleanedCopies();
  if (!copy) throw new Error('nothing was written');
  return copy;
}

function pickerHandsBack(bytes: Uint8Array): void {
  mockFiles.set(asset().uri, bytes);
}

beforeEach(() => {
  mockFiles.clear();
  (launchImageLibraryAsync as jest.Mock).mockReset();
  (launchCameraAsync as jest.Mock).mockReset();
});

describe('a photo on its way out of the phone', () => {
  it('is uploaded from a copy without the camera, keeping pixels and orientation', async () => {
    pickerHandsBack(pickerJpeg(6));

    const cleaned = await withoutPictureMetadata(asset(), 0);

    const bytes = written();
    expect(contains(bytes, CAMERA)).toBe(false);
    expect(contains(bytes, PIXELS)).toBe(true);
    expect(readExifOrientation(bytes.subarray(12))).toBe(6);
    expect(cleaned.uri).toMatch(/^file:\/\/\/cache\/attachment-\d+-0\.jpg$/);
    expect(cleaned.uri).not.toBe(asset().uri);
    expect(cleaned.fileSize).toBe(bytes.length);
    expect(cleaned.exif).toBeNull();
  });

  it('is refused, in plain words, when it cannot be read well enough to clean', async () => {
    const whole = pickerJpeg(1);
    pickerHandsBack(whole.subarray(0, 30));

    await expect(withoutPictureMetadata(asset(), 0)).rejects.toThrow(
      new PictureMetadataError('IMG_0001.jpg'),
    );
    expect(cleanedCopies()).toEqual([]);
  });

  it('is refused, in plain words, when the picker copy cannot be read at all', async () => {
    await expect(withoutPictureMetadata(asset(), 0)).rejects.toThrow(
      new PictureMetadataError('IMG_0001.jpg'),
    );
    expect(cleanedCopies()).toEqual([]);
  });

  it('is what the library picker hands the chat', async () => {
    (launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [asset()],
    });
    pickerHandsBack(pickerJpeg(1));

    const [picked] = await pickImageAssetsFromLibrary();

    expect(picked?.uri).toMatch(/^file:\/\/\/cache\/attachment-/);
    expect(contains(written(), CAMERA)).toBe(false);
  });

  it('reports how many photos were chosen as the library picker closes, before they are cleaned', async () => {
    (launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [asset(), asset()],
    });
    pickerHandsBack(pickerJpeg(1));
    const copiesWhenReported: number[] = [];
    const onPicked = jest.fn(() => {
      copiesWhenReported.push(cleanedCopies().length);
    });

    const picked = await pickImageAssetsFromLibrary({ allowsMultipleSelection: true, onPicked });

    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(onPicked).toHaveBeenCalledWith(2);
    expect(copiesWhenReported).toEqual([0]);
    expect(picked).toHaveLength(2);
  });

  it('reports the captured photo as the camera closes, and nothing when either is cancelled', async () => {
    (launchCameraAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [asset()] });
    pickerHandsBack(pickerJpeg(1));
    const onPicked = jest.fn();

    await captureImageAssetsFromCamera({ onPicked });
    expect(onPicked).toHaveBeenCalledWith(1);

    onPicked.mockClear();
    (launchCameraAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });
    (launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await captureImageAssetsFromCamera({ onPicked })).toEqual([]);
    expect(await pickImageAssetsFromLibrary({ onPicked })).toEqual([]);
    expect(onPicked).not.toHaveBeenCalled();
  });
});
