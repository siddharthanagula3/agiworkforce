import 'server-only';

import {
  createKmsKeyProvider,
  envKeyProvider,
  openEnvelope,
  type KeyRing,
  type LoadKeyRingOptions,
} from './envelope';
import { CMEK_PROVIDER_IDS, type CmekProviderId, type CmekProviderRegistry } from './cmek';

// Resolution stays synchronous because a KMS round trip per envelope would sit
// in the path of every sign-in: preload() unwraps once, and a read before it fails.

export const PLATFORM_KEY_PROVIDER_ENV = 'AGI_PLATFORM_KEY_PROVIDER';
export const PLATFORM_DATA_KEY_ENV = 'AGI_PLATFORM_DATA_KEY';
export const PLATFORM_KMS_KEY_URI_ENV = 'AGI_PLATFORM_KMS_KEY_URI';
export const PLATFORM_KMS_REGION_ENV = 'AGI_PLATFORM_KMS_REGION';

export type PlatformKeyProviderId = 'env' | CmekProviderId;

export interface PlatformKeyPosture {
  provider: PlatformKeyProviderId;
  /** True once the wrapped platform data key has been unwrapped for this process. */
  ready: boolean;
  /** The names resolved so far, so a report can say what is covered. */
  resolved: readonly string[];
}

export class PlatformKeyProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlatformKeyProviderUnavailableError';
  }
}

function isPlatformKeyProviderId(value: string): value is PlatformKeyProviderId {
  return value === 'env' || (CMEK_PROVIDER_IDS as readonly string[]).includes(value);
}

export interface PlatformKeyServiceOptions {
  env?: Record<string, string | undefined>;
  registry?: CmekProviderRegistry;
  cacheTtlMs?: number;
}

export interface PlatformKeyService {
  providerId(): PlatformKeyProviderId;
  posture(): PlatformKeyPosture;
  preload(): Promise<PlatformKeyPosture>;
  keyRing(envName: string, options?: LoadKeyRingOptions): KeyRing;
  secret(envName: string): string;
}

const PLATFORM_SECRET_CONTEXT = 'agi:platform-secret';

