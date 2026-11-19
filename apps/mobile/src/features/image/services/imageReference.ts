import { readAsStringAsync, deleteAsync, EncodingType } from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { MANAGED_MEDIA_IMAGE_REF_MAX_B64_LENGTH } from '@agiworkforce/cloud-contracts';
import { base64ToBytes, imageDimensions } from './imageMask';

const REFERENCE_IMAGE_MAX_EDGE = 2048;
const SHRINK_QUALITIES = [0.85, 0.7, 0.55] as const;
const HEADER_BASE64_CHARS = 65_536;

export const REFERENCE_IMAGE_TOO_LARGE =
  'This image is too large to use as a reference, even after shrinking it.';

export class ReferenceImageTooLargeError extends Error {
  constructor() {
    super(REFERENCE_IMAGE_TOO_LARGE);
    this.name = 'ReferenceImageTooLargeError';
  }
}

function fitsWithoutShrinking(base64: string): boolean {
  if (base64.length > MANAGED_MEDIA_IMAGE_REF_MAX_B64_LENGTH) return false;
  const size = imageDimensions(base64ToBytes(base64.slice(0, HEADER_BASE64_CHARS)));
  return size !== null && Math.max(size.width, size.height) <= REFERENCE_IMAGE_MAX_EDGE;
}

async function render(
  source: string | ImageRef,
  resize?: { width?: number; height?: number },
): Promise<ImageRef> {
  const context = ImageManipulator.manipulate(source);
  try {
    return await (resize ? context.resize(resize) : context).renderAsync();
  } finally {
    context.release();
  }
}

async function shrinkToFit(uri: string): Promise<string> {
  const loaded = await render(uri);
  let image = loaded;
  try {
    if (Math.max(loaded.width, loaded.height) > REFERENCE_IMAGE_MAX_EDGE) {
      image = await render(
        loaded,
        loaded.width >= loaded.height
          ? { width: REFERENCE_IMAGE_MAX_EDGE }
          : { height: REFERENCE_IMAGE_MAX_EDGE },
      );
    }
    for (const compress of SHRINK_QUALITIES) {
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
      await deleteAsync(saved.uri, { idempotent: true }).catch(() => undefined);
      if (saved.base64 && saved.base64.length <= MANAGED_MEDIA_IMAGE_REF_MAX_B64_LENGTH) {
        return saved.base64;
      }
    }
    throw new ReferenceImageTooLargeError();
  } finally {
    if (image !== loaded) image.release();
    loaded.release();
  }
}

let shrinkQueue: Promise<unknown> = Promise.resolve();

function shrinkOneAtATime(uri: string): Promise<string> {
  const run = shrinkQueue.then(() => shrinkToFit(uri));
  shrinkQueue = run.catch(() => undefined);
  return run;
}

export async function readReferenceImageBase64(uri: string): Promise<string> {
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  if (!base64) throw new Error('The reference image could not be read from this device.');
  return fitsWithoutShrinking(base64) ? base64 : shrinkOneAtATime(uri);
}
