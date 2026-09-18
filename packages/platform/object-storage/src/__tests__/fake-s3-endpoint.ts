import { Readable } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import type { ObjectStorageConfig } from '../config';
import { createS3Client } from '../adapters/s3';
import { objectChecksum } from '../checksum';

const RANGE_PATTERN = /^bytes=(\d+)-(\d*)$/u;
const KEY_SEPARATOR = '/';
const ETAG_MULTIPLIER = 31;
const ETAG_RADIX = 16;

interface StoredObject {
  data: Uint8Array;
  contentType: string | undefined;
  etag: string;
  checksum: string;
  metadata: Record<string, string> | undefined;
  encryption: string | undefined;
}

interface PendingUpload {
  bucket: string | undefined;
  key: string | undefined;
  contentType: string | undefined;
  metadata: Record<string, string> | undefined;
  encryption: string | undefined;
  initiated: Date;
  parts: Map<number, { data: Uint8Array; etag: string; checksum: string }>;
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
  sent: string[];
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
  const uploads = new Map<string, PendingUpload>();
  const sent: string[] = [];
  const client = createS3Client(config, timeouts);
  let nextUploadId = 1;

  const address = (bucket: string | undefined, key: string | undefined): string =>
    `${bucket ?? ''}${KEY_SEPARATOR}${key ?? ''}`;

  async function handle(command: unknown): Promise<unknown> {
    if (command instanceof PutObjectCommand) {
      sent.push(`put ${command.input.Bucket}/${command.input.Key} ${command.input.ContentType}`);
      const data = await collect(command.input.Body);
      if (command.input.ChecksumSHA256 && command.input.ChecksumSHA256 !== objectChecksum(data)) {
        throw Object.assign(new Error('The object checksum did not match.'), {
          name: 'BadDigest',
          $metadata: { httpStatusCode: 400 },
        });
      }
      objects.set(address(command.input.Bucket, command.input.Key), {
        data,
        contentType: command.input.ContentType,
        etag: etagOf(data),
        checksum: objectChecksum(data),
        metadata: command.input.Metadata,
        encryption: command.input.ServerSideEncryption,
      });
      return { ETag: etagOf(data) };
    }

    if (command instanceof GetObjectCommand) {
      sent.push(`get ${command.input.Bucket}/${command.input.Key}`);
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
      sent.push(`head ${command.input.Bucket}/${command.input.Key}`);
      const stored = objects.get(address(command.input.Bucket, command.input.Key));
      if (!stored) throw missing('NotFound');
      return {
        ContentLength: stored.data.byteLength,
        ContentType: stored.contentType,
        ETag: stored.etag,
        ChecksumSHA256: stored.checksum,
        ServerSideEncryption: stored.encryption,
        Metadata: stored.metadata,
      };
    }

    if (command instanceof DeleteObjectCommand) {
      sent.push(`delete ${command.input.Bucket}/${command.input.Key}`);
      objects.delete(address(command.input.Bucket, command.input.Key));
      return {};
    }

    if (command instanceof CopyObjectCommand) {
      sent.push(`copy ${command.input.Bucket}/${command.input.Key}`);
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

    if (command instanceof CreateMultipartUploadCommand) {
      const uploadId = `fake-upload-${nextUploadId++}`;
      sent.push(`createMultipart ${command.input.Bucket}/${command.input.Key}`);
      uploads.set(uploadId, {
        bucket: command.input.Bucket,
        key: command.input.Key,
        contentType: command.input.ContentType,
        metadata: command.input.Metadata,
        encryption: command.input.ServerSideEncryption,
        initiated: new Date(),
        parts: new Map(),
      });
      return { UploadId: uploadId };
    }

    if (command instanceof UploadPartCommand) {
      const upload = uploads.get(command.input.UploadId ?? '');
      if (!upload) throw missing('NoSuchUpload');
      const data = await collect(command.input.Body);
      const checksum = objectChecksum(data);
      if (command.input.ChecksumSHA256 && command.input.ChecksumSHA256 !== checksum) {
        throw Object.assign(new Error('The part checksum did not match.'), {
          name: 'BadDigest',
          $metadata: { httpStatusCode: 400 },
        });
      }
      upload.parts.set(command.input.PartNumber ?? 0, { data, etag: etagOf(data), checksum });
      return { ETag: etagOf(data), ChecksumSHA256: checksum };
    }

    if (command instanceof ListPartsCommand) {
      const upload = uploads.get(command.input.UploadId ?? '');
      if (!upload) throw missing('NoSuchUpload');
      return {
        Parts: [...upload.parts.entries()].map(([partNumber, part]) => ({
          PartNumber: partNumber,
          ETag: part.etag,
          Size: part.data.byteLength,
          ChecksumSHA256: part.checksum,
        })),
      };
    }

    if (command instanceof CompleteMultipartUploadCommand) {
      const upload = uploads.get(command.input.UploadId ?? '');
      if (!upload) throw missing('NoSuchUpload');
      const ordered = (command.input.MultipartUpload?.Parts ?? []).map((part) => {
        const stored = upload.parts.get(part.PartNumber ?? 0);
        if (!stored) throw missing('InvalidPart');
        return stored.data;
      });
      const total = ordered.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const joined = new Uint8Array(total);
      let offset = 0;
      for (const chunk of ordered) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      uploads.delete(command.input.UploadId ?? '');
      objects.set(address(upload.bucket, upload.key), {
        data: joined,
        contentType: upload.contentType,
        etag: etagOf(joined),
        checksum: objectChecksum(joined),
        metadata: upload.metadata,
        encryption: upload.encryption,
      });
      return { ETag: etagOf(joined) };
    }

    if (command instanceof AbortMultipartUploadCommand) {
      sent.push(`abortMultipart ${command.input.Bucket}/${command.input.Key}`);
      uploads.delete(command.input.UploadId ?? '');
      return {};
    }

    if (command instanceof ListMultipartUploadsCommand) {
      const prefix = command.input.Prefix ?? '';
      return {
        Uploads: [...uploads.entries()]
          .filter(([, upload]) => upload.bucket === command.input.Bucket)
          .filter(([, upload]) => (upload.key ?? '').startsWith(prefix))
          .map(([uploadId, upload]) => ({
            UploadId: uploadId,
            Key: upload.key,
            Initiated: upload.initiated,
          })),
        IsTruncated: false,
      };
    }

    throw new Error('The fake endpoint received a command the port does not send.');
  }

  Object.defineProperty(client, 'send', { value: handle, writable: true });
  return { client, sent };
}