export function createPlatformKeyService(
  options: PlatformKeyServiceOptions = {},
): PlatformKeyService {
  const resolved = new Set<string>();
  let unsealingRing: KeyRing | null = null;

  function env(): Record<string, string | undefined> {
    return options.env ?? process.env;
  }

  function providerId(): PlatformKeyProviderId {
    const raw = env()[PLATFORM_KEY_PROVIDER_ENV]?.trim();
    if (!raw) return 'env';
    if (!isPlatformKeyProviderId(raw)) {
      throw new PlatformKeyProviderUnavailableError(
        `${PLATFORM_KEY_PROVIDER_ENV}=${raw} names no key provider this build has. ` +
          `Use one of: env, ${CMEK_PROVIDER_IDS.join(', ')}.`,
      );
    }
    return raw;
  }

  function descriptorFor(provider: CmekProviderId) {
    const current = env();
    const keyUri = current[PLATFORM_KMS_KEY_URI_ENV]?.trim();
    const region = current[PLATFORM_KMS_REGION_ENV]?.trim();
    if (!keyUri || !region) {
      throw new PlatformKeyProviderUnavailableError(
        `${PLATFORM_KEY_PROVIDER_ENV}=${provider} needs ${PLATFORM_KMS_KEY_URI_ENV} and ` +
          `${PLATFORM_KMS_REGION_ENV} to name the key that wraps the platform data key.`,
      );
    }
    return { provider, keyUri, region };
  }

  async function preload(): Promise<PlatformKeyPosture> {
    const provider = providerId();
    if (provider === 'env') return posture();
    const client = options.registry?.[provider];
    if (!client) {
      throw new PlatformKeyProviderUnavailableError(
        `No client is configured for the "${provider}" platform key provider. ` +
          'The deployment holds no credentials for it, so platform secrets cannot be unsealed.',
      );
    }
    const descriptor = descriptorFor(provider);
    const kms = createKmsKeyProvider(
      (wrapped) => client.unwrapDataKey(descriptor, wrapped),
      options.cacheTtlMs === undefined ? {} : { cacheTtlMs: options.cacheTtlMs },
    );
    const ring = await kms.resolveKeyRing(PLATFORM_DATA_KEY_ENV, { env: env() });
    unsealingRing = { active: ring.active, retired: ring.retired };
    return posture();
  }

  function requireUnsealingRing(name: string): KeyRing {
    if (unsealingRing) return unsealingRing;
    throw new PlatformKeyProviderUnavailableError(
      `${name} is sealed under the platform key provider and this process has not unsealed it. ` +
        'Call preloadPlatformKeys() during startup before any request resolves a platform secret.',
    );
  }

  function rawValue(envName: string): string {
    const raw = env()[envName];
    if (!raw) {
      throw new PlatformKeyProviderUnavailableError(`${envName} is not set.`);
    }
    return raw;
  }

  function unseal(value: string, name: string): string {
    return openEnvelope(requireUnsealingRing(name), value, 'b64-iv-ct-tag', {
      value: PLATFORM_SECRET_CONTEXT,
      acceptUnbound: false,
    }).plaintext;
  }

  function secret(envName: string): string {
    const provider = providerId();
    const raw = rawValue(envName);
    resolved.add(envName);
    return provider === 'env' ? raw : unseal(raw, envName);
  }

  function keyRing(envName: string, ringOptions: LoadKeyRingOptions = {}): KeyRing {
    const provider = providerId();
    resolved.add(envName);
    if (provider === 'env') {
      const ring = envKeyProvider.resolveKeyRing(envName, {
        ...ringOptions,
        env: ringOptions.env ?? env(),
      });
      return { active: ring.active, retired: ring.retired };
    }
    const current = env();
    const unsealedEnv: Record<string, string | undefined> = {
      ...current,
      [envName]: secret(envName),
    };
    // A rotation window keeps retired versions in <ENV>_RETIRED as "<id>:<material>",
    // and under a KMS provider each material is an envelope of its own. Unsealing
    // only the active key would leave every ciphertext written before the rotation
    // unopenable, which is the failure a rotation exists to avoid.
    const retired = current[`${envName}_RETIRED`]?.trim();
    if (retired) {
      unsealedEnv[`${envName}_RETIRED`] = retired
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => {
          const separator = entry.indexOf(':');
          if (separator <= 0) return entry;
          return `${entry.slice(0, separator)}:${unseal(
            entry.slice(separator + 1),
            `${envName}_RETIRED`,
          )}`;
        })
        .join(',');
    }
    const ring = envKeyProvider.resolveKeyRing(envName, { ...ringOptions, env: unsealedEnv });
    return { active: ring.active, retired: ring.retired };
  }

  function posture(): PlatformKeyPosture {
    const provider = providerId();
    return {
      provider,
      ready: provider === 'env' || unsealingRing !== null,
      resolved: [...resolved].sort(),
    };
  }

  return { providerId, posture, preload, keyRing, secret };
}

let defaultService: PlatformKeyService | null = null;

function service(): PlatformKeyService {
  if (!defaultService) defaultService = createPlatformKeyService();
  return defaultService;
}

/**
 * Wires the process's platform key service to the KMS clients this deployment
 * holds credentials for, and unseals the platform data key once. Safe to call
 * more than once; the second call re-reads the environment.
 */
export async function preloadPlatformKeys(
  registry: CmekProviderRegistry,
): Promise<PlatformKeyPosture> {
  defaultService = createPlatformKeyService({ registry });
  return defaultService.preload();
}

export function platformKeyRing(envName: string, options?: LoadKeyRingOptions): KeyRing {
  return service().keyRing(envName, options);
}

export function platformSecret(envName: string): string {
  return service().secret(envName);
}

export function platformKeyPosture(): PlatformKeyPosture {
  return service().posture();
}

export function platformKeyProviderId(): PlatformKeyProviderId {
  return service().providerId();
}
