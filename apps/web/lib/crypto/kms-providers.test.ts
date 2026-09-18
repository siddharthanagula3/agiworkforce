import { randomBytes } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { signAwsRequest } from './aws-sigv4';
import { CmekProviderUnconfiguredError, type CmekKeyDescriptor } from './cmek';
import {
  KmsRequestError,
  createAwsKmsProvider,
  createAzureKeyVaultProvider,
  createGcpKmsProvider,
  createKmsProviderRegistry,
} from './kms-providers';

const AWS_ENV = {
  AGI_KMS_AWS_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE00',
  AGI_KMS_AWS_SECRET_ACCESS_KEY: 'a'.repeat(40),
};
const AZURE_ENV = {
  AGI_KMS_AZURE_TENANT_ID: 'tenant-1',
  AGI_KMS_AZURE_CLIENT_ID: 'client-1',
  AGI_KMS_AZURE_CLIENT_SECRET: 'secret-1',
};

const AWS_KEY: CmekKeyDescriptor = {
  provider: 'aws_kms',
  keyUri: 'arn:aws:kms:us-east-1:123456789012:key/abcd',
  region: 'us-east-1',
};
const GCP_KEY: CmekKeyDescriptor = {
  provider: 'gcp_kms',
  keyUri: 'projects/p/locations/europe-west1/keyRings/r/cryptoKeys/k',
  region: 'europe-west1',
};
const AZURE_KEY: CmekKeyDescriptor = {
  provider: 'azure_key_vault',
  keyUri: 'https://acme.vault.azure.net/keys/tenant/1',
  region: 'westeurope',
};

interface Call {
  url: string;
  init: RequestInit;
}

function responder(bodies: Array<Record<string, unknown> | { status: number; body: string }>) {
  const calls: Call[] = [];
  let index = 0;
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = bodies[Math.min(index, bodies.length - 1)];
    index += 1;
    if (next && 'status' in next && typeof next.status === 'number') {
      return new Response(next.body as string, { status: next.status });
    }
    return new Response(JSON.stringify(next), { status: 200 });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

function body(call: Call): Record<string, unknown> {
  return JSON.parse(call.init.body as string) as Record<string, unknown>;
}

describe('AWS SigV4', () => {
  it('signs the canonical request AWS documents, deterministically', () => {
    const signed = signAwsRequest({
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET' },
      region: 'us-east-1',
      service: 'kms',
      host: 'kms.us-east-1.amazonaws.com',
      body: '{}',
      headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'TrentService.X' },
      now: new Date('2026-09-17T00:00:00Z'),
    });
    const again = signAwsRequest({
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET' },
      region: 'us-east-1',
      service: 'kms',
      host: 'kms.us-east-1.amazonaws.com',
      body: '{}',
      headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'TrentService.X' },
      now: new Date('2026-09-17T00:00:00Z'),
    });

    expect(signed.headers['x-amz-date']).toBe('20260917T000000Z');
    expect(signed.headers['authorization']).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKID\/20260917\/us-east-1\/kms\/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-target, Signature=[0-9a-f]{64}$/,
    );
    expect(again.headers['authorization']).toBe(signed.headers['authorization']);
  });

  it('signs the session token in when one is held, rather than sending it unsigned', () => {
    const signed = signAwsRequest({
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET', sessionToken: 'ST' },
      region: 'eu-west-1',
      service: 'kms',
      host: 'kms.eu-west-1.amazonaws.com',
      body: '{}',
      headers: { 'content-type': 'application/x-amz-json-1.1' },
      now: new Date('2026-09-17T00:00:00Z'),
    });
    expect(signed.headers['authorization']).toContain('x-amz-security-token');
    expect(signed.headers['x-amz-security-token']).toBe('ST');
  });
});

describe('AWS KMS', () => {
  it('asks KMS to generate the data key and keeps only what it returned', async () => {
    const plaintext = randomBytes(32);
    const { calls, fetchImpl } = responder([
      { CiphertextBlob: 'd3JhcHBlZA==', Plaintext: plaintext.toString('base64') },
    ]);
    const provider = createAwsKmsProvider({ env: AWS_ENV, fetchImpl });

    const generated = await provider.generateDataKey(AWS_KEY);

    expect(generated.plaintext.equals(plaintext)).toBe(true);
    expect(generated.wrapped).toBe('d3JhcHBlZA==');
    expect(calls[0]?.url).toBe('https://kms.us-east-1.amazonaws.com/');
    expect((calls[0]?.init.headers as Record<string, string>)['x-amz-target']).toBe(
      'TrentService.GenerateDataKey',
    );
    expect(body(calls[0] as Call)).toEqual({ KeyId: AWS_KEY.keyUri, NumberOfBytes: 32 });
  });

  it('decrypts a wrapped key through the customer key, not a local one', async () => {
    const material = randomBytes(32);
    const { calls, fetchImpl } = responder([{ Plaintext: material.toString('base64') }]);
    const provider = createAwsKmsProvider({ env: AWS_ENV, fetchImpl });

    const unwrapped = await provider.unwrapDataKey(AWS_KEY, 'd3JhcHBlZA==');

    expect(unwrapped.equals(material)).toBe(true);
    expect((calls[0]?.init.headers as Record<string, string>)['x-amz-target']).toBe(
      'TrentService.Decrypt',
    );
    expect(body(calls[0] as Call)).toEqual({
      KeyId: AWS_KEY.keyUri,
      CiphertextBlob: 'd3JhcHBlZA==',
    });
  });

  it('surfaces a refusal as a refusal instead of an empty key', async () => {
    const { fetchImpl } = responder([{ status: 400, body: '{"__type":"AccessDeniedException"}' }]);
    const provider = createAwsKmsProvider({ env: AWS_ENV, fetchImpl });
    await expect(provider.unwrapDataKey(AWS_KEY, 'AAAA')).rejects.toBeInstanceOf(KmsRequestError);
  });

  it('refuses a response whose key is the wrong length', async () => {
    const { fetchImpl } = responder([{ Plaintext: Buffer.alloc(16).toString('base64') }]);
    const provider = createAwsKmsProvider({ env: AWS_ENV, fetchImpl });
    await expect(provider.unwrapDataKey(AWS_KEY, 'AAAA')).rejects.toThrow(/32/);
  });

  it('is not constructed at all without credentials', () => {
    expect(() => createAwsKmsProvider({ env: {} })).toThrow(CmekProviderUnconfiguredError);
  });
});

