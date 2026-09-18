import { createHash, createHmac } from 'node:crypto';

// @aws-sdk/client-kms is not a dependency, so the KMS request is signed here
// against the signing example AWS publishes with the SigV4 specification.

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | undefined;
}

export interface SignedAwsRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

export interface SignAwsRequestInput {
  credentials: AwsCredentials;
  region: string;
  service: string;
  host: string;
  path?: string;
  body: string;
  headers: Record<string, string>;
  now?: Date;
}

const ALGORITHM = 'AWS4-HMAC-SHA256';
const TERMINATOR = 'aws4_request';

function amzDate(now: Date): { stamp: string; date: string } {
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { stamp, date: stamp.slice(0, 8) };
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function signingKey(secret: string, date: string, region: string, service: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), TERMINATOR);
}

export function signAwsRequest(input: SignAwsRequestInput): SignedAwsRequest {
  const { stamp, date } = amzDate(input.now ?? new Date());
  const path = input.path ?? '/';

  const headers: Record<string, string> = {
    ...input.headers,
    host: input.host,
    'x-amz-date': stamp,
  };
  if (input.credentials.sessionToken) {
    headers['x-amz-security-token'] = input.credentials.sessionToken;
  }

  const canonicalNames = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const byLowerName = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value.trim()]),
  );
  const canonicalHeaders = canonicalNames
    .map((name) => `${name}:${byLowerName.get(name) ?? ''}\n`)
    .join('');
  const signedHeaders = canonicalNames.join(';');
  const payloadHash = sha256Hex(input.body);

  const canonicalRequest = ['POST', path, '', canonicalHeaders, signedHeaders, payloadHash].join(
    '\n',
  );

  const scope = `${date}/${input.region}/${input.service}/${TERMINATOR}`;
  const stringToSign = [ALGORITHM, stamp, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = createHmac(
    'sha256',
    signingKey(input.credentials.secretAccessKey, date, input.region, input.service),
  )
    .update(stringToSign, 'utf8')
    .digest('hex');

  return {
    url: `https://${input.host}${path}`,
    method: 'POST',
    headers: {
      ...headers,
      authorization:
        `${ALGORITHM} Credential=${input.credentials.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: input.body,
  };
}
