import { UIImagePickerPreferredAssetRepresentationMode } from 'expo-image-picker';
import {
  COMPATIBLE_ASSET_REPRESENTATION,
  HEIC_MIME_TYPES,
  SAFE_IMAGE_PICKER_OPTIONS,
  extensionOf,
  imageFileNameFor,
  imageMimeTypeFor,
  isHeicImage,
} from '../image-normalization';

describe('image normalization', () => {
  it('never lets a picker call ask for EXIF or the original representation', () => {
    expect(SAFE_IMAGE_PICKER_OPTIONS.exif).toBe(false);
    expect(SAFE_IMAGE_PICKER_OPTIONS.preferredAssetRepresentationMode).toBe('compatible');
  });

  it('states the representation the picker enum still names, without importing it at runtime', () => {
    expect(COMPATIBLE_ASSET_REPRESENTATION).toBe(
      UIImagePickerPreferredAssetRepresentationMode.Compatible,
    );
  });

  it('reads an extension past a query string and ignores case', () => {
    expect(extensionOf('file:///a/b/IMG_1.HEIC')).toBe('heic');
    expect(extensionOf('https://x/y/photo.png?width=10#frag')).toBe('png');
    expect(extensionOf('file:///a/no-extension')).toBeNull();
    expect(extensionOf(undefined)).toBeNull();
  });

  it('recognises every HEIC spelling, by type or by file name', () => {
    for (const mimeType of HEIC_MIME_TYPES) {
      expect(isHeicImage(mimeType)).toBe(true);
    }
    expect(isHeicImage('IMAGE/HEIF')).toBe(true);
    expect(isHeicImage(null, 'IMG_0042.heic')).toBe(true);
    expect(isHeicImage(null, 'IMG_0042.HEIF')).toBe(true);
    expect(isHeicImage('image/jpeg', 'IMG_0042.jpg')).toBe(false);
    expect(isHeicImage(undefined, undefined)).toBe(false);
  });

  it('prefers the declared image type, then the file name, then the uri', () => {
    expect(imageMimeTypeFor({ uri: 'file:///a.png', mimeType: 'image/webp' })).toBe('image/webp');
    expect(imageMimeTypeFor({ uri: 'file:///a.png', mimeType: 'application/octet-stream' })).toBe(
      'image/png',
    );
    expect(imageMimeTypeFor({ uri: 'file:///cache/tmp123', fileName: 'shot.gif' })).toBe(
      'image/gif',
    );
    expect(imageMimeTypeFor({ uri: 'file:///cache/tmp123' })).toBe('image/jpeg');
  });

  it('keeps the asset name when there is one and derives a matching one when there is not', () => {
    expect(imageFileNameFor({ uri: 'file:///a.png', fileName: 'holiday.png' }, 'photo-1')).toBe(
      'holiday.png',
    );
    expect(imageFileNameFor({ uri: 'file:///a.png' }, 'photo-1')).toBe('photo-1.png');
    expect(imageFileNameFor({ uri: 'file:///cache/tmp', mimeType: 'image/webp' }, 'photo-1')).toBe(
      'photo-1.webp',
    );
    expect(imageFileNameFor({ uri: 'file:///cache/tmp' }, 'photo-1')).toBe('photo-1.jpg');
  });
});
