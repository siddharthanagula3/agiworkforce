import {
  channelTransitionRejection,
  channelVocabularyDrift,
  isReleaseChannel,
  type ReleaseChannel,
} from './channels';

/**
 * The staged-release ledger: what moved to which channel, when, and on what
 * evidence.
 *
 * Append-only and contiguously versioned, so a rollback is a lookup of the
 * record before the current one rather than a walk through git history, and the
 * restored content is replayed as a new version instead of rewriting the past.
 */

export const RELEASE_ARTIFACT_KINDS = ['model_registry', 'routing_policy', 'prompt'] as const;

export type ReleaseArtifactKind = (typeof RELEASE_ARTIFACT_KINDS)[number];

export const QUALITY_VERDICTS = ['held', 'regressed'] as const;

export type QualityVerdict = (typeof QUALITY_VERDICTS)[number];

/** The evals promotion gate's reading, copied from the run that produced it. */
export interface QualitySignal {
  readonly gate: string;
  readonly commit: string;
  readonly verdict: QualityVerdict;
  readonly measuredOn: string;
}

export interface SlotCanary {
  readonly modelKey: string;
  readonly trafficFraction: number;
}

export interface SlotShadow {
  readonly modelKey: string;
  readonly dailyRequestCap: number;
}

export interface SlotCandidates {
  readonly canary?: SlotCanary;
  readonly shadow?: SlotShadow;
}

export interface ReleaseRecord {
  readonly version: number;
  readonly artifact: ReleaseArtifactKind;
  readonly id: string;
  readonly channel: ReleaseChannel;
  readonly effectiveOn: string;
  readonly reason: string;
  readonly slots?: Readonly<Record<string, SlotCandidates>>;
  readonly quality?: QualitySignal;
  readonly rollbackOf?: number;
  /**
   * Records state that already served before the ledger existed. It waives the
   * internal-first and quality-signal rules because inventing either would be a
   * claim about a promotion that never happened.
   */
  readonly bootstrap?: string;
}

