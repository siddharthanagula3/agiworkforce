import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  channelForLifecycleStage,
  channelTransitionRejection,
  channelVocabularyDrift,
  lifecycleStagesForChannel,
} from '../promotion/channels';
import { ledgerPromptStamps, malformedPromptReleaseIds } from '../promotion/prompt-release';
import {
  applyRecord,
  currentRelease,
  effectiveSlotCandidates,
  planAdvance,
  planRollback,
  probeBindingProblems,
  releaseLedgerProblems,
  slotBindingProblems,
  type ReleaseLedger,
  type ReleaseRecord,
} from '../promotion/release-ledger';

const CATALOG_DIR = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'model-registry',
  'catalog',
);

const HELD = {
  gate: 'evals/promotion-gate',
  commit: 'a'.repeat(40),
  verdict: 'held',
  measuredOn: '2026-09-18',
} as const;

function ledgerOf(...records: ReleaseRecord[]): ReleaseLedger {
  return { policyVersion: records[records.length - 1]?.version ?? 0, records };
}

const BOOTSTRAP: ReleaseRecord = {
  version: 1,
  artifact: 'routing_policy',
  id: 'auto',
  channel: 'stable',
  effectiveOn: '2026-09-18',
  reason: 'what already served',
  bootstrap: 'recorded rather than promoted',
};

describe('release channels', () => {
  it('names only lifecycle stages the registry still defines', () => {
    expect(channelVocabularyDrift()).toEqual([]);
    expect(lifecycleStagesForChannel('stable')).toEqual(['promoted', 'observed']);
  });

  it('maps a serving stage back to the channel that serves it', () => {
    expect(channelForLifecycleStage('shadow')).toBe('internal');
    expect(channelForLifecycleStage('canary')).toBe('canary');
    expect(channelForLifecycleStage('observed')).toBe('stable');
    expect(channelForLifecycleStage('registered')).toBeNull();
  });

  it('refuses a skipped channel and allows every rollback', () => {
    expect(channelTransitionRejection('internal', 'stable')).toContain(
      'the next channel is canary',
    );
    expect(channelTransitionRejection('internal', 'canary')).toBeNull();
    expect(channelTransitionRejection('stable', 'internal')).toBeNull();
  });
});

describe('the release ledger', () => {
  it('accepts the bootstrap record and reports a version that does not match', () => {
    expect(releaseLedgerProblems(ledgerOf(BOOTSTRAP))).toEqual([]);
    expect(releaseLedgerProblems({ policyVersion: 4, records: [BOOTSTRAP] })).toEqual([
      'policyVersion 4 does not name the newest record v1',
    ]);
  });

  it('refuses traffic on canary or stable with no eval quality signal', () => {
    const problems = releaseLedgerProblems(
      ledgerOf(
        BOOTSTRAP,
        {
          version: 2,
          artifact: 'prompt',
          id: 'product.system@3',
          channel: 'internal',
          effectiveOn: '2026-09-18',
          reason: 'internal only',
        },
        {
          version: 3,
          artifact: 'prompt',
          id: 'product.system@3',
          channel: 'canary',
          effectiveOn: '2026-09-18',
          reason: 'ten percent',
        },
      ),
    );
    expect(problems).toEqual([
      'prompt:product.system@3 v3 serves traffic on canary with no eval quality signal',
    ]);
  });

  it('refuses a canary whose gate reported a regression', () => {
    const problems = releaseLedgerProblems(
      ledgerOf(
        BOOTSTRAP,
        {
          version: 2,
          artifact: 'prompt',
          id: 'product.system@3',
          channel: 'internal',
          effectiveOn: '2026-09-18',
          reason: 'internal only',
        },
        {
          version: 3,
          artifact: 'prompt',
          id: 'product.system@3',
          channel: 'canary',
          effectiveOn: '2026-09-18',
          reason: 'ten percent',
          quality: { ...HELD, verdict: 'regressed' },
        },
      ),
    );
    expect(problems).toEqual([
      'prompt:product.system@3 v3 is on canary while its eval gate reported regressed',
    ]);
  });

  it('refuses an entry that skips the internal stage and a second bootstrap', () => {
    expect(
      releaseLedgerProblems(
        ledgerOf({
          version: 1,
          artifact: 'prompt',
          id: 'product.system@3',
          channel: 'canary',
          effectiveOn: '2026-09-18',
          reason: 'straight to traffic',
          quality: HELD,
        }),
      ),
    ).toEqual(['prompt:product.system@3 enters the ledger on canary without an internal stage']);
    expect(releaseLedgerProblems(ledgerOf(BOOTSTRAP, { ...BOOTSTRAP, version: 2 }))).toContain(
      'routing_policy:auto v2 claims bootstrap but the ledger already holds it',
    );
  });

  it('refuses a ledger whose versions are not contiguous and one with no records', () => {
    expect(
      releaseLedgerProblems({ policyVersion: 7, records: [{ ...BOOTSTRAP, version: 7 }] }),
    ).toContain('record 1 claims version 7; the ledger is contiguous from 1');
    expect(releaseLedgerProblems({ policyVersion: 0, records: [] })).toEqual([
      'the release ledger holds no records',
    ]);
  });

  it('refuses routing slots on an artifact that has none, and a bare bootstrap note', () => {
    const problems = releaseLedgerProblems(
      ledgerOf({
        ...BOOTSTRAP,
        artifact: 'prompt',
        id: 'product.system@3',
        slots: { workhorse_general: {} },
        bootstrap: '',
      }),
    );
    expect(problems).toContain('record 1 carries routing slots but is a prompt release');
    expect(problems).toContain('record 1 is marked bootstrap without saying what it records');
  });
});

