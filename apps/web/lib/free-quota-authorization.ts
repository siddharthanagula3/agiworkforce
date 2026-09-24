import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { KeyValueStore } from '@agiworkforce/key-value';
import { classifyError } from '@agiworkforce/provider-runtime';
import {
  getProviderOffering,
  listCanonicalModels,
  listManagedRoutesForModel,
  type ProviderOffering,
} from '@agiworkforce/types';
import type { FreeQuotaStatus } from '@/features/models/lib/free-quota-types';
import type { FreeQuotaObservation } from '@/lib/server/free-pools';

const BENEFITS_PAGE = 'https://home.qwencloud.com/benefits';
const SHA256_HEX = /^[a-f0-9]{64}$/;

export const VerificationSchema = z.object({
  localUserId: z.string().min(1).optional(),
  sourceUrl: z.literal(BENEFITS_PAGE),
  checkedAtMs: z.number().int().positive(),
  credentialSha256: z.string().regex(SHA256_HEX),
  offerings: z.array(
    z.object({
      offeringKey: z.string().min(1),
      quotaOnly: z.literal(true),
      unit: z.enum(['tokens', 'images', 'seconds']),
      remaining: z.number().finite().nonnegative(),
      expiresAtMs: z.number().int().positive(),
    }),
  ),
});

export const PolicySchema = z.object({
  verificationMaxAgeMs: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  minimumChatQuota: z.number().int().positive(),
  imageSize: z.string().regex(/^\d+\*\d+$/),
  videoSize: z.string().regex(/^\d+\*\d+$/),
  videoSeconds: z.number().int().positive(),
  requestTimeoutMs: z.number().int().positive(),
  pollIntervalMs: z.number().int().positive(),
  maxPolls: z.number().int().positive(),
  attestationMaxAgeMs: z.number().int().positive(),
  chatMaxOutputTokens: z.number().int().positive(),
  chatImageReserveTokens: z.number().int().positive(),
  chatRequestTimeoutMs: z.number().int().positive(),
  allowanceUsablePercent: z.number().int().min(1).max(100),
});

export const QuotaAttestationSchema = z.object({
  sourceUrl: z.literal(BENEFITS_PAGE),
  checkedAtMs: z.number().int().positive(),
  credentialSha256: z.string().regex(SHA256_HEX),
  quotaOnlyOfferings: z.union([z.literal('all'), z.array(z.string().min(1)).min(1)]),
  attestedBy: z.string().min(1),
});

export type FreeQuotaPolicy = z.infer<typeof PolicySchema>;
export type QuotaAttestation = z.infer<typeof QuotaAttestationSchema>;
type QuotaVerification = z.infer<typeof VerificationSchema>;

