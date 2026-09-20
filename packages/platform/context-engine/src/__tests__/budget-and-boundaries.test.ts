import {
  CONTEXT_SOURCE_CLASSES,
  CONTEXT_SOURCE_PRECEDENCE,
  contextSource,
  contextSourceClassPolicy,
  type ContextSourceClass,
} from '@agiworkforce/context';
import { describe, expect, it } from 'vitest';
import {
  contextClassesInvalidatedBy,
  contextPrecedenceRank,
  orderContextLoaders,
  resolveContext,
  staleManifestClasses,
  withActualTokenCount,
} from '../engine';
import { OPEN_ORGANIZATION_CONTEXT_POLICY } from '../permissions';
import {
  UNVERSIONED_CONTEXT,
  type ContextActor,
  type ContextCandidate,
  type ContextSourceLoader,
  type ContextTokenBudget,
} from '../types';

const ACTOR: ContextActor = { userId: 'user-1', organizationId: null };

function estimate(text: string): number {
  return Math.ceil(Array.from(text).length / 4);
}

function budget(maxInputTokens: number, reservedOutputTokens = 0): ContextTokenBudget {
  return { maxInputTokens, reservedOutputTokens, estimate };
}

function authorshipFor(sourceClass: ContextSourceClass) {
  return contextSourceClassPolicy(sourceClass).authoredBy === 'per_source'
    ? ({ authoredBy: 'user' } as const)
    : {};
}

function candidate(sourceClass: ContextSourceClass, index: number, text: string): ContextCandidate {
  return {
    source: contextSource({
      sourceClass,
      locator: `${sourceClass}/${index}`,
      ...authorshipFor(sourceClass),
    }),
    text,
  };
}

