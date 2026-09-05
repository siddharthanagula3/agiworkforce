import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { bindPresignedUpload } from '../presign';
import { type ObjectStorageConfig } from '../config';
import {
  ObjectStorageConfigError,
  ObjectStorageTimeoutError,
  type CopyObjectIfMatchInput,
  type ObjectStore,
  type PresignPutInput,
  type PutObjectInput,
  type StoredObjectBytes,
  type StoredObjectHead,
  type StoredObjectStream,
} from '../types';

const MISSING_OBJECT_ERROR_NAMES = new Set(['NoSuchKey', 'NotFound']);
const PRECONDITION_FAILED_ERROR_NAME = 'PreconditionFailed';
const PRECONDITION_FAILED_STATUS = 412;
const COPY_METADATA_DIRECTIVE = 'COPY';
const SIGNABLE_UPLOAD_HEADERS = ['content-length', 'content-type'];
const KEY_SEPARATOR = '/';

export interface S3ClientTimeouts {
  connectionTimeoutMs: number;
  requestTimeoutMs: number;
}

export interface S3ObjectStoreOptions {
  client: S3Client;
  requestTimeoutMs: number;
}

export function createS3Client(config: ObjectStorageConfig, timeouts: S3ClientTimeouts): S3Client {
  const { endpoint, accessKeyId, secretAccessKey } = config;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new ObjectStorageConfigError(
      'The s3 provider needs an endpoint, an access key id and a secret access key.',
    );
  }
  return new S3Client({
    region: config.region,
    endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
    requestHandler: {
      connectionTimeout: timeouts.connectionTimeoutMs,
      requestTimeout: timeouts.requestTimeoutMs,
    },
  });
}

function errorName(error: unknown): string | undefined {
  return (error as { name?: string } | null)?.name;
}

function isMissingObject(error: unknown): boolean {
  const name = errorName(error);
  return name !== undefined && MISSING_OBJECT_ERROR_NAMES.has(name);
}

function isPreconditionFailed(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode;
  return (
    errorName(error) === PRECONDITION_FAILED_ERROR_NAME || status === PRECONDITION_FAILED_STATUS
  );
}

function encodeCopySource(bucket: string, key: string): string {
  return `${bucket}${KEY_SEPARATOR}${key.split(KEY_SEPARATOR).map(encodeURIComponent).join(KEY_SEPARATOR)}`;
}

/**
 * A backstop independent of whatever the request handler underneath the client
 * does. The client's own timeouts protect a real socket; this protects every
 * caller even when the client itself is a fake that never settles, which is
 * exactly the failure a hung upstream host looks like from here.
 */
function withRequestTimeout<T>(timeoutMs: number, operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ObjectStorageTimeoutError(timeoutMs)), timeoutMs);
  });
  return Promise.race([operation(), deadline]).finally(() => clearTimeout(timer));
}

export function createS3ObjectStore(options: S3ObjectStoreOptions): ObjectStore {
  const { client, requestTimeoutMs } = options;

  async function getObject(
    bucket: string,
    key: string,
    range: string | undefined,
  ): Promise<GetObjectCommandOutput | null> {
    try {
      return await withRequestTimeout(requestTimeoutMs, () =>
        client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range })),
      );
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  return {
    async put(input: PutObjectInput): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
        }),
      );
    },

    async get(bucket: string, key: string): Promise<StoredObjectBytes | null> {
      const response = await getObject(bucket, key, undefined);
      if (!response?.Body) return null;
      return {
        data: await response.Body.transformToByteArray(),
        contentType: response.ContentType,
      };
    },

    async getStream(
      bucket: string,
      key: string,
      range?: string,
    ): Promise<StoredObjectStream | null> {
      const response = await getObject(bucket, key, range);
      if (!response?.Body) return null;
      return {
        body: response.Body.transformToWebStream(),
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        contentRange: response.ContentRange,
      };
    },

    async head(bucket: string, key: string): Promise<StoredObjectHead | null> {
      try {
        const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return {
          contentLength: response.ContentLength,
          contentType: response.ContentType,
          etag: response.ETag,
        };
      } catch (error) {
        if (isMissingObject(error)) return null;
        throw error;
      }
    },

    async delete(bucket: string, key: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async copyIfMatch(input: CopyObjectIfMatchInput): Promise<boolean> {
      try {
        await client.send(
          new CopyObjectCommand({
            Bucket: input.bucket,
            Key: input.destinationKey,
            CopySource: encodeCopySource(input.bucket, input.sourceKey),
            CopySourceIfMatch: input.etag,
            MetadataDirective: COPY_METADATA_DIRECTIVE,
          }),
        );
        return true;
      } catch (error) {
        if (isPreconditionFailed(error)) return false;
        throw error;
      }
    },

    async presignPut(input: PresignPutInput): Promise<string> {
      const bound = bindPresignedUpload(input);
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          ContentType: bound.contentType,
          ContentLength: bound.contentLength,
        }),
        {
          expiresIn: input.expiresInSeconds,
          signableHeaders: new Set(SIGNABLE_UPLOAD_HEADERS),
        },
      );
    },
  };
}
