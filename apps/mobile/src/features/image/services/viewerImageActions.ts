import {
  cacheDirectory,
  EncodingType,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import {
  requestPermissionsAsync as requestPhotoPermissionsAsync,
  saveToLibraryAsync,
} from 'expo-media-library/legacy';
import { guardedFetch } from '@/lib/egressGuard';
import {
  copyGeneratedImage,
  PhotosPermissionError,
  saveGeneratedImageToPhotos,
  shareGeneratedImage,
} from '@/services/fileCreation';
import { imageFileNameFor, imageMimeTypeFor } from '@/src/features/media/image-normalization';
import { resolveGeneratedImageUri } from './imagegen';

export type ViewerImageAction = 'save' | 'share' | 'copy';

type ViewerImageOrigin = 'stored' | 'device' | 'embedded' | 'remote';

export interface ViewerImageHints {
  name?: string | null;
  mimeType?: string | null;
}

interface ActionOptions {
  isCurrent?: () => boolean;
  fileName?: string;
}

interface ImageBytes {
  base64: string;
  mimeType: string;
}

const EMBEDDED_IMAGE = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i;
const VIEWER_IMAGE_DIR = `${cacheDirectory}viewer-images/`;
const ALL_ACTIONS: ReadonlySet<ViewerImageAction> = new Set(['save', 'share', 'copy']);
const NO_ACTIONS: ReadonlySet<ViewerImageAction> = new Set();
const UNSHAREABLE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/svg+xml',
  'application/octet-stream',
]);
const VECTOR_FILE_NAME = /\.svgz?$/i;
const EMBEDDED_VECTOR = /^data:image\/svg\+xml[;,]/i;

function originOf(uri: string): ViewerImageOrigin | null {
  const value = uri.trim();
  if (resolveGeneratedImageUri(value)) return 'stored';
  if (/^file:\/\//i.test(value)) return 'device';
  if (EMBEDDED_IMAGE.test(value)) return 'embedded';
  if (/^https:\/\//i.test(value)) return 'remote';
  return null;
}

function pathOf(value: string): string {
  const end = value.search(/[?#]/);
  return end < 0 ? value : value.slice(0, end);
}

function cannotBeSharedAsPicture(uri: string, hints: ViewerImageHints): boolean {
  const value = uri.trim();
  if (EMBEDDED_VECTOR.test(value)) return true;
  const declared = hints.mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  if (declared && UNSHAREABLE_MIME_TYPES.has(declared)) return true;
  if (hints.name && VECTOR_FILE_NAME.test(hints.name.trim())) return true;
  return !value.startsWith('data:') && VECTOR_FILE_NAME.test(pathOf(value));
}

export function viewerImageActions(
  uri: string,
  hints: ViewerImageHints = {},
): ReadonlySet<ViewerImageAction> {
  if (!originOf(uri) || cannotBeSharedAsPicture(uri, hints)) return NO_ACTIONS;
  return ALL_ACTIONS;
}

function savableMimeType(mimeType: string | null | undefined): string | null {
  const declared = mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  if (!declared?.startsWith('image/')) return null;
  const fileName = imageFileNameFor({ uri: '', mimeType: declared }, 'image');
  return imageMimeTypeFor({ uri: fileName }) === declared ? declared : null;
}

function base64OfBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      if (comma < 0) reject(new Error('The image could not be read.'));
      else resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function readImageBytes(uri: string, origin: ViewerImageOrigin): Promise<ImageBytes> {
  const value = uri.trim();
  if (origin === 'embedded') {
    const match = EMBEDDED_IMAGE.exec(value);
    const mimeType = savableMimeType(match?.[1]);
    if (!match || !mimeType) throw new Error('This image format cannot be saved.');
    return { base64: match[2]!.replace(/\s+/g, ''), mimeType };
  }
  if (origin === 'device') {
    const mimeType = savableMimeType(imageMimeTypeFor({ uri: value }));
    if (!mimeType) throw new Error('This image format cannot be saved.');
    const base64 = await readAsStringAsync(value, { encoding: EncodingType.Base64 });
    if (!base64) throw new Error('The image could not be read from this device.');
    return { base64, mimeType };
  }
  const response = await guardedFetch(value);
  if (!response.ok) throw new Error('The image could not be downloaded.');
  const mimeType = savableMimeType(response.headers.get('Content-Type'));
  if (!mimeType) throw new Error('This image format cannot be saved.');
  return { base64: await base64OfBlob(await response.blob()), mimeType };
}

async function writeImageFile(bytes: ImageBytes): Promise<string> {
  const directory = `${VIEWER_IMAGE_DIR}${Crypto.randomUUID()}/`;
  await makeDirectoryAsync(directory, { intermediates: true });
  const fileUri = `${directory}${imageFileNameFor({ uri: '', mimeType: bytes.mimeType }, 'image')}`;
  await writeAsStringAsync(fileUri, bytes.base64, { encoding: EncodingType.Base64 });
  return fileUri;
}

async function imageFile(
  uri: string,
  origin: ViewerImageOrigin,
): Promise<{ fileUri: string; mimeType: string }> {
  if (origin === 'device') {
    const mimeType = savableMimeType(imageMimeTypeFor({ uri }));
    if (!mimeType) throw new Error('This image format cannot be saved.');
    return { fileUri: uri.trim(), mimeType };
  }
  const bytes = await readImageBytes(uri, origin);
  return { fileUri: await writeImageFile(bytes), mimeType: bytes.mimeType };
}

export async function runViewerImageAction(
  action: ViewerImageAction,
  uri: string,
  options: ActionOptions = {},
): Promise<void> {
  const origin = originOf(uri);
  if (!origin) throw new Error('This image cannot be saved or shared from here.');
  if (origin === 'stored') {
    const { fileName, ...guard } = options;
    if (action === 'share') return shareGeneratedImage(uri, fileName, guard);
    if (action === 'save') return saveGeneratedImageToPhotos(uri, fileName, guard);
    return copyGeneratedImage(uri, guard);
  }
  const stillCurrent = () => options.isCurrent?.() !== false;
  if (!stillCurrent()) return;
  if (action === 'copy') {
    const bytes = await readImageBytes(uri, origin);
    if (!stillCurrent()) return;
    await Clipboard.setImageAsync(bytes.base64);
    return;
  }
  if (action === 'save') {
    const permission = await requestPhotoPermissionsAsync(true);
    if (!stillCurrent()) return;
    if (!permission.granted) {
      throw new PhotosPermissionError();
    }
    const { fileUri } = await imageFile(uri, origin);
    if (!stillCurrent()) return;
    await saveToLibraryAsync(fileUri);
    return;
  }
  const { fileUri, mimeType } = await imageFile(uri, origin);
  if (!stillCurrent()) return;
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  if (!stillCurrent()) return;
  await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: 'Share image' });
}
