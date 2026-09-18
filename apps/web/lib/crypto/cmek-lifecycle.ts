import { CMEK_DATA_KEY_LENGTH, type CmekKeyDescriptor, type CmekProviderRegistry } from './cmek';
import { envelopeKeyId, openEnvelope, sealEnvelope, type KeyRing } from './envelope';

/**
 * @file The operations a customer-managed key needs between provisioning and
 * revocation: prove the key works before it is switched on, move ciphertext off
 * a key before that key stops being readable, and prove that move finished.
 *
 * Nothing here talks to a database. The setup validator takes a provider
 * registry and calls the customer's KMS for real; the rewrap takes stores the
 * caller supplies, so the same code runs over a live table and over a fake.
 */

export const CMEK_SETUP_CHECK_IDS = Object.freeze([
  'provider_client',
  'key_uri',
  'key_region',
  'generate_data_key',
  'unwrap_data_key',
  'seal_open_round_trip',
] as const);

export type CmekSetupCheckId = (typeof CMEK_SETUP_CHECK_IDS)[number];

export type CmekSetupCheckState = 'pass' | 'fail' | 'skipped';

export interface CmekSetupCheck {
  id: CmekSetupCheckId;
  label: string;
  state: CmekSetupCheckState;
  detail: string | null;
}

export interface CmekSetupValidation {
  ok: boolean;
  descriptor: CmekKeyDescriptor;
  checks: readonly CmekSetupCheck[];
}

export interface ValidateCmekSetupInput {
  descriptor: CmekKeyDescriptor;
  registry: CmekProviderRegistry;
  /** The vendor regions the workspace's residency pin admits. */
  admittedRegions?: readonly string[];
}

const CHECK_LABELS: Record<CmekSetupCheckId, string> = {
  provider_client: 'This deployment can reach the key provider',
  key_uri: 'The key name is one the provider accepts',
  key_region: 'The key lives in a region this workspace admits',
  generate_data_key: 'The key can wrap a new data key',
  unwrap_data_key: 'The key can unwrap what it wrapped',
  seal_open_round_trip: 'A value sealed under the key opens again',
};

const AWS_KEY_ARN =
  /^arn:aws[a-z-]*:kms:([a-z0-9-]+):\d{12}:(key\/[A-Za-z0-9-]+|alias\/[A-Za-z0-9/_-]+)$/;