describe('GCP KMS', () => {
  it('wraps a locally generated data key under the customer key', async () => {
    const { calls, fetchImpl } = responder([{ ciphertext: 'Y2lwaGVy' }]);
    const provider = createGcpKmsProvider({
      env: {},
      fetchImpl,
      accessToken: async () => 'token-1',
    });

    const generated = await provider.generateDataKey(GCP_KEY);

    expect(generated.plaintext).toHaveLength(32);
    expect(generated.wrapped).toBe('Y2lwaGVy');
    expect(calls[0]?.url).toBe(`https://cloudkms.googleapis.com/v1/${GCP_KEY.keyUri}:encrypt`);
    expect((calls[0]?.init.headers as Record<string, string>)['authorization']).toBe(
      'Bearer token-1',
    );
    expect(body(calls[0] as Call)['plaintext']).toBe(generated.plaintext.toString('base64'));
  });

  it('unwraps through the decrypt endpoint', async () => {
    const material = randomBytes(32);
    const { calls, fetchImpl } = responder([{ plaintext: material.toString('base64') }]);
    const provider = createGcpKmsProvider({
      env: {},
      fetchImpl,
      accessToken: async () => 'token-1',
    });

    await expect(provider.unwrapDataKey(GCP_KEY, 'Y2lwaGVy')).resolves.toEqual(material);
    expect(calls[0]?.url).toBe(`https://cloudkms.googleapis.com/v1/${GCP_KEY.keyUri}:decrypt`);
  });

  it('refuses when no credentials resolve to a token', async () => {
    const { fetchImpl } = responder([{ plaintext: '' }]);
    const provider = createGcpKmsProvider({ env: {}, fetchImpl, accessToken: async () => '' });
    await expect(provider.unwrapDataKey(GCP_KEY, 'Y2lwaGVy')).rejects.toBeInstanceOf(
      CmekProviderUnconfiguredError,
    );
  });
});

describe('Azure Key Vault', () => {
  it('takes a client-credentials token and wraps with RSA-OAEP-256', async () => {
    const { calls, fetchImpl } = responder([
      { access_token: 'azure-token' },
      { value: 'd3JhcHBlZA' },
    ]);
    const provider = createAzureKeyVaultProvider({ env: AZURE_ENV, fetchImpl });

    const generated = await provider.generateDataKey(AZURE_KEY);

    expect(generated.plaintext).toHaveLength(32);
    expect(generated.wrapped).toBe('d3JhcHBlZA');
    expect(calls[0]?.url).toBe('https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token');
    expect(calls[1]?.url).toBe(`${AZURE_KEY.keyUri}/wrapkey?api-version=7.4`);
    expect(body(calls[1] as Call)).toEqual({
      alg: 'RSA-OAEP-256',
      value: generated.plaintext.toString('base64url'),
    });
  });

  it('unwraps base64url material back to a data key', async () => {
    const material = randomBytes(32);
    const { calls, fetchImpl } = responder([
      { access_token: 'azure-token' },
      { value: material.toString('base64url') },
    ]);
    const provider = createAzureKeyVaultProvider({ env: AZURE_ENV, fetchImpl });

    await expect(provider.unwrapDataKey(AZURE_KEY, 'd3JhcHBlZA')).resolves.toEqual(material);
    expect(calls[1]?.url).toBe(`${AZURE_KEY.keyUri}/unwrapkey?api-version=7.4`);
  });

  it('is not constructed without a tenant, client and secret', () => {
    expect(() => createAzureKeyVaultProvider({ env: { AGI_KMS_AZURE_TENANT_ID: 't' } })).toThrow(
      CmekProviderUnconfiguredError,
    );
  });
});

describe('the registry', () => {
  it('holds only the providers this deployment has credentials for', () => {
    const registry = createKmsProviderRegistry({ env: { ...AWS_ENV, ...AZURE_ENV } });
    expect(Object.keys(registry).sort()).toEqual(['aws_kms', 'azure_key_vault']);
  });

  it('is empty rather than half-built when nothing is configured', () => {
    expect(createKmsProviderRegistry({ env: {} })).toEqual({});
  });
});