describe('advancing and rolling back', () => {
  const canaryRecord: ReleaseRecord = {
    version: 2,
    artifact: 'routing_policy',
    id: 'auto',
    channel: 'canary',
    effectiveOn: '2026-09-18',
    reason: 'five percent of workhorse traffic',
    slots: { workhorse_general: { canary: { modelKey: 'candidate', trafficFraction: 0.05 } } },
    quality: HELD,
  };

  it('plans the next version and refuses a skipped channel', () => {
    const plan = planAdvance(ledgerOf(BOOTSTRAP), {
      artifact: 'routing_policy',
      id: 'auto',
      channel: 'canary',
      effectiveOn: '2026-09-18',
      reason: 'five percent of workhorse traffic',
      slots: canaryRecord.slots,
      quality: HELD,
    });
    expect(plan.record?.version).toBe(2);
    const skipped = planAdvance(ledgerOf(BOOTSTRAP), {
      artifact: 'prompt',
      id: 'product.system@4',
      channel: 'stable',
      effectiveOn: '2026-09-18',
      reason: 'straight to everyone',
      quality: HELD,
    });
    expect(skipped.record).toBeNull();
    expect(skipped.refusals[0]).toContain('has never been published; it enters on internal');
  });

  it('refuses an advance that changes nothing and one with no quality signal', () => {
    const ledger = ledgerOf(BOOTSTRAP);
    expect(
      planAdvance(ledger, {
        artifact: 'routing_policy',
        id: 'auto',
        channel: 'stable',
        effectiveOn: '2026-09-18',
        reason: 'again',
        quality: HELD,
      }).refusals[0],
    ).toContain('already on stable with nothing to change');
    expect(
      planAdvance(ledger, {
        artifact: 'routing_policy',
        id: 'auto',
        channel: 'canary',
        effectiveOn: '2026-09-18',
        reason: 'no gate run',
        slots: canaryRecord.slots,
      }).refusals[0],
    ).toContain('no eval quality signal');
  });

  it('rolls back to the record before the current one and replays it forward', () => {
    const ledger = applyRecord(ledgerOf(BOOTSTRAP), canaryRecord);
    expect(effectiveSlotCandidates(ledger)).toEqual(canaryRecord.slots);
    const plan = planRollback(ledger, 'routing_policy', 'auto', '2026-09-19');
    expect(plan.from?.version).toBe(2);
    expect(plan.to?.version).toBe(1);
    expect(plan.record).toMatchObject({ version: 3, channel: 'stable', rollbackOf: 2 });
    expect(plan.record?.slots).toBeUndefined();
    const rolled = applyRecord(ledger, plan.record as ReleaseRecord);
    expect(effectiveSlotCandidates(rolled)).toEqual({});
    expect(releaseLedgerProblems(rolled)).toEqual([]);
    expect(currentRelease(rolled, 'routing_policy', 'auto')?.channel).toBe('stable');
  });

  it('refuses a rollback with nothing behind it', () => {
    expect(
      planRollback(ledgerOf(BOOTSTRAP), 'routing_policy', 'auto', '2026-09-19').refusals[0],
    ).toContain('no earlier version to restore');
    expect(
      planRollback(ledgerOf(BOOTSTRAP), 'prompt', 'nothing@1', '2026-09-19').refusals[0],
    ).toContain('is not in the release ledger');
  });
});

