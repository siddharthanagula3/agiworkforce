import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { CmekKeyDescriptor, CmekProvider } from './cmek';
import {
  createAwsKmsProvider,
  createAzureKeyVaultProvider,
  createGcpKmsProvider,
  type KmsFetch,
} from './kms-providers';

const UNANSWERED_FOR_MS = 2_000;

function hangingKms(): { fetchImpl: KmsFetch; signals: Array<AbortSignal | null> } {
  const signals: Array<AbortSignal | null> = [];
  const fetchImpl: KmsFetch = (_url, init) => {
    signals.push(init.signal ?? null);
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
  };
  return { fetchImpl, signals };
}

async function settlesWithin(work: Promise<unknown>, ms: number): Promise<'rejected' | 'pending'> {
  return Promise.race([
    work.then(
      () => 'pending' as const,
      () => 'rejected' as const,
    ),
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), ms)),
  ]);
}

const CASES: Array<{
  name: string;
  build: (fetchImpl: KmsFetch) => CmekProvider;
  key: CmekKeyDescriptor;
}> = [
  {
    name: 'aws_kms',
    build: (fetchImpl) =>
      createAwsKmsProvider({
        env: {
          AGI_KMS_AWS_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE00',
          AGI_KMS_AWS_SECRET_ACCESS_KEY: 'a'.repeat(40),
        },
        fetchImpl,
        requestTimeoutMs: 50,
      }),
    key: {
      provider: 'aws_kms',
      keyUri: 'arn:aws:kms:us-east-1:123456789012:key/abcd',
      region: 'us-east-1',
    },
  },
  {
    name: 'gcp_kms',
    build: (fetchImpl) =>
      createGcpKmsProvider({
        accessToken: async () => 'token',
        fetchImpl,
        requestTimeoutMs: 50,
      }),
    key: {
      provider: 'gcp_kms',
      keyUri: 'projects/p/locations/europe-west1/keyRings/r/cryptoKeys/k',
      region: 'europe-west1',
    },
  },
  {
    name: 'azure_key_vault',
    build: (fetchImpl) =>
      createAzureKeyVaultProvider({
        env: {
          AGI_KMS_AZURE_TENANT_ID: 'tenant-1',
          AGI_KMS_AZURE_CLIENT_ID: 'client-1',
          AGI_KMS_AZURE_CLIENT_SECRET: 'secret-1',
        },
        fetchImpl,
        requestTimeoutMs: 50,
      }),
    key: {
      provider: 'azure_key_vault',
      keyUri: 'https://acme.vault.azure.net/keys/tenant/1',
      region: 'westeurope',
    },
  },
];

describe('KMS requests are bounded in time', () => {
  for (const { name, build, key } of CASES) {
    it(`${name}: an unwrap the KMS never answers is refused instead of hanging the request`, async () => {
      const { fetchImpl, signals } = hangingKms();
      const provider = build(fetchImpl);

      const outcome = await settlesWithin(
        provider.unwrapDataKey(key, 'd3JhcHBlZA'),
        UNANSWERED_FOR_MS,
      );

      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0]).not.toBeNull();
      expect(outcome).toBe('rejected');
    });
  }
});
