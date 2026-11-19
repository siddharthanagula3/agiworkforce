import { RESUMABLE_UPLOAD_LARGE_PART_BYTES } from './resumable-uploads';

async function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  if (typeof FileReader === 'undefined') {
    throw new Error('This surface cannot read the selected file.');
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected file could not be read.'));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('The selected file returned invalid bytes.'));
    };
    reader.readAsArrayBuffer(blob);
  });
}

function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256HexOfBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await readBlobBytes(blob));
  return hexOf(new Uint8Array(digest));
}

export interface IncrementalSha256 {
  update(bytes: Uint8Array): unknown;
  digest(): Uint8Array;
}

export interface SlicedDigestOptions {
  sliceBytes?: number;
  signal?: AbortSignal;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('The upload was cancelled.');
  error.name = 'AbortError';
  throw error;
}

function yieldToEventLoop(): Promise<void> {
  // A message task is not clamped like a timer in a hidden tab.
  if (typeof MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function digestSliceBytes(requested: number | undefined): number {
  return requested !== undefined && Number.isInteger(requested) && requested > 0
    ? requested
    : RESUMABLE_UPLOAD_LARGE_PART_BYTES;
}

/**
 * The SHA-256 of a file too large to hold in memory at once, read one slice at
 * a time and yielding between slices so the page stays responsive.
 */
export async function sha256HexOfBlobInSlices(
  blob: Blob,
  createHasher: () => IncrementalSha256,
  options: SlicedDigestOptions = {},
): Promise<string> {
  const sliceBytes = digestSliceBytes(options.sliceBytes);
  const hasher = createHasher();
  for (let start = 0; start < blob.size; start += sliceBytes) {
    assertNotAborted(options.signal);
    const slice = blob.slice(start, Math.min(start + sliceBytes, blob.size));
    hasher.update(new Uint8Array(await readBlobBytes(slice)));
    await yieldToEventLoop();
  }
  assertNotAborted(options.signal);
  return hexOf(hasher.digest());
}
