import { Readable } from 'node:stream';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ObjectStorageConfig } from '../config';
import { createS3Client } from '../adapters/s3';

const RANGE_PATTERN = /^bytes=(\d+)-(\d*)$/u;
const KEY_SEPARATOR = '/';
const ETAG_MULTIPLIER = 31;
const ETAG_RADIX = 16;

interface StoredObject {
  data: Uint8Array;
  contentType: string | undefined;
  etag: string;
}

function etagOf(data: Uint8Array): string {
  let hash = 0;
  for (const byte of data) hash = (hash * ETAG_MULTIPLIER + byte) >>> 0;
  return `"${hash.toString(ETAG_RADIX)}-${data.byteLength}"`;
}

async function collect(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk as Uint8Array));
    return new Uint8Array(Buffer.concat(chunks));
  }
  throw new Error('The fake endpoint received a body shape the port does not send.');
}

function missing(name: string): Error {
  return Object.assign(new Error('The object does not exist.'), {
    name,
    $metadata: { httpStatusCode: 404 },
  });
}

function bodyOf(data: Uint8Array): {
  transformToByteArray: () => Promise<Uint8Array>;
  transformToWebStream: () => ReadableStream<Uint8Array>;
} {
  return {
    transformToByteArray: async () => data,
    transformToWebStream: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      }),
  };
}

export interface FakeS3Endpoint {
  client: S3Client;
  sent: unknown[];
}

/**
 * An S3 endpoint that answers from a map. It exists so the shared contract can
 * run against the same adapter code the product ships, including its real
 * request signing, without a network or a bucket.
 */
export function createFakeS3Endpoint(
  config: ObjectStorageConfig,
  timeouts = { connectionTimeoutMs: 1_000, requestTimeoutMs: 5_000 },
): FakeS3Endpoint {
  const objects = new Map<string, StoredObject>();
  const sent: unknown[] = [];
  const client = createS3Client(config, timeouts);

  const address = (bucket: string | undefined, key: string | undefined): string =>
    `${bucket ?? ''}${KEY_SEPARATOR}${key ?? ''}`;

  async function handle(command: unknown): Promise<unknown> {
    sent.push(command);

    if (command instanceof PutObjectCommand) {
      const data = await collect(command.input.Body);
      objects.set(address(command.input.Bucket, command.input.Key), {
        data,
        contentType: command.input.ContentType,
        etag: etagOf(data),
      });
      return { ETag: etagOf(data) };
    }

    if (command instanceof GetObjectCommand) {
      const stored = objects.get(address(command.input.Bucket, command.input.Key));
      if (!stored) throw missing('NoSuchKey');
      const range = command.input.Range;
      if (!range) {
        return {
          Body: bodyOf(stored.data),
          ContentType: stored.contentType,
          ContentLength: stored.data.byteLength,
        };
      }
      const match = RANGE_PATTERN.exec(range);
      if (!match) throw missing('NoSuchKey');
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : stored.data.byteLength - 1;
      const slice = stored.data.subarray(start, end + 1);
      return {
        Body: bodyOf(slice),
        ContentType: stored.contentType,
        ContentLength: slice.byteLength,
        ContentRange: `bytes ${start}-${end}/${stored.data.byteLength}`,
      };
    }

    if (command instanceof HeadObjectCommand) {
      const stored = objects.get(address(command.input.Bucket, command.input.Key));
      if (!stored) throw missing('NotFound');
      return {
        ContentLength: stored.data.byteLength,
        ContentType: stored.contentType,
        ETag: stored.etag,
      };
    }

    if (command instanceof DeleteObjectCommand) {
      objects.delete(address(command.input.Bucket, command.input.Key));
      return {};
    }

    if (command instanceof CopyObjectCommand) {
      const source = (command.input.CopySource ?? '')
        .split(KEY_SEPARATOR)
        .map(decodeURIComponent)
        .slice(1)
        .join(KEY_SEPARATOR);
      const stored = objects.get(address(command.input.Bucket, source));
      if (!stored) throw missing('NoSuchKey');
      if (stored.etag !== command.input.CopySourceIfMatch) {
        throw Object.assign(new Error('The precondition failed.'), {
          name: 'PreconditionFailed',
          $metadata: { httpStatusCode: 412 },
        });
      }
      objects.set(address(command.input.Bucket, command.input.Key), { ...stored });
      return { CopyObjectResult: { ETag: stored.etag } };
    }

    throw new Error('The fake endpoint received a command the port does not send.');
  }

  Object.defineProperty(client, 'send', { value: handle, writable: true });
  return { client, sent };
}