function loader(
  sourceClass: ContextSourceClass,
  texts: readonly string[],
  extra: Partial<ContextSourceLoader> = {},
): ContextSourceLoader {
  return {
    sourceClass,
    budgetChars: 1_000_000,
    load: () => texts.map((text, index) => candidate(sourceClass, index, text)),
    ...extra,
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

describe('assembly order', () => {
  it('assembles in declared precedence whatever order the loaders arrived in', async () => {
    const reversed = [...CONTEXT_SOURCE_PRECEDENCE]
      .reverse()
      .map((sourceClass) => loader(sourceClass, [`text for ${sourceClass}`]));

    expect(orderContextLoaders(reversed).map((entry) => entry.sourceClass)).toEqual([
      ...CONTEXT_SOURCE_PRECEDENCE,
    ]);

    const resolution = await resolveContext({
      turnId: 'turn-order',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders: reversed,
    });
    expect(resolution.manifest.entries.map((entry) => entry.sourceClass)).toEqual([
      ...CONTEXT_SOURCE_PRECEDENCE,
    ]);
    expect(resolution.items.map((item) => item.source.sourceClass)).toEqual([
      ...CONTEXT_SOURCE_PRECEDENCE,
    ]);
  });

  it('keeps the caller order between two loaders of the same class', async () => {
    const resolution = await resolveContext({
      turnId: 'turn-ties',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders: [
        loader('past_chat', ['first past chat']),
        loader('account_memory', ['a memory']),
        loader('past_chat', ['second past chat']),
      ],
    });
    expect(resolution.items.map((item) => item.text)).toEqual([
      'a memory',
      'first past chat',
      'second past chat',
    ]);
  });
});

describe('boundaries a class declares for itself', () => {
  it('drops every class the taxonomy excludes from a temporary chat, and keeps the rest', async () => {
    const loaders = CONTEXT_SOURCE_CLASSES.map((sourceClass) =>
      loader(sourceClass, [`text for ${sourceClass}`]),
    );
    const resolution = await resolveContext({
      turnId: 'turn-temporary',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders,
      temporaryChat: true,
    });

    for (const entry of resolution.manifest.entries) {
      const excluded = contextSourceClassPolicy(entry.sourceClass).excludedFromTemporaryChat;
      expect(entry.includedCount, entry.sourceClass).toBe(excluded ? 0 : 1);
      if (!excluded) continue;
      expect(entry.excluded).toEqual([{ reason: 'temporary_chat', count: 1 }]);
    }
    expect(resolution.manifest.temporaryChat).toBe(true);
    expect(resolution.itemsOf('account_memory')).toEqual([]);
  });

  it('keeps nothing personal out of a shared project', async () => {
    const loaders = CONTEXT_SOURCE_CLASSES.map((sourceClass) =>
      loader(sourceClass, [`text for ${sourceClass}`]),
    );
    const resolution = await resolveContext({
      turnId: 'turn-shared',
      actor: { ...ACTOR, sharedProject: true },
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders,
    });

    for (const entry of resolution.manifest.entries) {
      if (contextSourceClassPolicy(entry.sourceClass).sensitivity !== 'personal') continue;
      expect(entry.includedCount, entry.sourceClass).toBe(0);
      expect(entry.excluded).toEqual([{ reason: 'personal_scope', count: 1 }]);
    }
    for (const item of resolution.items) {
      expect(contextSourceClassPolicy(item.source.sourceClass).sensitivity).not.toBe('personal');
    }
  });

  it('honours the switch each class names, and only that one', async () => {
    const switched = CONTEXT_SOURCE_CLASSES.filter((sourceClass) => {
      const toggle = contextSourceClassPolicy(sourceClass).enabledBy;
      return toggle.kind !== 'always_on' && toggle.kind !== 'per_request';
    });

    for (const sourceClass of switched) {
      const toggle = contextSourceClassPolicy(sourceClass).enabledBy;
      const key = 'key' in toggle ? toggle.key : '';
      const resolution = await resolveContext({
        turnId: `turn-off-${sourceClass}`,
        actor: ACTOR,
        policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
        loaders: CONTEXT_SOURCE_CLASSES.map((each) => loader(each, [`text for ${each}`])),
        disabledToggles: [key],
      });

      for (const entry of resolution.manifest.entries) {
        const entryToggle = contextSourceClassPolicy(entry.sourceClass).enabledBy;
        const off = 'key' in entryToggle && entryToggle.key === key;
        expect(entry.includedCount, `${sourceClass} -> ${entry.sourceClass}`).toBe(off ? 0 : 1);
      }
    }
  });
});

describe('the request token budget', () => {
  it('never spends more than the window leaves after the output reservation', async () => {
    const resolution = await resolveContext({
      turnId: 'turn-budget',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders: [
        loader('account_memory', ['a'.repeat(400)]),
        loader('past_chat', ['b'.repeat(400)]),
      ],
      budget: budget(200, 120),
    });

    expect(resolution.manifest.budgetTokens).toBe(80);
    expect(resolution.manifest.reservedOutputTokens).toBe(120);
    expect(resolution.manifest.tokenEstimate).toBeLessThanOrEqual(80);
    expect(resolution.manifest.overBudget).toBe(false);
  });

  it('drops the lowest precedence first and never an instruction layer', async () => {
    const resolution = await resolveContext({
      turnId: 'turn-drop',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders: [
        loader('web_result', ['w'.repeat(200)]),
        loader('account_memory', ['m'.repeat(200)]),
        loader('security_policy', ['s'.repeat(200)]),
      ],
      budget: budget(100),
    });

    const included = resolution.items.map((item) => item.source.sourceClass);
    expect(included).toContain('security_policy');
    expect(included).toContain('account_memory');
    expect(included).not.toContain('web_result');
  });

  it('truncates a compactable source rather than losing it', async () => {
    const resolution = await resolveContext({
      turnId: 'turn-compact',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders: [loader('past_chat', ['p'.repeat(4000)], { compactable: true })],
      budget: budget(50),
    });

    const [item] = resolution.items;
    expect(item?.compacted).toBe(true);
    expect(item?.text.length).toBeLessThan(4000);
    expect(resolution.manifest.entries[0]?.compactedSourceIds).toHaveLength(1);
    expect(resolution.manifest.tokenEstimate).toBeLessThanOrEqual(50);
  });

  it('says so rather than silently overflowing when the instructions alone do not fit', async () => {
    const resolution = await resolveContext({
      turnId: 'turn-over',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders: [
        loader('security_policy', ['s'.repeat(4000)]),
        loader('account_memory', ['m'.repeat(400)]),
      ],
      budget: budget(40),
    });

    expect(resolution.manifest.overBudget).toBe(true);
    expect(resolution.items.map((item) => item.source.sourceClass)).toEqual(['security_policy']);
  });

  it('holds the budget invariants over a seeded sweep of source mixes', async () => {
    const random = mulberry32(20260920);

    for (let round = 0; round < 200; round += 1) {
      const loaders = CONTEXT_SOURCE_CLASSES.filter(() => random() < 0.6).map((sourceClass) =>
        loader(
          sourceClass,
          Array.from({ length: 1 + Math.floor(random() * 3) }, (_unused, index) =>
            `${sourceClass}-${index}-`.repeat(1 + Math.floor(random() * 40)),
          ),
          random() < 0.3 ? { compactable: true } : {},
        ),
      );
      if (loaders.length === 0) continue;

      const maxInputTokens = 1 + Math.floor(random() * 500);
      const reservedOutputTokens = Math.floor(random() * maxInputTokens);
      const resolution = await resolveContext({
        turnId: `sweep-${round}`,
        actor: ACTOR,
        policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
        loaders,
        budget: budget(maxInputTokens, reservedOutputTokens),
      });

      const ceiling = maxInputTokens - reservedOutputTokens;
      const manifest = resolution.manifest;
      const spent = resolution.items.reduce((total, item) => total + estimate(item.text), 0);

      expect(manifest.tokenEstimate, `round ${round} accounting`).toBe(spent);
      if (manifest.overBudget) {
        for (const item of resolution.items) {
          expect(
            contextSourceClassPolicy(item.source.sourceClass).isInstruction,
            `round ${round} overflowed on data`,
          ).toBe(true);
        }
      } else {
        expect(spent, `round ${round} exceeded ${ceiling}`).toBeLessThanOrEqual(ceiling);
      }

      const ranks = resolution.items.map((item) => contextPrecedenceRank(item.source.sourceClass));
      expect(
        ranks.every((rank, index) => index === 0 || rank >= (ranks[index - 1] ?? 0)),
        `round ${round} assembled out of precedence`,
      ).toBe(true);

      for (const entry of manifest.entries) {
        expect(entry.sourceIds.length).toBe(entry.includedCount);
        expect(entry.sourceIds.every((id) => entry.eligibleSourceIds.includes(id))).toBe(true);
        const excludedTotal = entry.excluded.reduce((total, count) => total + count.count, 0);
        expect(excludedTotal, `round ${round} unaccounted candidate`).toBe(
          entry.candidateCount - entry.includedCount,
        );
        expect(entry.excludedSourceIds).toHaveLength(excludedTotal);
      }
      expect(manifest.includedCount).toBe(resolution.items.length);
    }
  });
});

describe('invalidation', () => {
  it('names the classes a trigger outdates, from what each class declared', () => {
    expect(contextClassesInvalidatedBy('memory_changed')).toEqual(['account_memory']);
    for (const sourceClass of contextClassesInvalidatedBy('policy_changed')) {
      expect(contextSourceClassPolicy(sourceClass).invalidatedBy).toContain('policy_changed');
    }
  });

  it('marks a manifest entry stale when the version it was built against moves', async () => {
    const resolution = await resolveContext({
      turnId: 'turn-versions',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders: [loader('account_memory', ['m']), loader('security_policy', ['s'])],
      versions: { ...UNVERSIONED_CONTEXT, memory: '7' },
    });

    expect(resolution.manifest.versions.memory).toBe('7');
    expect(staleManifestClasses(resolution.manifest, UNVERSIONED_CONTEXT)).toEqual([
      'account_memory',
    ]);
    expect(
      staleManifestClasses(resolution.manifest, { ...UNVERSIONED_CONTEXT, memory: '7' }),
    ).toEqual([]);
    expect(
      staleManifestClasses(resolution.manifest, {
        ...UNVERSIONED_CONTEXT,
        memory: '7',
        policy: '2',
      }),
    ).toEqual(['security_policy', 'account_memory']);
  });

  it('records the provider count against the estimate that drove the turn', async () => {
    const resolution = await resolveContext({
      turnId: 'turn-actual',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders: [loader('account_memory', ['m'.repeat(40)])],
      budget: budget(100),
    });

    expect(resolution.manifest.actualTokenCount).toBeNull();
    expect(withActualTokenCount(resolution.manifest, 137).actualTokenCount).toBe(137);
  });
});
