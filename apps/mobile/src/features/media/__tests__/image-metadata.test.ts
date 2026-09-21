import type * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { readExifOrientation } from '@agiworkforce/utils';

import { PictureMetadataError, withoutPictureMetadata } from '../image-metadata';
import { pickImageAssetsFromLibrary } from '../photo-picker';

jest.mock('expo-file-system/legacy', () => ({
  ...jest.requireActual('expo-file-system/legacy'),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  cacheDirectory: 'file:///cache/',
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-image-picker', () => ({
  ...jest.requireActual('expo-image-picker'),
  launchImageLibraryAsync: jest.fn(),
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

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
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

function written(): Uint8Array {
  const call = (writeAsStringAsync as jest.Mock).mock.calls[0] as [string, string] | undefined;
  if (!call) throw new Error('nothing was written');
  return new Uint8Array(Buffer.from(call[1], 'base64'));
}

beforeEach(() => {
  (readAsStringAsync as jest.Mock).mockReset();
  (writeAsStringAsync as jest.Mock).mockClear();
});

describe('a photo on its way out of the phone', () => {
  it('is uploaded from a copy without the camera, keeping pixels and orientation', async () => {
    (readAsStringAsync as jest.Mock).mockResolvedValue(base64(pickerJpeg(6)));

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
    (readAsStringAsync as jest.Mock).mockResolvedValue(base64(whole.subarray(0, 30)));

    await expect(withoutPictureMetadata(asset(), 0)).rejects.toThrow(
      new PictureMetadataError('IMG_0001.jpg'),
    );
    expect(writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('is what the library picker hands the chat', async () => {
    (launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [asset()],
    });
    (readAsStringAsync as jest.Mock).mockResolvedValue(base64(pickerJpeg(1)));

    const [picked] = await pickImageAssetsFromLibrary();

    expect(picked?.uri).toMatch(/^file:\/\/\/cache\/attachment-/);
    expect(contains(written(), CAMERA)).toBe(false);
  });
});