const AWS_BARE_KEY =
  /^(alias\/[A-Za-z0-9/_-]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const GCP_CRYPTO_KEY =
  /^projects\/[^/\s]+\/locations\/([^/\s]+)\/keyRings\/[^/\s]+\/cryptoKeys\/[^/\s]+$/;
const LOCAL_KEY_URI = /^local:\/\/[^\s]+$/;

/**
 * The shapes the three adapters in kms-providers.ts actually put on the wire.
 * A name that fails here would reach the vendor as a 404 the customer has no
 * way to read back to a typo.
 */
export function validateCmekKeyUri(descriptor: CmekKeyDescriptor): {
  ok: boolean;
  detail: string;
} {
  const uri = descriptor.keyUri.trim();
  switch (descriptor.provider) {
    case 'aws_kms': {
      const arn = AWS_KEY_ARN.exec(uri);
      if (arn) {
        const arnRegion = arn[1] as string;
        return arnRegion === descriptor.region
          ? { ok: true, detail: 'a key ARN in the declared region' }
          : {
              ok: false,
              detail: `the ARN names region "${arnRegion}" but the association declares "${descriptor.region}"`,
            };
      }
      return AWS_BARE_KEY.test(uri)
        ? { ok: true, detail: 'a key id or alias, resolved in the declared region' }
        : {
            ok: false,
            detail: 'expected a KMS key ARN, a key id, or an alias/ name',
          };
    }
    case 'gcp_kms': {
      const match = GCP_CRYPTO_KEY.exec(uri);
      if (!match) {
        return {
          ok: false,
          detail: 'expected projects/<p>/locations/<l>/keyRings/<r>/cryptoKeys/<k>',
        };
      }
      const location = match[1] as string;
      return location === descriptor.region || location === 'global'
        ? { ok: true, detail: 'a crypto key path in the declared location' }
        : {
            ok: false,
            detail: `the path names location "${location}" but the association declares "${descriptor.region}"`,
          };
    }
    case 'azure_key_vault': {
      let parsed: URL;
      try {
        parsed = new URL(uri);
      } catch {
        return { ok: false, detail: 'expected an https Key Vault key URL' };
      }
      if (parsed.protocol !== 'https:') {
        return { ok: false, detail: 'a Key Vault key must be addressed over https' };
      }
      if (parsed.search.length > 0) {
        return {
          ok: false,
          detail: 'the key URL carries a query string, which the adapter appends',
        };
      }
      return /^\/keys\/[^/]+(\/[^/]+)?$/.test(parsed.pathname)
        ? { ok: true, detail: 'a Key Vault key URL' }
        : { ok: false, detail: 'expected https://<vault>/keys/<name> with an optional version' };
    }
    case 'local':
      return LOCAL_KEY_URI.test(uri)
        ? { ok: true, detail: 'the local double, which no production deployment builds' }
        : { ok: false, detail: 'expected local://<name>' };
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs the customer's key before anything is sealed under it. Every failure is
 * returned rather than thrown: this answers a setup screen, and a stack trace
 * is not an instruction a customer can act on.
 */
export async function validateCmekSetup(
  input: ValidateCmekSetupInput,
): Promise<CmekSetupValidation> {
  const checks: CmekSetupCheck[] = [];
  const add = (id: CmekSetupCheckId, state: CmekSetupCheckState, detail: string | null) => {
    checks.push({ id, label: CHECK_LABELS[id], state, detail });
  };
  const skipRest = (from: CmekSetupCheckId): CmekSetupValidation => {
    const start = CMEK_SETUP_CHECK_IDS.indexOf(from);
    for (const id of CMEK_SETUP_CHECK_IDS.slice(start)) {
      add(id, 'skipped', 'not reached, because an earlier check failed');
    }
    return { ok: false, descriptor: input.descriptor, checks };
  };

  const client = input.registry[input.descriptor.provider];
  if (!client) {
    add(
      'provider_client',
      'fail',
      `this deployment holds no credentials for ${input.descriptor.provider}`,
    );
    return skipRest('key_uri');
  }
  add('provider_client', 'pass', null);

  const uri = validateCmekKeyUri(input.descriptor);
  add('key_uri', uri.ok ? 'pass' : 'fail', uri.detail);
  if (!uri.ok) return skipRest('key_region');

  const admitted = input.admittedRegions ?? null;
  if (
    admitted &&
    !admitted.some((entry) => entry.toLowerCase() === input.descriptor.region.toLowerCase())
  ) {
    add(
      'key_region',
      'fail',
      `this workspace admits [${admitted.join(', ')}] and the key declares "${input.descriptor.region}"`,
    );
    return skipRest('generate_data_key');
  }
  add('key_region', 'pass', admitted ? null : 'no residency pin restricts this workspace');

  let generated: { wrapped: string; plaintext: Buffer };
  try {
    generated = await client.generateDataKey(input.descriptor);
  } catch (error) {
    add('generate_data_key', 'fail', reasonOf(error));
    return skipRest('unwrap_data_key');
  }
  if (generated.plaintext.length !== CMEK_DATA_KEY_LENGTH) {
    add(
      'generate_data_key',
      'fail',
      `the provider returned ${generated.plaintext.length} bytes where a data key is ${CMEK_DATA_KEY_LENGTH}`,
    );
    return skipRest('unwrap_data_key');
  }
  add('generate_data_key', 'pass', null);

  let unwrapped: Buffer;
  try {
    unwrapped = await client.unwrapDataKey(input.descriptor, generated.wrapped);
  } catch (error) {
    add('unwrap_data_key', 'fail', reasonOf(error));
    return skipRest('seal_open_round_trip');
  }
  if (!unwrapped.equals(generated.plaintext)) {
    add('unwrap_data_key', 'fail', 'the provider returned different material than it wrapped');
    return skipRest('seal_open_round_trip');
  }
  add('unwrap_data_key', 'pass', null);

  try {
    const ring: KeyRing = { active: { id: 'setup', material: unwrapped }, retired: [] };
    const probe = 'customer-managed key setup probe';
    const opened = openEnvelope(ring, sealEnvelope(ring, probe), 'hex-triple');
    add(
      'seal_open_round_trip',
      opened.plaintext === probe ? 'pass' : 'fail',
      opened.plaintext === probe ? null : 'the probe did not survive a seal and open',
    );
  } catch (error) {
    add('seal_open_round_trip', 'fail', reasonOf(error));
  }

  return {
    ok: checks.every((check) => check.state === 'pass'),
    descriptor: input.descriptor,
    checks,
  };
}

export interface RewrapEntry {
  id: string;
  sealed: string;
  context?: string;
}

/**
 * One place ciphertext sealed under an organization's ring lives. A caller
 * supplies the SQL; this module supplies the crypto and the accounting.
 */
export interface RewrapStore {
  readonly name: string;
  countSealedUnder(keyVersion: string): Promise<number>;
  readSealedUnder(keyVersion: string, limit: number): Promise<readonly RewrapEntry[]>;
  writeResealed(entries: readonly RewrapEntry[]): Promise<void>;
}

export interface RewrapFailure {
  store: string;
  id: string;
  reason: string;
}

export interface RewrapOutcome {
  fromVersion: string;
  toVersion: string;
  scanned: number;
  resealed: number;
  remaining: number;
  complete: boolean;
  failures: readonly RewrapFailure[];
}

export interface RunKeyRewrapInput {
  ring: KeyRing;
  fromVersion: string;
  stores: readonly RewrapStore[];
  batchSize?: number;
  maxBatches?: number;
}

export const REWRAP_BATCH = 200;
export const REWRAP_MAX_BATCHES = 50;

export class CmekRewrapIncompleteError extends Error {
  readonly outcome: RewrapOutcome;

  constructor(outcome: RewrapOutcome) {
    super(
      `Key version "${outcome.fromVersion}" still seals ${outcome.remaining} row(s) and the ` +
        `rewrap onto "${outcome.toVersion}" recorded ${outcome.failures.length} failure(s). ` +
        'Disabling it now would make that data unreadable, so the retirement is refused.',
    );
    this.name = 'CmekRewrapIncompleteError';
    this.outcome = outcome;
  }
}

export class CmekNoSealedStoreError extends Error {
  constructor() {
    super(
      'A rewrap was asked for with no sealed store declared. An empty run would report ' +
        'completion it never established, so it is refused.',
    );
    this.name = 'CmekNoSealedStoreError';
  }
}

function reseal(ring: KeyRing, fromVersion: string, entry: RewrapEntry): RewrapEntry {
  const keyId = envelopeKeyId(entry.sealed);
  if (keyId === null) {
    throw new Error('not a versioned envelope, so the version it is sealed under cannot be read');
  }
  if (keyId !== fromVersion) {
    throw new Error(`sealed under "${keyId}", which is not the version being retired`);
  }
  const opened = openEnvelope(ring, entry.sealed, 'hex-triple', entry.context);
  const sealed = sealEnvelope(
    ring,
    opened.plaintext,
    'versioned',
    opened.contextBound ? entry.context : undefined,
  );
  return entry.context === undefined
    ? { id: entry.id, sealed }
    : { id: entry.id, sealed, context: entry.context };
}

/**
 * Moves every row still sealed under `fromVersion` onto the ring's active key.
 * A row that will not open is recorded and skipped rather than failing the run,
 * because one unreadable row must not stop the other nine thousand moving.
 */
export async function runKeyRewrap(input: RunKeyRewrapInput): Promise<RewrapOutcome> {
  const toVersion = input.ring.active.id;
  if (input.stores.length === 0) throw new CmekNoSealedStoreError();
  if (input.fromVersion === toVersion) {
    throw new Error(`Rewrap source and destination are both "${toVersion}"`);
  }

  const batchSize = input.batchSize ?? REWRAP_BATCH;
  const maxBatches = input.maxBatches ?? REWRAP_MAX_BATCHES;
  const failures: RewrapFailure[] = [];
  let scanned = 0;
  let resealed = 0;

  for (const store of input.stores) {
    // A row that will not open stays sealed, so the next read returns it again.
    // Without this it would be counted as a new failure on every batch.
    const failed = new Set<string>();
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const entries = await store.readSealedUnder(input.fromVersion, batchSize);
      const pending = entries.filter((entry) => !failed.has(entry.id));
      if (pending.length === 0) break;
      scanned += pending.length;

      const next: RewrapEntry[] = [];
      for (const entry of pending) {
        try {
          next.push(reseal(input.ring, input.fromVersion, entry));
        } catch (error) {
          failed.add(entry.id);
          failures.push({ store: store.name, id: entry.id, reason: reasonOf(error) });
        }
      }
      if (next.length === 0) continue;
      await store.writeResealed(next);
      resealed += next.length;
    }
  }

  let remaining = 0;
  for (const store of input.stores) {
    remaining += await store.countSealedUnder(input.fromVersion);
  }

  return {
    fromVersion: input.fromVersion,
    toVersion,
    scanned,
    resealed,
    remaining,
    complete: remaining === 0 && failures.length === 0,
    failures,
  };
}

export function assertRewrapComplete(outcome: RewrapOutcome): void {
  if (outcome.complete) return;
  throw new CmekRewrapIncompleteError(outcome);
}