describe('the ledger against what actually serves', () => {
  const staged = applyRecord(ledgerOf(BOOTSTRAP), {
    version: 2,
    artifact: 'routing_policy',
    id: 'auto',
    channel: 'canary',
    effectiveOn: '2026-09-18',
    reason: 'five percent',
    slots: { workhorse_general: { canary: { modelKey: 'candidate', trafficFraction: 0.05 } } },
    quality: HELD,
  });

  it('catches a canary the policy declares that no record authorised', () => {
    expect(
      slotBindingProblems(ledgerOf(BOOTSTRAP), {
        coding_balanced: { canary: { modelKey: 'candidate', trafficFraction: 0.1 } },
      }),
    ).toEqual([
      'routing slot coding_balanced declares a staged candidate no release record authorises',
    ]);
  });

  it('catches an authorised canary the policy does not declare, and a changed one', () => {
    expect(slotBindingProblems(staged, {})).toEqual([
      'the release ledger stages routing slot workhorse_general, which the policy does not declare',
    ]);
    expect(
      slotBindingProblems(staged, {
        workhorse_general: { canary: { modelKey: 'candidate', trafficFraction: 0.5 } },
      }),
    ).toEqual([
      'routing slot workhorse_general canary differs from the release record that authorised it',
    ]);
    expect(
      slotBindingProblems(staged, {
        workhorse_general: {
          canary: { modelKey: 'candidate', trafficFraction: 0.05 },
          shadow: { modelKey: 'mirror', dailyRequestCap: 10 },
        },
      }),
    ).toEqual([
      'routing slot workhorse_general shadow differs from the release record that authorised it',
    ]);
  });

  it('refuses to stage a model that has not answered a probe', () => {
    expect(probeBindingProblems(staged, { candidate: { outcome: 'answered' } })).toEqual([]);
    expect(probeBindingProblems(staged, { candidate: { outcome: 'failed' } })).toEqual([
      'routing slot workhorse_general stages candidate, which has no answered probe in catalog/probes.json',
    ]);
  });
});

describe('the committed release ledger', () => {
  const policies = JSON.parse(
    readFileSync(path.join(CATALOG_DIR, 'routing-policies.json'), 'utf8'),
  ) as { release: ReleaseLedger; auto: { slots: Record<string, Record<string, unknown>> } };

  function declared(): Record<string, { canary?: never; shadow?: never }> {
    const found: Record<string, Record<string, unknown>> = {};
    for (const [slotId, slot] of Object.entries(policies.auto.slots)) {
      const candidates: Record<string, unknown> = {};
      if (slot.canary !== undefined) candidates.canary = slot.canary;
      if (slot.shadow !== undefined) candidates.shadow = slot.shadow;
      if (Object.keys(candidates).length > 0) found[slotId] = candidates;
    }
    return found as Record<string, { canary?: never; shadow?: never }>;
  }

  it('is well formed, matches the slots that serve, and names real prompt stamps', () => {
    expect(releaseLedgerProblems(policies.release)).toEqual([]);
    expect(slotBindingProblems(policies.release, declared())).toEqual([]);
    expect(malformedPromptReleaseIds(policies.release)).toEqual([]);
    for (const stamp of ledgerPromptStamps(policies.release)) {
      expect(stamp.version).toBeGreaterThan(0);
    }
  });

  it('carries every staged model through an answered probe', () => {
    const probes = JSON.parse(readFileSync(path.join(CATALOG_DIR, 'probes.json'), 'utf8')) as {
      probes: Record<string, { outcome: string }>;
    };
    expect(probeBindingProblems(policies.release, probes.probes)).toEqual([]);
  });
});
