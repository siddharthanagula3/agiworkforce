import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { KeyValueStore } from '@agiworkforce/key-value';
import {
  FREE_TIER_ONLY_PROVIDER_HINT,
  MODEL_STUDIO_ACCOUNT_BILLING_HINT,
  MODEL_STUDIO_MODEL_ACCESS_DENIED_HINT,
  MODEL_STUDIO_MODEL_NOT_FOUND_HINT,
  MODEL_STUDIO_MODEL_RETIRED_HINT,
  classifyModelStudioError,
} from '@agiworkforce/provider-runtime';
import {
  getProviderOffering,
  getProviderOfferingMediaRequestUnits,
  getProviderOfferingQuotaUnit,
  listCanonicalModels,
  listManagedRoutesForModel,
  type ProviderOffering,
} from '@agiworkforce/types';
import {
  FreeQuotaAttestedOfferingsSchema,
  type FreeQuotaAttestationStanding,
  type FreeQuotaMediaCategory,
} from '@agiworkforce/cloud-contracts';
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
  videoSeconds: z.number().int().positive(),
  requestTimeoutMs: z.number().int().positive(),
  pollIntervalMs: z.number().int().positive(),
  maxPolls: z.number().int().positive(),
  attestationMaxAgeMs: z.number().int().positive(),
  attestationReminderLeadMs: z.number().int().positive(),
  termsReviewReminderLeadMs: z.number().int().positive(),
  chatMaxOutputTokens: z.number().int().positive(),
  chatImageReserveTokens: z.number().int().positive(),
  chatRequestTimeoutMs: z.number().int().positive(),
  allowanceUsablePercent: z.number().int().min(1).max(100),
});

