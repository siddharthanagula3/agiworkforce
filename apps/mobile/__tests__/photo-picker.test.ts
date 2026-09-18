import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ImagePicker from 'expo-image-picker';
import { SAFE_IMAGE_PICKER_OPTIONS } from '../src/features/media/image-normalization';
import {
  captureImageAssetsFromCamera,
  imageAssetsToChatAttachments,
  pickImageAssetsFromLibrary,
} from '../src/features/media/photo-picker';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: {
    Automatic: 'automatic',
    Compatible: 'compatible',
    Current: 'current',
  },
}));

const mockLaunchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockLaunchCameraAsync = ImagePicker.launchCameraAsync as jest.Mock;
const mockRequestMediaLibraryPermissionsAsync =
  ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;

describe('photoPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the system image picker without requesting broad photo-library access first', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });

    await expect(pickImageAssetsFromLibrary()).resolves.toEqual([]);

    expect(mockRequestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: false,
      selectionLimit: undefined,
      orderedSelection: false,
      exif: false,
      preferredAssetRepresentationMode: 'compatible',
    });
  });

  it('asks the library for the compatible representation so a HEIC pick arrives as JPEG', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: null });

    await pickImageAssetsFromLibrary({ allowsMultipleSelection: true, selectionLimit: 5 });

    const options = mockLaunchImageLibraryAsync.mock.calls[0]![0];
    expect(options.preferredAssetRepresentationMode).toBe('compatible');
    expect(options.exif).toBe(false);
  });

  it('strips EXIF on the camera path too, and returns nothing when the shot is cancelled', async () => {
    mockLaunchCameraAsync.mockResolvedValueOnce({ canceled: true, assets: null });

    await expect(captureImageAssetsFromCamera()).resolves.toEqual([]);

    expect(mockLaunchCameraAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
      exif: false,
      preferredAssetRepresentationMode: 'compatible',
    });
  });

  it('maps selected image assets into chat attachments', () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1710000000000);

    expect(
      imageAssetsToChatAttachments([
        {
          uri: 'file:///selected-photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'selected-photo.jpg',
          width: 1200,
          height: 900,
          fileSize: 2048,
        },
      ] as ImagePicker.ImagePickerAsset[]),
    ).toEqual([
      {
        id: 'photo-1710000000000-0',
        uri: 'file:///selected-photo.jpg',
        mimeType: 'image/jpeg',
        fileName: 'selected-photo.jpg',
        width: 1200,
        height: 900,
        fileSize: 2048,
      },
    ]);
  });

  it('reads the real type off an asset the picker did not label instead of calling it a JPEG', () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1710000000000);

    expect(
      imageAssetsToChatAttachments([
        { uri: 'file:///screens/shot.png' },
        { uri: 'file:///library/IMG_0042.HEIC' },
      ] as ImagePicker.ImagePickerAsset[]),
    ).toEqual([
      {
        id: 'photo-1710000000000-0',
        uri: 'file:///screens/shot.png',
        mimeType: 'image/png',
        fileName: 'photo-1710000000000-0.png',
        width: undefined,
        height: undefined,
        fileSize: undefined,
      },
      {
        id: 'photo-1710000000000-1',
        uri: 'file:///library/IMG_0042.HEIC',
        mimeType: 'image/heic',
        fileName: 'photo-1710000000000-1.heic',
        width: undefined,
        height: undefined,
        fileSize: undefined,
      },
    ]);
  });
});

describe('no capture entry can ask for location metadata', () => {
  const ROOT = join(__dirname, '..');

  function sources(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === '__mocks__') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) found.push(...sources(full));
      else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) found.push(full);
    }
    return found;
  }

  // Every one of these hands the frame to a model or to storage, so EXIF would
  // carry the GPS fix of wherever the photo was taken off the device.
  const CAPTURE_CALL = /(launchCameraAsync|launchImageLibraryAsync|takePictureAsync)\s*\(/;

  it('passes exif: false at every camera and picker call site', () => {
    const offenders: string[] = [];
    for (const dir of ['app', 'src']) {
      for (const file of sources(join(ROOT, dir))) {
        const text = readFileSync(file, 'utf8');
        if (!CAPTURE_CALL.test(text)) continue;
        const usesSafeOptions = text.includes('SAFE_IMAGE_PICKER_OPTIONS');
        if (!usesSafeOptions && !/exif:\s*false/.test(text)) {
          offenders.push(relative(ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps exif off in the one constant the chat entries share', () => {
    expect(SAFE_IMAGE_PICKER_OPTIONS.exif).toBe(false);
  });
});