export function credentialSha256(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function quotaCredentialMatches(
  document: { credentialSha256: string },
  apiKey: string,
): boolean {
  return Boolean(apiKey) && document.credentialSha256 === credentialSha256(apiKey);
}

export async function readLocalQuotaVerification() {
  const path = resolve(process.cwd(), '.cache/qwen-quota-experiments/account-verification.json');
  return VerificationSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

export function attestationFromVerification(
  verification: QuotaVerification,
): QuotaAttestation | null {
  const offerings = verification.offerings
    .filter((entry) => entry.quotaOnly && entry.remaining > 0)
    .map((entry) => entry.offeringKey);
  if (offerings.length === 0) return null;
  return {
    sourceUrl: verification.sourceUrl,
    checkedAtMs: verification.checkedAtMs,
    credentialSha256: verification.credentialSha256,
    quotaOnlyOfferings: offerings,
    attestedBy: verification.localUserId ?? 'local-verification',
  };
}

const STATE_PREFIX = 'agi-fquota';
const ATTESTATION_KEY = `${STATE_PREFIX}:attestation`;
const CREDENTIAL_SCOPE_LENGTH = 16;
const TURN_SCOPE_LENGTH = 32;
const SECONDS_PER_DAY = 24 * 60 * 60;
const MS_PER_SECOND = 1_000;
const HOLD_RETENTION_SECONDS = 120 * SECONDS_PER_DAY;
const TURN_CLAIM_TTL_SECONDS = SECONDS_PER_DAY;
const PERCENT = 100;

function credentialScope(apiKey: string): string {
  return credentialSha256(apiKey).slice(0, CREDENTIAL_SCOPE_LENGTH);
}

function holdsKey(apiKey: string): string {
  return `${STATE_PREFIX}:holds:${credentialScope(apiKey)}`;
}

function suspensionKey(apiKey: string): string {
  return `${STATE_PREFIX}:suspended:${credentialScope(apiKey)}`;
}

function allowanceKey(apiKey: string, observedOn: string, offeringKey: string): string {
  return `${STATE_PREFIX}:used:${credentialScope(apiKey)}:${observedOn}:${offeringKey}`;
}

function turnKey(userId: string, requestId: string): string {
  const scope = createHash('sha256').update(`${userId}\n${requestId}`).digest('hex');
  return `${STATE_PREFIX}:turn:${scope.slice(0, TURN_SCOPE_LENGTH)}`;
}

const HoldSchema = z.object({
  cause: z.enum(['exhausted', 'billing']),
  atMs: z.number().int().positive(),
});

const SuspensionSchema = z.object({
  atMs: z.number().int().positive(),
  signal: z.string().min(1).max(64),
});

export type FreeQuotaHoldCause = z.infer<typeof HoldSchema>['cause'];

function decoded(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export interface FreeQuotaState {
  attestation: QuotaAttestation | null;
  suspendedAtMs: number | null;
  holds: ReadonlyMap<string, FreeQuotaHoldCause>;
  used: ReadonlyMap<string, number>;
}

export async function readFreeQuotaState(
  store: KeyValueStore,
  input: { apiKey: string; observedOn: string; offeringKeys: readonly string[] },
): Promise<FreeQuotaState> {
  const batch = store
    .batch()
    .get(ATTESTATION_KEY)
    .get(suspensionKey(input.apiKey))
    .hashGetAll(holdsKey(input.apiKey));
  for (const key of input.offeringKeys) {
    batch.get(allowanceKey(input.apiKey, input.observedOn, key));
  }
  const [attestation, suspension, holds, ...used] = await batch.exec();
  const parsedAttestation = QuotaAttestationSchema.safeParse(decoded(attestation));
  const parsedSuspension = SuspensionSchema.safeParse(decoded(suspension));
  const holdEntries = new Map<string, FreeQuotaHoldCause>();
  for (const [key, value] of Object.entries((holds ?? {}) as Record<string, unknown>)) {
    const hold = HoldSchema.safeParse(decoded(value));
    holdEntries.set(key, hold.success ? hold.data.cause : 'billing');
  }
  const usedEntries = new Map<string, number>();
  input.offeringKeys.forEach((key, index) => {
    const units = Number(used[index] ?? 0);
    usedEntries.set(key, Number.isFinite(units) ? Math.max(0, units) : Number.POSITIVE_INFINITY);
  });
  return {
    attestation: parsedAttestation.success ? parsedAttestation.data : null,
    suspendedAtMs:
      suspension === null || suspension === undefined
        ? null
        : parsedSuspension.success
          ? parsedSuspension.data.atMs
          : Number.MAX_SAFE_INTEGER,
    holds: holdEntries,
    used: usedEntries,
  };
}

export async function writeQuotaAttestation(
  store: KeyValueStore,
  attestation: QuotaAttestation,
): Promise<void> {
  await store.set(ATTESTATION_KEY, QuotaAttestationSchema.parse(attestation));
}

export async function recordFreeQuotaHold(
  store: KeyValueStore,
  input: { apiKey: string; offeringKey: string; cause: FreeQuotaHoldCause; nowMs: number },
): Promise<void> {
  const key = holdsKey(input.apiKey);
  await store.hashSet(key, {
    [input.offeringKey]: JSON.stringify({ cause: input.cause, atMs: input.nowMs }),
  });
  await store.expire(key, HOLD_RETENTION_SECONDS);
}

export async function recordFreeQuotaSuspension(
  store: KeyValueStore,
  input: { apiKey: string; signal: string; nowMs: number },
): Promise<void> {
  await store.set(suspensionKey(input.apiKey), {
    atMs: input.nowMs,
    signal: input.signal.slice(0, 64) || 'unknown',
  });
}

export async function claimFreeQuotaTurn(
  store: KeyValueStore,
  input: { userId: string; requestId: string; nowMs: number },
): Promise<boolean> {
  return store.set(
    turnKey(input.userId, input.requestId),
    { atMs: input.nowMs },
    { onlyIfAbsent: true, ttlSeconds: TURN_CLAIM_TTL_SECONDS },
  );
}

const PROTOCOL_UNITS = {
  chat: 'tokens',
  'image-sync': 'images',
  'video-async': 'seconds',
} as const satisfies Record<NonNullable<ProviderOffering['quotaProbeProtocol']>, string>;

export function usableAllowance(entry: FreeQuotaObservation, policy: FreeQuotaPolicy): number {
  if (entry.limit === null) return 0;
  const remaining = Math.max(0, entry.limit - (entry.consumedApproximate ?? 0));
  return Math.floor((remaining * policy.allowanceUsablePercent) / PERCENT);
}

export function minimumTurnUnits(offering: ProviderOffering, policy: FreeQuotaPolicy): number {
  if (offering.quotaProbeProtocol === 'image-sync') return 1;
  if (offering.quotaProbeProtocol === 'video-async') return policy.videoSeconds;
  return policy.minimumChatQuota;
}

let managedRouteModels: ReadonlySet<string> | null = null;

export function sharesManagedRoute(offering: ProviderOffering): boolean {
  managedRouteModels ??= new Set(
    listCanonicalModels().flatMap((model) =>
      listManagedRoutesForModel(model.id).map(
        (route) => `${route.provider}/${route.providerModelId}`,
      ),
    ),
  );
  return (
    offering.providerModelId !== null &&
    managedRouteModels.has(`${offering.provider}/${offering.providerModelId}`)
  );
}

export type FreeQuotaUnavailableReason =
  | 'not_integrated'
  | 'quota_only_not_observed'
  | 'media_not_served'
  | 'allowance_unknown'
  | 'credential_missing'
  | 'shared_state_unavailable'
  | 'account_billing_signal'
  | 'attestation_missing'
  | 'attestation_other_credential'
  | 'attestation_stale'
  | 'attestation_excludes_offering'
  | 'managed_route_shares_allowance';

export type FreeQuotaDecision =
  | { status: Extract<FreeQuotaStatus, 'ready'>; usable: number; used: number }
  | { status: Extract<FreeQuotaStatus, 'exhausted'>; cause: 'provider' | 'allowance' }
  | { status: Extract<FreeQuotaStatus, 'expired'> }
  | { status: Extract<FreeQuotaStatus, 'unavailable'>; reason: FreeQuotaUnavailableReason };

export interface FreeQuotaDecisionInput {
  entry: FreeQuotaObservation;
  offering: ProviderOffering | null;
  policy: FreeQuotaPolicy;
  nowMs: number;
  apiKey: string;
  mediaServed: boolean;
  state: FreeQuotaState | null;
}

function unavailable(reason: FreeQuotaUnavailableReason): FreeQuotaDecision {
  return { status: 'unavailable', reason };
}

export function decideFreeQuotaOffering(input: FreeQuotaDecisionInput): FreeQuotaDecision {
  const { entry, offering, policy, nowMs, apiKey, state } = input;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  if (
    entry.providerStatus === 'expired' ||
    (entry.expiresOn !== null && entry.expiresOn <= today)
  ) {
    return { status: 'expired' };
  }
  if (
    !offering ||
    offering.identityStatus !== 'exact' ||
    !offering.providerModelId ||
    !offering.quotaProbeProtocol
  ) {
    return unavailable('not_integrated');
  }
  if (!entry.quotaOnlyObserved) return unavailable('quota_only_not_observed');
  if (offering.quotaProbeProtocol !== 'chat' && !input.mediaServed) {
    return unavailable('media_not_served');
  }
  if (entry.limit === null || entry.unit !== PROTOCOL_UNITS[offering.quotaProbeProtocol]) {
    return unavailable('allowance_unknown');
  }
  if (sharesManagedRoute(offering)) return unavailable('managed_route_shares_allowance');
  if (!apiKey) return unavailable('credential_missing');
  if (!state) return unavailable('shared_state_unavailable');
  if (state.holds.has(entry.offeringKey)) return { status: 'exhausted', cause: 'provider' };
  const usable = usableAllowance(entry, policy);
  const used = state.used.get(entry.offeringKey) ?? 0;
  if (used + minimumTurnUnits(offering, policy) > usable) {
    return { status: 'exhausted', cause: 'allowance' };
  }
  const { attestation } = state;
  if (
    state.suspendedAtMs !== null &&
    (!attestation || attestation.checkedAtMs <= state.suspendedAtMs)
  ) {
    return unavailable('account_billing_signal');
  }
  if (!attestation) return unavailable('attestation_missing');
  if (!quotaCredentialMatches(attestation, apiKey))
    return unavailable('attestation_other_credential');
  if (
    attestation.checkedAtMs > nowMs ||
    nowMs - attestation.checkedAtMs >= policy.attestationMaxAgeMs
  ) {
    return unavailable('attestation_stale');
  }
  if (
    attestation.quotaOnlyOfferings !== 'all' &&
    !attestation.quotaOnlyOfferings.includes(entry.offeringKey)
  ) {
    return unavailable('attestation_excludes_offering');
  }
  return { status: 'ready', usable, used };
}

export interface AllowanceReservation {
  key: string;
  units: number;
}

export async function reserveFreeQuotaAllowance(
  store: KeyValueStore,
  input: {
    apiKey: string;
    observedOn: string;
    offeringKey: string;
    expiresOn: string | null;
    units: number;
    usable: number;
    nowMs: number;
  },
): Promise<AllowanceReservation | null> {
  const key = allowanceKey(input.apiKey, input.observedOn, input.offeringKey);
  const units = Math.max(1, Math.ceil(input.units));
  const total = await store.increment(key, units);
  const endsAtMs = input.expiresOn
    ? Date.parse(`${input.expiresOn}T00:00:00Z`) + SECONDS_PER_DAY * MS_PER_SECOND
    : input.nowMs + HOLD_RETENTION_SECONDS * MS_PER_SECOND;
  await store.expire(
    key,
    Math.max(SECONDS_PER_DAY, Math.ceil((endsAtMs - input.nowMs) / MS_PER_SECOND)),
  );
  if (total > input.usable) {
    await store.increment(key, -units);
    return null;
  }
  return { key, units };
}

export async function settleFreeQuotaAllowance(
  store: KeyValueStore,
  reservation: AllowanceReservation,
  consumedUnits: number | null,
): Promise<void> {
  if (consumedUnits === null || !Number.isFinite(consumedUnits)) return;
  const delta = Math.ceil(Math.max(0, consumedUnits)) - reservation.units;
  if (delta !== 0) await store.increment(reservation.key, delta);
}

export type FreeQuotaRefusal =
  'exhausted' | 'billing' | 'account_billing' | 'busy' | 'interrupted' | 'too_long' | 'failed';

// Model Studio's account-level billing refusals (error-code reference, read 2026-09-21): each
// proves the account carries charges or arrears, so no free model on it can be trusted as free.
const ACCOUNT_BILLING_SIGNALS: ReadonlySet<string> = new Set([
  'arrearage',
  'budgetlimitexceeded',
  'prepaidbilloverdue',
  'postpaidbilloverdue',
  'commoditynotpurchased',
]);

export function classifyFreeQuotaRefusal(failure: {
  status?: number;
  code?: string;
  message?: string;
}): FreeQuotaRefusal {
  if (failure.code && ACCOUNT_BILLING_SIGNALS.has(failure.code.trim().toLowerCase())) {
    return 'account_billing';
  }
  const classified = classifyError({
    ...(failure.status === undefined ? {} : { status: failure.status }),
    ...(failure.code === undefined ? {} : { code: failure.code }),
    message: failure.message ?? '',
  });
  switch (classified.category) {
    case 'quota_exhausted':
      return 'exhausted';
    case 'billing_exhausted':
      return 'billing';
    case 'rate_limit':
    case 'server_overload':
      return 'busy';
    case 'aborted':
    case 'api_timeout':
    case 'connection':
      return 'interrupted';
    case 'context_overflow':
      return 'too_long';
    default:
      return 'failed';
  }
}

export function validateQuotaProbeAuthorization(
  document: unknown,
  apiKey: string,
  offeringKey: string,
  policy: FreeQuotaPolicy,
  nowMs = Date.now(),
): void {
  const verification = VerificationSchema.parse(document);
  if (!quotaCredentialMatches(verification, apiKey)) {
    throw new Error('The verification does not belong to the configured credential.');
  }
  if (
    verification.checkedAtMs > nowMs ||
    nowMs - verification.checkedAtMs >= policy.verificationMaxAgeMs
  ) {
    throw new Error('Current account quota verification is required.');
  }
  const offering = getProviderOffering(offeringKey);
  if (!offering?.providerModelId || !offering.quotaProbeProtocol) {
    throw new Error('The exact model and experiment protocol must be resolved first.');
  }
  const matches = verification.offerings.filter((entry) => entry.offeringKey === offeringKey);
  if (matches.length !== 1)
    throw new Error('One account verification record is required for this offering.');
  const match = matches[0]!;
  const expectedUnit = PROTOCOL_UNITS[offering.quotaProbeProtocol];
  if (match.unit !== expectedUnit)
    throw new Error('The verified quota unit does not match this experiment.');
  const minimum =
    offering.quotaProbeProtocol === 'chat'
      ? policy.minimumChatQuota
      : offering.quotaProbeProtocol === 'video-async'
        ? policy.videoSeconds
        : 1;
  if (
    match.remaining < minimum ||
    match.expiresAtMs <= nowMs + policy.requestTimeoutMs + policy.maxPolls * policy.pollIntervalMs
  ) {
    throw new Error(
      'The verified free allocation is insufficient or expires during the experiment.',
    );
  }
}

export async function claimQuotaProbe(directory: string, key: string): Promise<string> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const claim = resolve(directory, `${createHash('sha256').update(key).digest('hex')}.json`);
  await writeFile(
    claim,
    JSON.stringify({ state: 'claimed', claimedAt: new Date().toISOString() }),
    { flag: 'wx', mode: 0o600 },
  );
  return claim;
}