export const QuotaAttestationSchema = z.object({
  sourceUrl: z.literal(BENEFITS_PAGE),
  checkedAtMs: z.number().int().positive(),
  credentialSha256: z.string().regex(SHA256_HEX),
  quotaOnlyOfferings: FreeQuotaAttestedOfferingsSchema,
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
const DAILY_USE_RETENTION_SLACK_SECONDS = 60 * 60;
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

function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function dailyUseKey(userId: string, category: FreeQuotaMediaCategory, nowMs: number): string {
  const scope = createHash('sha256').update(userId).digest('hex').slice(0, TURN_SCOPE_LENGTH);
  return `${STATE_PREFIX}:daily:${category}:${scope}:${utcDay(nowMs)}`;
}

const HoldSchema = z.object({
  cause: z.enum(['exhausted', 'billing', 'withdrawn', 'refused']),
  atMs: z.number().int().positive(),
});

const SuspensionSchema = z.object({
  atMs: z.number().int().positive(),
  signal: z.string().min(1).max(64),
});

export const UNREADABLE_SUSPENSION_AT_MS = Number.MAX_SAFE_INTEGER;

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

const ATTESTATION_LIFTED_HOLDS: ReadonlySet<FreeQuotaHoldCause> = new Set(['withdrawn', 'refused']);

function holdInForce(hold: z.infer<typeof HoldSchema>, attestedAtMs: number | null): boolean {
  return (
    !ATTESTATION_LIFTED_HOLDS.has(hold.cause) || attestedAtMs === null || hold.atMs >= attestedAtMs
  );
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
  const attestedAtMs = parsedAttestation.success ? parsedAttestation.data.checkedAtMs : null;
  const holdEntries = new Map<string, FreeQuotaHoldCause>();
  for (const [key, value] of Object.entries((holds ?? {}) as Record<string, unknown>)) {
    const hold = HoldSchema.safeParse(decoded(value));
    if (!hold.success) holdEntries.set(key, 'billing');
    else if (holdInForce(hold.data, attestedAtMs)) holdEntries.set(key, hold.data.cause);
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
          : UNREADABLE_SUSPENSION_AT_MS,
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

export function usableAllowance(entry: FreeQuotaObservation, policy: FreeQuotaPolicy): number {
  if (entry.limit === null) return 0;
  const remaining = Math.max(0, entry.limit - (entry.consumedApproximate ?? 0));
  return Math.floor((remaining * policy.allowanceUsablePercent) / PERCENT);
}

export function minimumTurnUnits(offering: ProviderOffering, policy: FreeQuotaPolicy): number {
  return (
    getProviderOfferingMediaRequestUnits(offering, policy.videoSeconds) ?? policy.minimumChatQuota
  );
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

export type AttestationStanding =
  | { standing: 'billing_signal'; signalAtMs: number }
  | { standing: 'missing' }
  | {
      standing: Exclude<FreeQuotaAttestationStanding, 'billing_signal' | 'missing'>;
      attestation: QuotaAttestation;
      freshUntilMs: number;
    };

export function attestationFreshUntilMs(checkedAtMs: number, policy: FreeQuotaPolicy): number {
  return checkedAtMs + policy.attestationMaxAgeMs;
}

export function attestationStanding(input: {
  state: Pick<FreeQuotaState, 'attestation' | 'suspendedAtMs'>;
  apiKey: string;
  policy: FreeQuotaPolicy;
  nowMs: number;
}): AttestationStanding {
  const { state, apiKey, policy, nowMs } = input;
  const { attestation, suspendedAtMs } = state;
  if (suspendedAtMs !== null && (!attestation || attestation.checkedAtMs <= suspendedAtMs)) {
    return { standing: 'billing_signal', signalAtMs: suspendedAtMs };
  }
  if (!attestation) return { standing: 'missing' };
  const freshUntilMs = attestationFreshUntilMs(attestation.checkedAtMs, policy);
  const standing = !quotaCredentialMatches(attestation, apiKey)
    ? 'other_credential'
    : attestation.checkedAtMs > nowMs || nowMs >= freshUntilMs
      ? 'stale'
      : freshUntilMs - nowMs <= policy.attestationReminderLeadMs
        ? 'expiring'
        : 'current';
  return { standing, attestation, freshUntilMs };
}

const ATTESTATION_REFUSALS = {
  billing_signal: 'account_billing_signal',
  missing: 'attestation_missing',
  other_credential: 'attestation_other_credential',
  stale: 'attestation_stale',
} as const satisfies Record<
  Exclude<FreeQuotaAttestationStanding, 'current' | 'expiring'>,
  FreeQuotaUnavailableReason
>;

export type FreeQuotaUnavailableReason =
  | 'not_integrated'
  | 'quota_only_not_observed'
  | 'terms_review_missing'
  | 'media_not_served'
  | 'allowance_unknown'
  | 'credential_missing'
  | 'shared_state_unavailable'
  | 'account_billing_signal'
  | 'attestation_missing'
  | 'attestation_other_credential'
  | 'attestation_stale'
  | 'attestation_excludes_offering'
  | 'managed_route_shares_allowance'
  | 'provider_refused';

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
  termsReviewed: boolean;
}

function unavailable(reason: FreeQuotaUnavailableReason): FreeQuotaDecision {
  return { status: 'unavailable', reason };
}

export function freeQuotaEndsOn(
  entry: FreeQuotaObservation,
  offering: ProviderOffering | null,
): string | null {
  const retiresOn = offering?.retiresAt?.slice(0, 10) ?? null;
  if (retiresOn === null) return entry.expiresOn;
  return entry.expiresOn === null || retiresOn < entry.expiresOn ? retiresOn : entry.expiresOn;
}

export function decideFreeQuotaOffering(input: FreeQuotaDecisionInput): FreeQuotaDecision {
  const { entry, offering, policy, nowMs, apiKey, state } = input;
  const today = utcDay(nowMs);
  if (
    entry.providerStatus === 'expired' ||
    (entry.expiresOn !== null && entry.expiresOn <= today) ||
    (offering?.retiresAt !== undefined && Date.parse(offering.retiresAt) <= nowMs)
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
  if (!input.termsReviewed) return unavailable('terms_review_missing');
  if (offering.quotaProbeProtocol !== 'chat' && !input.mediaServed) {
    return unavailable('media_not_served');
  }
  if (entry.limit === null || entry.unit !== getProviderOfferingQuotaUnit(offering)) {
    return unavailable('allowance_unknown');
  }
  if (sharesManagedRoute(offering)) return unavailable('managed_route_shares_allowance');
  if (!apiKey) return unavailable('credential_missing');
  if (!state) return unavailable('shared_state_unavailable');
  const hold = state.holds.get(entry.offeringKey);
  if (hold === 'withdrawn') return { status: 'expired' };
  if (hold === 'refused') return unavailable('provider_refused');
  if (hold) return { status: 'exhausted', cause: 'provider' };
  const usable = usableAllowance(entry, policy);
  const used = state.used.get(entry.offeringKey) ?? 0;
  if (used + minimumTurnUnits(offering, policy) > usable) {
    return { status: 'exhausted', cause: 'allowance' };
  }
  const standing = attestationStanding({ state, apiKey, policy, nowMs });
  if (standing.standing !== 'current' && standing.standing !== 'expiring') {
    return unavailable(ATTESTATION_REFUSALS[standing.standing]);
  }
  const covered = standing.attestation.quotaOnlyOfferings;
  if (covered !== 'all' && !covered.includes(entry.offeringKey)) {
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

export interface DailyUseReservation {
  key: string;
}

export function freeQuotaDayResetsAtMs(nowMs: number): number {
  return Date.parse(`${utcDay(nowMs)}T00:00:00Z`) + SECONDS_PER_DAY * MS_PER_SECOND;
}

export async function readFreeQuotaDailyUse(
  store: KeyValueStore,
  input: { userId: string; category: FreeQuotaMediaCategory; nowMs: number },
): Promise<number> {
  const stored = await store.get<unknown>(dailyUseKey(input.userId, input.category, input.nowMs));
  const used = Number(stored ?? 0);
  return Number.isFinite(used) ? Math.max(0, used) : Number.POSITIVE_INFINITY;
}

export async function reserveFreeQuotaDailyUse(
  store: KeyValueStore,
  input: { userId: string; category: FreeQuotaMediaCategory; cap: number; nowMs: number },
): Promise<DailyUseReservation | null> {
  const key = dailyUseKey(input.userId, input.category, input.nowMs);
  const total = await store.increment(key, 1);
  try {
    await store.expire(
      key,
      Math.ceil((freeQuotaDayResetsAtMs(input.nowMs) - input.nowMs) / MS_PER_SECOND) +
        DAILY_USE_RETENTION_SLACK_SECONDS,
    );
  } catch (error) {
    await store.increment(key, -1).catch(() => undefined);
    throw error;
  }
  if (total > input.cap) {
    await store.increment(key, -1);
    return null;
  }
  return { key };
}

export async function releaseFreeQuotaDailyUse(
  store: KeyValueStore,
  reservation: DailyUseReservation,
): Promise<void> {
  await store.increment(reservation.key, -1);
}

export type FreeQuotaRefusal =
  | 'exhausted'
  | 'billing'
  | 'account_billing'
  | 'busy'
  | 'interrupted'
  | 'too_long'
  | 'unavailable'
  | 'refused'
  | 'withdrawn'
  | 'blocked'
  | 'failed';

export function classifyFreeQuotaRefusal(failure: {
  status?: number;
  code?: string;
  message?: string;
}): FreeQuotaRefusal {
  const classified = classifyModelStudioError({
    ...(failure.status === undefined ? {} : { status: failure.status }),
    ...(failure.code === undefined ? {} : { code: failure.code }),
    message: failure.message ?? '',
  });
  switch (classified.category) {
    case 'quota_exhausted':
      return classified.providerHint === FREE_TIER_ONLY_PROVIDER_HINT ? 'exhausted' : 'busy';
    case 'billing_exhausted':
      return classified.providerHint === MODEL_STUDIO_ACCOUNT_BILLING_HINT
        ? 'account_billing'
        : 'billing';
    case 'rate_limit':
    case 'server_overload':
      return 'busy';
    case 'aborted':
    case 'api_timeout':
    case 'connection':
      return 'interrupted';
    case 'context_overflow':
      return 'too_long';
    case 'invalid_model':
      switch (classified.providerHint) {
        case MODEL_STUDIO_MODEL_RETIRED_HINT:
          return 'withdrawn';
        case MODEL_STUDIO_MODEL_ACCESS_DENIED_HINT:
        case MODEL_STUDIO_MODEL_NOT_FOUND_HINT:
          return 'refused';
        default:
          return 'unavailable';
      }
    case 'safety':
    case 'content_blocked':
      return 'blocked';
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
  if (match.unit !== getProviderOfferingQuotaUnit(offering))
    throw new Error('The verified quota unit does not match this experiment.');
  if (
    match.remaining < minimumTurnUnits(offering, policy) ||
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