export interface ReleaseLedger {
  readonly policyVersion: number;
  readonly records: readonly ReleaseRecord[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const COMMIT_SHA = /^[0-9a-f]{40}$/u;
const FIRST_VERSION = 1;
const CHANNELS_NEEDING_QUALITY: readonly ReleaseChannel[] = ['canary', 'stable'];

/**
 * A rollback restores a version that already served, so it is never held for a
 * fresh gate run: that would be the measurement it is a response to.
 */
function needsQualitySignal(record: ReleaseRecord): boolean {
  return (
    CHANNELS_NEEDING_QUALITY.includes(record.channel) &&
    record.bootstrap === undefined &&
    record.rollbackOf === undefined
  );
}

export function releaseKey(artifact: ReleaseArtifactKind, id: string): string {
  return `${artifact}:${id}`;
}

function isArtifactKind(value: unknown): value is ReleaseArtifactKind {
  return typeof value === 'string' && (RELEASE_ARTIFACT_KINDS as readonly string[]).includes(value);
}

function qualityProblems(record: ReleaseRecord): string[] {
  const label = `${releaseKey(record.artifact, record.id)} v${record.version}`;
  const signal = record.quality;
  if (signal === undefined) {
    return needsQualitySignal(record)
      ? [`${label} serves traffic on ${record.channel} with no eval quality signal`]
      : [];
  }
  const problems: string[] = [];
  if (typeof signal.gate !== 'string' || signal.gate.length === 0) {
    problems.push(`${label} quality signal names no gate`);
  }
  if (!COMMIT_SHA.test(String(signal.commit))) {
    problems.push(`${label} quality signal commit ${String(signal.commit)} is not a full sha`);
  }
  if (!ISO_DATE.test(String(signal.measuredOn))) {
    problems.push(`${label} quality signal measuredOn ${String(signal.measuredOn)} is not a date`);
  }
  if (!(QUALITY_VERDICTS as readonly string[]).includes(signal.verdict)) {
    problems.push(`${label} quality verdict ${String(signal.verdict)} is not a gate verdict`);
  } else if (signal.verdict !== 'held' && CHANNELS_NEEDING_QUALITY.includes(record.channel)) {
    problems.push(
      `${label} is on ${record.channel} while its eval gate reported ${signal.verdict}`,
    );
  }
  return problems;
}

function recordProblems(record: ReleaseRecord, index: number): string[] {
  const problems: string[] = [];
  const label = `record ${index + 1}`;
  if (record.version !== index + FIRST_VERSION) {
    problems.push(`${label} claims version ${record.version}; the ledger is contiguous from 1`);
  }
  if (!isArtifactKind(record.artifact)) {
    problems.push(`${label} names unknown artifact kind ${String(record.artifact)}`);
  }
  if (typeof record.id !== 'string' || record.id.length === 0) {
    problems.push(`${label} names no artifact id`);
  }
  if (!isReleaseChannel(record.channel)) {
    problems.push(`${label} names unknown channel ${String(record.channel)}`);
  }
  if (!ISO_DATE.test(String(record.effectiveOn))) {
    problems.push(`${label} effectiveOn ${String(record.effectiveOn)} is not a date`);
  }
  if (typeof record.reason !== 'string' || record.reason.length === 0) {
    problems.push(`${label} records no reason`);
  }
  if (record.slots !== undefined && record.artifact !== 'routing_policy') {
    problems.push(`${label} carries routing slots but is a ${record.artifact} release`);
  }
  if (record.bootstrap !== undefined && record.bootstrap.length === 0) {
    problems.push(`${label} is marked bootstrap without saying what it records`);
  }
  return problems;
}

export function releaseLedgerProblems(ledger: ReleaseLedger): string[] {
  const problems = [...channelVocabularyDrift()];
  const records = ledger.records ?? [];
  if (!Array.isArray(records) || records.length === 0) {
    return [...problems, 'the release ledger holds no records'];
  }
  const latest = new Map<string, ReleaseRecord>();
  for (const [index, record] of records.entries()) {
    const shaped = recordProblems(record, index);
    problems.push(...shaped);
    if (shaped.length > 0) continue;
    problems.push(...qualityProblems(record));
    const key = releaseKey(record.artifact, record.id);
    const previous = latest.get(key);
    if (previous !== undefined) {
      const rejection = channelTransitionRejection(previous.channel, record.channel);
      if (rejection !== null) problems.push(`${key} v${record.version} ${rejection}`);
      if (record.bootstrap !== undefined) {
        problems.push(`${key} v${record.version} claims bootstrap but the ledger already holds it`);
      }
    } else if (
      record.channel !== 'internal' &&
      record.rollbackOf === undefined &&
      record.bootstrap === undefined
    ) {
      problems.push(`${key} enters the ledger on ${record.channel} without an internal stage`);
    }
    latest.set(key, record);
  }
  const last = records[records.length - 1];
  if (ledger.policyVersion !== last.version) {
    problems.push(
      `policyVersion ${ledger.policyVersion} does not name the newest record v${last.version}`,
    );
  }
  return problems;
}

export function recordsFor(
  ledger: ReleaseLedger,
  artifact: ReleaseArtifactKind,
  id: string,
): readonly ReleaseRecord[] {
  return ledger.records.filter((record) => record.artifact === artifact && record.id === id);
}

export function currentRelease(
  ledger: ReleaseLedger,
  artifact: ReleaseArtifactKind,
  id: string,
): ReleaseRecord | null {
  const history = recordsFor(ledger, artifact, id);
  return history.length === 0 ? null : history[history.length - 1];
}

/**
 * The newest record for a routing policy declares the COMPLETE staged set, not
 * a delta, so a slot it leaves out is withdrawn rather than inherited.
 */
export function effectiveSlotCandidates(ledger: ReleaseLedger): Record<string, SlotCandidates> {
  const routing = ledger.records.filter((record) => record.artifact === 'routing_policy');
  const newest = new Map<string, ReleaseRecord>();
  for (const record of routing) newest.set(record.id, record);
  const slots: Record<string, SlotCandidates> = {};
  for (const record of newest.values()) {
    for (const [slotId, candidates] of Object.entries(record.slots ?? {})) {
      slots[slotId] = candidates;
    }
  }
  return slots;
}

export interface AdvanceRequest {
  readonly artifact: ReleaseArtifactKind;
  readonly id: string;
  readonly channel: ReleaseChannel;
  readonly effectiveOn: string;
  readonly reason: string;
  readonly slots?: Readonly<Record<string, SlotCandidates>>;
  readonly quality?: QualitySignal;
}

export interface ReleasePlan {
  readonly record: ReleaseRecord | null;
  readonly refusals: readonly string[];
}

export function planAdvance(ledger: ReleaseLedger, request: AdvanceRequest): ReleasePlan {
  const current = currentRelease(ledger, request.artifact, request.id);
  const record: ReleaseRecord = {
    version: ledger.policyVersion + 1,
    artifact: request.artifact,
    id: request.id,
    channel: request.channel,
    effectiveOn: request.effectiveOn,
    reason: request.reason,
    ...(request.slots === undefined ? {} : { slots: request.slots }),
    ...(request.quality === undefined ? {} : { quality: request.quality }),
  };
  const refusals = [...recordProblems(record, ledger.policyVersion), ...qualityProblems(record)];
  if (current === null) {
    if (request.channel !== 'internal') {
      refusals.push(
        `${releaseKey(request.artifact, request.id)} has never been published; it enters on internal`,
      );
    }
  } else {
    const rejection = channelTransitionRejection(current.channel, request.channel);
    if (rejection !== null)
      refusals.push(`${releaseKey(request.artifact, request.id)} ${rejection}`);
    if (
      current.channel === request.channel &&
      current.slots === undefined &&
      request.slots === undefined
    ) {
      refusals.push(
        `${releaseKey(request.artifact, request.id)} is already on ${request.channel} with nothing to change`,
      );
    }
  }
  return refusals.length > 0 ? { record: null, refusals } : { record, refusals: [] };
}

export interface RollbackPlan {
  readonly from: ReleaseRecord | null;
  readonly to: ReleaseRecord | null;
  readonly record: ReleaseRecord | null;
  readonly refusals: readonly string[];
}

/**
 * A lookup, not archaeology: the record before the current one is replayed as a
 * new version, so the ledger keeps saying what was served when.
 */
export function planRollback(
  ledger: ReleaseLedger,
  artifact: ReleaseArtifactKind,
  id: string,
  effectiveOn: string,
  reason?: string,
): RollbackPlan {
  const history = recordsFor(ledger, artifact, id);
  const key = releaseKey(artifact, id);
  if (history.length === 0) {
    return {
      from: null,
      to: null,
      record: null,
      refusals: [`${key} is not in the release ledger`],
    };
  }
  const from = history[history.length - 1];
  const to = history[history.length - 2];
  if (to === undefined) {
    return {
      from,
      to: null,
      record: null,
      refusals: [`${key} has only its first release; there is no earlier version to restore`],
    };
  }
  const record: ReleaseRecord = {
    version: ledger.policyVersion + 1,
    artifact,
    id,
    channel: to.channel,
    effectiveOn,
    reason: reason ?? `rollback of v${from.version} to the v${to.version} release of ${key}`,
    ...(to.slots === undefined ? {} : { slots: to.slots }),
    ...(to.quality === undefined ? {} : { quality: to.quality }),
    rollbackOf: from.version,
  };
  return { from, to, record, refusals: [] };
}

export function applyRecord(ledger: ReleaseLedger, record: ReleaseRecord): ReleaseLedger {
  return { policyVersion: record.version, records: [...ledger.records, record] };
}

function sameCanary(left: SlotCanary | undefined, right: SlotCanary | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.modelKey === right.modelKey && left.trafficFraction === right.trafficFraction;
}

function sameShadow(left: SlotShadow | undefined, right: SlotShadow | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.modelKey === right.modelKey && left.dailyRequestCap === right.dailyRequestCap;
}

/**
 * Every canary or shadow the routing policy declares has to be the one a record
 * authorised, and every one a record authorised has to be declared.
 */
export function slotBindingProblems(
  ledger: ReleaseLedger,
  declared: Readonly<Record<string, SlotCandidates>>,
): string[] {
  const authorised = effectiveSlotCandidates(ledger);
  const problems: string[] = [];
  for (const slotId of new Set([...Object.keys(authorised), ...Object.keys(declared)])) {
    const want = authorised[slotId];
    const have = declared[slotId];
    if (want === undefined) {
      problems.push(
        `routing slot ${slotId} declares a staged candidate no release record authorises`,
      );
      continue;
    }
    if (have === undefined) {
      problems.push(
        `the release ledger stages routing slot ${slotId}, which the policy does not declare`,
      );
      continue;
    }
    if (!sameCanary(want.canary, have.canary)) {
      problems.push(
        `routing slot ${slotId} canary differs from the release record that authorised it`,
      );
    }
    if (!sameShadow(want.shadow, have.shadow)) {
      problems.push(
        `routing slot ${slotId} shadow differs from the release record that authorised it`,
      );
    }
  }
  return problems;
}

export interface ProbeOutcome {
  readonly outcome: string;
}

const ANSWERED = 'answered';

/**
 * A staged model has to answer from this account before it takes traffic:
 * scores on a page are not reachability, which is what the probe record holds.
 */
export function probeBindingProblems(
  ledger: ReleaseLedger,
  probes: Readonly<Record<string, ProbeOutcome>>,
): string[] {
  const problems: string[] = [];
  for (const [slotId, candidates] of Object.entries(effectiveSlotCandidates(ledger))) {
    for (const modelKey of [candidates.canary?.modelKey, candidates.shadow?.modelKey]) {
      if (modelKey === undefined) continue;
      if (probes[modelKey]?.outcome !== ANSWERED) {
        problems.push(
          `routing slot ${slotId} stages ${modelKey}, which has no answered probe in catalog/probes.json`,
        );
      }
    }
  }
  return problems;
}
