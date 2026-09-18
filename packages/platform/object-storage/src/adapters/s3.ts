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
  ServerSideEncryption,
  UploadPartCommand,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { objectChecksum } from '../checksum';
import { bindPresignedUpload } from '../presign';
import { type ObjectStorageConfig } from '../config';
import {
  ObjectStorageConfigError,
  ObjectStorageTimeoutError,
  type CompleteMultipartUploadInput,
  type CopyObjectIfMatchInput,
  type CreateMultipartUploadInput,
  type MultipartUploadHandle,
  type ObjectEncryption,
  type ObjectStore,
  type PendingMultipartUpload,
  type PresignPutInput,
  type PutObjectInput,
  type StoredObjectBytes,
  type StoredObjectHead,
  type StoredObjectStream,
  type UploadPartInput,
  type UploadedPart,
} from '../types';

const MISSING_OBJECT_ERROR_NAMES = new Set(['NoSuchKey', 'NotFound']);
const PRECONDITION_FAILED_ERROR_NAME = 'PreconditionFailed';
const PRECONDITION_FAILED_STATUS = 412;
const COPY_METADATA_DIRECTIVE = 'COPY';
const SIGNABLE_UPLOAD_HEADERS = ['content-length', 'content-type'];
const KEY_SEPARATOR = '/';
const CHECKSUM_ALGORITHM = 'SHA256';
const REGION_METADATA_KEY = 'agi-region';
const ENCRYPTION_METADATA_KEY = 'agi-encryption';

export interface S3ClientTimeouts {
  connectionTimeoutMs: number;
  requestTimeoutMs: number;
}

export interface S3ObjectStoreOptions {
  client: S3Client;
  requestTimeoutMs: number;
  encryption?: ObjectEncryption;
  region?: string;
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
  const { client, requestTimeoutMs, encryption, region } = options;

  function objectMetadata(
    extra: Readonly<Record<string, string>> | undefined,
  ): Record<string, string> | undefined {
    const metadata: Record<string, string> = { ...extra };
    if (region) metadata[REGION_METADATA_KEY] = region;
    if (encryption) metadata[ENCRYPTION_METADATA_KEY] = encryption.algorithm;
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  function encryptionHeaders(): {
    ServerSideEncryption?: ServerSideEncryption;
    SSEKMSKeyId?: string;
  } {
    if (!encryption) return {};
    const algorithms = Object.values(ServerSideEncryption) as string[];
    if (!algorithms.includes(encryption.algorithm)) {
      throw new ObjectStorageConfigError(
        `"${encryption.algorithm}" is not an encryption this host offers: ${algorithms.join(', ')}`,
      );
    }
    return {
      ServerSideEncryption: encryption.algorithm as ServerSideEncryption,
      ...(encryption.keyId ? { SSEKMSKeyId: encryption.keyId } : {}),
    };
  }

  function encryptionOf(response: {
    ServerSideEncryption?: string;
    SSEKMSKeyId?: string;
    Metadata?: Record<string, string>;
  }): ObjectEncryption | undefined {
    const algorithm = response.ServerSideEncryption ?? response.Metadata?.[ENCRYPTION_METADATA_KEY];
    if (!algorithm) return undefined;
    return { algorithm, keyId: response.SSEKMSKeyId };
  }

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
          Metadata: objectMetadata(input.metadata),
          ...(input.checksumSha256 ? { ChecksumSHA256: input.checksumSha256 } : {}),
          ...encryptionHeaders(),
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
        const response = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: 'ENABLED' }),
        );
        return {
          contentLength: response.ContentLength,
          contentType: response.ContentType,
          etag: response.ETag,
          checksumSha256: response.ChecksumSHA256,
          encryption: encryptionOf(response),
          metadata: response.Metadata,
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
          expiresIn: bound.expiresInSeconds,
          signableHeaders: new Set(SIGNABLE_UPLOAD_HEADERS),
        },
      );
    },

    async createMultipartUpload(input: CreateMultipartUploadInput): Promise<MultipartUploadHandle> {
      const response = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: input.bucket,
          Key: input.key,
          ContentType: input.contentType,
          Metadata: objectMetadata(input.metadata),
          ChecksumAlgorithm: CHECKSUM_ALGORITHM,
          ...encryptionHeaders(),
        }),
      );
      if (!response.UploadId) {
        throw new ObjectStorageConfigError('The host did not open a multipart upload.');
      }
      return { bucket: input.bucket, key: input.key, uploadId: response.UploadId };
    },

    async uploadPart(input: UploadPartInput): Promise<UploadedPart> {
      const checksumSha256 = input.checksumSha256 ?? objectChecksum(input.body);
      const response = await client.send(
        new UploadPartCommand({
          Bucket: input.bucket,
          Key: input.key,
          UploadId: input.uploadId,
          PartNumber: input.partNumber,
          Body: input.body,
          ContentLength: input.body.byteLength,
          ChecksumSHA256: checksumSha256,
        }),
      );
      return {
        partNumber: input.partNumber,
        etag: response.ETag ?? '',
        size: input.body.byteLength,
        checksumSha256: response.ChecksumSHA256 ?? checksumSha256,
      };
    },

    async listUploadedParts(handle: MultipartUploadHandle): Promise<UploadedPart[]> {
      const response = await client.send(
        new ListPartsCommand({
          Bucket: handle.bucket,
          Key: handle.key,
          UploadId: handle.uploadId,
        }),
      );
      return (response.Parts ?? [])
        .filter((part) => part.PartNumber !== undefined)
        .map((part) => ({
          partNumber: part.PartNumber as number,
          etag: part.ETag ?? '',
          size: part.Size ?? 0,
          checksumSha256: part.ChecksumSHA256 ?? '',
        }))
        .sort((left, right) => left.partNumber - right.partNumber);
    },

    async completeMultipartUpload(input: CompleteMultipartUploadInput): Promise<void> {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: input.bucket,
          Key: input.key,
          UploadId: input.uploadId,
          MultipartUpload: {
            Parts: [...input.parts]
              .sort((left, right) => left.partNumber - right.partNumber)
              .map((part) => ({
                PartNumber: part.partNumber,
                ETag: part.etag,
                ChecksumSHA256: part.checksumSha256,
              })),
          },
        }),
      );
    },

    async abortMultipartUpload(handle: MultipartUploadHandle): Promise<void> {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: handle.bucket,
          Key: handle.key,
          UploadId: handle.uploadId,
        }),
      );
    },

    async listPendingMultipartUploads(
      bucket: string,
      prefix?: string,
    ): Promise<PendingMultipartUpload[]> {
      const pending: PendingMultipartUpload[] = [];
      let keyMarker: string | undefined;
      let uploadIdMarker: string | undefined;
      for (;;) {
        const response = await client.send(
          new ListMultipartUploadsCommand({
            Bucket: bucket,
            Prefix: prefix,
            KeyMarker: keyMarker,
            UploadIdMarker: uploadIdMarker,
          }),
        );
        for (const upload of response.Uploads ?? []) {
          if (!upload.Key || !upload.UploadId) continue;
          pending.push({
            key: upload.Key,
            uploadId: upload.UploadId,
            initiatedAtMs: upload.Initiated?.getTime() ?? 0,
          });
        }
        if (!response.IsTruncated) return pending;
        keyMarker = response.NextKeyMarker;
        uploadIdMarker = response.NextUploadIdMarker;
        if (!keyMarker && !uploadIdMarker) return pending;
      }
    },
  };
}
