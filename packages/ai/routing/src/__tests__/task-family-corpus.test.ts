/**
 * Eval-corpus test — the Stage 0/Stage 2 seed.
 *
 * Runs the deterministic classifier over every labelled row and pins two
 * things: the family, and the route the CURRENT Auto policy resolves for that
 * row's task type and tier with the stage OFF. The second pin is the control
 * baseline the design document's quality gate is measured against
 * (`docs/design/execution-plan-contract-and-cpst-2026-08-05.md` §5.1, §6).
 *
 * A failure here means one of two things, and the two must not be confused:
 *  - the classifier changed → fix the classifier or relabel the row;
 *  - the curated policy moved a slot → the baseline moved, and every CPST
 *    comparison made against the old baseline is void.
 *
 * All inputs are fixed literals. No wall-clock value is read anywhere.
 */
import { describe, expect, it } from 'vitest';

import { resolveAutoRoute } from '../auto';
import { classifyTaskFamily, TASK_FAMILIES } from '../task-family';
import { taskFamilyPolicy } from '../task-family-routing';
import {
  CORPUS_RUNTIME_PROFILE_ID,
  TASK_FAMILY_CORPUS,
  type BaselineRoutePin,
} from './fixtures/task-family-corpus';

function baselineRoute(
  taskType: (typeof TASK_FAMILY_CORPUS)[number]['taskType'],
  subscriptionTier: string,
): BaselineRoutePin {
  const decision = resolveAutoRoute({
    selection: 'auto',
    taskType,
    subscriptionTier,
    trustMode: 'managed_cloud',
    runtimeProfileId: CORPUS_RUNTIME_PROFILE_ID,
  });
  return decision.status === 'selected'
    ? `${decision.modelKey}@${decision.effectiveProfile}`
    : `unavailable:${decision.code}`;
}

describe('corpus shape', () => {
  it('has unique, stable ids', () => {
    const ids = TASK_FAMILY_CORPUS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all twelve families with at least six rows each', () => {
    for (const family of TASK_FAMILIES) {
      const rows = TASK_FAMILY_CORPUS.filter((row) => row.expectedFamily === family);
      expect(rows.length, `${family} has ${rows.length} rows`).toBeGreaterThanOrEqual(6);
    }
  });

  it('includes ambiguous rows so the fall-through path is measured too', () => {
    expect(TASK_FAMILY_CORPUS.filter((row) => row.expectedFamily === null).length).toBeGreaterThan(
      0,
    );
  });

  it('carries no message text — the signal type has nowhere to put user data', () => {
    for (const row of TASK_FAMILY_CORPUS) {
      const keys = Object.keys(row.signals);
      expect(keys).not.toContain('message');
      expect(keys).not.toContain('content');
      expect(keys).not.toContain('text');
    }
  });

  it('labels every classified row with a task type its family is allowed to narrow', () => {
    for (const row of TASK_FAMILY_CORPUS) {
      if (row.expectedFamily === null) continue;
      expect(
        taskFamilyPolicy(row.expectedFamily)!.appliesToTaskTypes,
        `${row.id}: ${row.expectedFamily} does not narrow ${row.taskType}`,
      ).toContain(row.taskType);
    }
  });
});

describe('classifier over the corpus', () => {
  it.each(TASK_FAMILY_CORPUS.map((row) => [row.id, row] as const))(
    '%s classifies as its labelled family',
    (_id, row) => {
      expect(classifyTaskFamily(row.signals).family).toBe(row.expectedFamily);
    },
  );

  it('classifies every row with no misses', () => {
    const misses = TASK_FAMILY_CORPUS.filter(
      (row) => classifyTaskFamily(row.signals).family !== row.expectedFamily,
    );
    expect(misses.map((row) => row.id)).toEqual([]);
  });
});

describe('current-policy baseline', () => {
  it.each(TASK_FAMILY_CORPUS.map((row) => [row.id, row] as const))(
    '%s resolves to its pinned baseline route',
    (_id, row) => {
      expect(baselineRoute(row.taskType, row.subscriptionTier)).toBe(row.expectedBaselineRoute);
    },
  );

  it('records refusals as refusals rather than inventing an available route', () => {
    const refused = TASK_FAMILY_CORPUS.filter((row) =>
      row.expectedBaselineRoute.startsWith('unavailable:'),
    );
    expect(refused.length).toBeGreaterThan(0);
    for (const row of refused) {
      expect(baselineRoute(row.taskType, row.subscriptionTier)).toBe(row.expectedBaselineRoute);
    }
  });
});

describe('corpus under the stage', () => {
  it('never widens admission for any row', () => {
    for (const row of TASK_FAMILY_CORPUS) {
      const off = resolveAutoRoute({
        selection: 'auto',
        taskType: row.taskType,
        subscriptionTier: row.subscriptionTier,
        trustMode: 'managed_cloud',
        runtimeProfileId: CORPUS_RUNTIME_PROFILE_ID,
      });
      const on = resolveAutoRoute({
        selection: 'auto',
        taskType: row.taskType,
        subscriptionTier: row.subscriptionTier,
        trustMode: 'managed_cloud',
        runtimeProfileId: CORPUS_RUNTIME_PROFILE_ID,
        taskFamily: row.expectedFamily,
        enableTaskFamilyStage: true,
      });
      // An unavailable route stays unavailable; an available one stays
      // available. The stage may change WHICH model, never WHETHER.
      expect(on.status, row.id).toBe(off.status);
    }
  });

  it('leaves ambiguous rows byte-identical to the current policy', () => {
    for (const row of TASK_FAMILY_CORPUS.filter((entry) => entry.expectedFamily === null)) {
      const on = resolveAutoRoute({
        selection: 'auto',
        taskType: row.taskType,
        subscriptionTier: row.subscriptionTier,
        trustMode: 'managed_cloud',
        runtimeProfileId: CORPUS_RUNTIME_PROFILE_ID,
        taskFamily: null,
        enableTaskFamilyStage: true,
      });
      expect(
        on.status === 'selected'
          ? `${on.modelKey}@${on.effectiveProfile}`
          : `unavailable:${on.code}`,
        row.id,
      ).toBe(row.expectedBaselineRoute);
      expect(on.status === 'selected' && on.taskFamilyDecision?.reasonCode).toBe(
        'task_family_unclassified',
      );
    }
  });
});
