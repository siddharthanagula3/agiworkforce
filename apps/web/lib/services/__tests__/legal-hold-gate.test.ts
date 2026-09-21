import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { HOLDABLE_RESOURCES } from '@agiworkforce/types';

import {
  countHeldResources,
  formatHold,
  heldUserIdsFor,
  legalHoldExclusion,
  legalHoldPredicate,
  organizationWideHold,
  readLegalHoldGate,
  LegalHoldGateUnavailableError,
  type HoldRow,
  type LegalHold,
} from '../legal-hold-gate';
import { FakePostgres } from './fake-postgres';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';

function holdRow(over: Partial<HoldRow> = {}): HoldRow {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    organization_id: ORG,
    name: 'Matter 41',
    reason: null,
    scope: 'member' as const,
    subject_user_id: null,
    resource_types: null,
    custodian_user_ids: [],
    created_by_user_id: 'user-admin',
    released_at: null,
    released_by_user_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function hold(over: Partial<LegalHold> = {}): LegalHold {
  return { ...formatHold(holdRow()), ...over };
}

/** A workspace with one conversation each for three people. */
function workspace(holds: HoldRow[], custodians: Record<string, unknown>[] = []) {
  return new FakePostgres({
    legal_holds: holds.map((row) => ({ ...row })),
    legal_hold_custodians: custodians,
    web_conversations: [
      { id: 'c-alice', user_id: 'alice', organization_id: ORG },
      { id: 'c-bob', user_id: 'bob', organization_id: ORG },
      { id: 'c-elsewhere', user_id: 'alice', organization_id: OTHER_ORG },
    ],
    web_messages: [
      { id: 'm-alice', conversation_id: 'c-alice' },
      { id: 'm-bob', conversation_id: 'c-bob' },
    ],
    media_assets: [
      { id: 'f-stored', user_id: 'alice', organization_id: ORG, storage_pathname: 'media/a.png' },
      { id: 'f-external', user_id: 'alice', organization_id: ORG, storage_pathname: null },
    ],
  });
}

async function sweep(db: FakePostgres, table = 'web_conversations', type = 'conversation') {
  const exclusion = legalHoldExclusion(type as never, { alias: 'target', nextParamIndex: 1 });
  const deleted = await db.query<{ id: string }>(
    `delete from public.${table} target where ${exclusion.sql} returning id`,
    exclusion.params,
  );
  return deleted.map((row) => row.id).sort();
}

describe('the hold predicate, evaluated as a database would', () => {
  it('deletes every row when no hold is placed', async () => {
    const db = workspace([]);
    expect(await sweep(db)).toEqual(['c-alice', 'c-bob', 'c-elsewhere']);
  });

  it('preserves the subject of a member-scoped hold and nobody else', async () => {
    const db = workspace([holdRow({ scope: 'member', subject_user_id: 'alice' })]);
    expect(await sweep(db)).toEqual(['c-bob', 'c-elsewhere']);
  });

  it('preserves every custodian of a custodian-scoped hold', async () => {
    const db = workspace(
      [holdRow({ id: 'h-custodian', scope: 'custodian', subject_user_id: null })],
      [
        { hold_id: 'h-custodian', user_id: 'alice' },
        { hold_id: 'h-custodian', user_id: 'bob' },
      ],
    );
    expect(await sweep(db)).toEqual(['c-elsewhere']);
  });

  it('preserves the whole workspace under an organization-scoped hold', async () => {
    const db = workspace([holdRow({ scope: 'organization', subject_user_id: null })]);
    expect(await sweep(db)).toEqual(['c-elsewhere']);
  });

  it('stops at the workspace boundary', async () => {
    const db = workspace([
      holdRow({ organization_id: OTHER_ORG, scope: 'organization', subject_user_id: null }),
    ]);
    expect(await sweep(db)).toEqual(['c-alice', 'c-bob']);
  });

  it('stops preserving once the hold is released', async () => {
    const db = workspace([
      holdRow({
        scope: 'member',
        subject_user_id: 'alice',
        released_at: '2026-09-01T00:00:00.000Z',
      }),
    ]);
    expect(await sweep(db)).toEqual(['c-alice', 'c-bob', 'c-elsewhere']);
  });

  it('does not preserve a store the hold narrowed itself away from', async () => {
    const db = workspace([
      holdRow({ scope: 'member', subject_user_id: 'alice', resource_types: ['file'] }),
    ]);
    expect(await sweep(db)).toEqual(['c-alice', 'c-bob', 'c-elsewhere']);
  });

  it('preserves a store the hold names', async () => {
    const db = workspace([
      holdRow({ scope: 'member', subject_user_id: 'alice', resource_types: ['conversation'] }),
    ]);
    expect(await sweep(db)).toEqual(['c-bob', 'c-elsewhere']);
  });

  it('keeps a row held by one of two holds when the other is released', async () => {
    const db = workspace([
      holdRow({ id: 'h-one', scope: 'member', subject_user_id: 'alice' }),
      holdRow({
        id: 'h-two',
        scope: 'member',
        subject_user_id: 'alice',
        released_at: '2026-09-01T00:00:00.000Z',
      }),
    ]);
    expect(await sweep(db)).toEqual(['c-bob', 'c-elsewhere']);
  });

  it('preserves a row written after the hold was placed, with nobody enrolling it', async () => {
    const db = workspace([holdRow({ scope: 'member', subject_user_id: 'alice' })]);
    db.rowsIn('web_conversations').push({
      id: 'c-alice-later',
      user_id: 'alice',
      organization_id: ORG,
    });
    expect(await sweep(db)).toEqual(['c-bob', 'c-elsewhere']);
  });

  it('preserves a person who joins a hold after the fact', async () => {
    const db = workspace(
      [holdRow({ id: 'h-custodian', scope: 'custodian', subject_user_id: null })],
      [{ hold_id: 'h-custodian', user_id: 'alice' }],
    );
    db.rowsIn('legal_hold_custodians').push({ hold_id: 'h-custodian', user_id: 'bob' });
    expect(await sweep(db)).toEqual(['c-elsewhere']);
  });

  it('reaches a held person through the parent that owns the row', async () => {
    const db = workspace([holdRow({ scope: 'member', subject_user_id: 'alice' })]);
    expect(await sweep(db, 'web_messages', 'message')).toEqual(['m-bob']);
  });
});

describe('what a hold currently preserves', () => {
  it('counts the rows the same predicate would exclude', async () => {
    const db = workspace(
      [holdRow({ id: 'h-custodian', scope: 'custodian', subject_user_id: null })],
      [{ hold_id: 'h-custodian', user_id: 'alice' }],
    );
    const counts = await countHeldResources(
      db as unknown as DatabaseAdapter,
      hold({ id: 'h-custodian', scope: 'custodian', custodianUserIds: ['alice'] }),
      ['conversation', 'message'],
    );
    expect(counts).toEqual([
      { resourceType: 'conversation', table: 'web_conversations', preserved: 1, referenceOnly: 0 },
      { resourceType: 'message', table: 'web_messages', preserved: 1, referenceOnly: 0 },
    ]);
  });

  it('counts nothing for a hold that names no store this workspace holds', async () => {
    const db = workspace([holdRow({ id: 'h-empty', scope: 'member', subject_user_id: 'nobody' })]);
    const counts = await countHeldResources(
      db as unknown as DatabaseAdapter,
      hold({ id: 'h-empty', scope: 'member', subjectUserId: 'nobody' }),
      ['conversation'],
    );
    expect(counts).toEqual([
      { resourceType: 'conversation', table: 'web_conversations', preserved: 0, referenceOnly: 0 },
    ]);
  });

  it('separates rows whose bytes it holds from references to bytes it never stored', async () => {
    const db = workspace([holdRow({ id: 'h-alice', scope: 'member', subject_user_id: 'alice' })]);
    const counts = await countHeldResources(
      db as unknown as DatabaseAdapter,
      hold({ id: 'h-alice', scope: 'member', subjectUserId: 'alice' }),
      ['file'],
    );
    expect(counts).toEqual([
      { resourceType: 'file', table: 'media_assets', preserved: 2, referenceOnly: 1 },
    ]);
  });

  it('asks only about the hold it was given', async () => {
    const db = workspace([
      holdRow({ id: 'h-mine', scope: 'member', subject_user_id: 'alice' }),
      holdRow({ id: 'h-theirs', scope: 'organization', subject_user_id: null }),
    ]);
    const counts = await countHeldResources(
      db as unknown as DatabaseAdapter,
      hold({ id: 'h-mine', scope: 'member', subjectUserId: 'alice' }),
      ['conversation'],
    );
    expect(counts[0]?.preserved).toBe(1);
  });
});

describe('the resolved gate', () => {
  it('gathers member and custodian subjects into one answer', () => {
    const holds = [
      hold({ id: 'h-one', scope: 'member', subjectUserId: 'alice' }),
      hold({ id: 'h-two', scope: 'custodian', subjectUserId: null, custodianUserIds: ['bob'] }),
    ];
    expect(heldUserIdsFor(holds, 'conversation')).toEqual(['alice', 'bob']);
    expect(organizationWideHold(holds, 'conversation')).toBe(false);
  });

  it('drops a subject whose hold does not cover the store being swept', () => {
    const holds = [
      hold({ scope: 'member', subjectUserId: 'alice', resourceTypes: ['file'] }),
      hold({ id: 'h-two', scope: 'member', subjectUserId: 'bob' }),
    ];
    expect(heldUserIdsFor(holds, 'conversation')).toEqual(['bob']);
    expect(heldUserIdsFor(holds, 'file')).toEqual(['alice', 'bob']);
  });

  it('refuses to answer when the hold set cannot be read', async () => {
    const db = { query: vi.fn(async () => Promise.reject(new Error('connection reset'))) };
    await expect(
      readLegalHoldGate(db as unknown as DatabaseAdapter, ORG, 'conversation'),
    ).rejects.toBeInstanceOf(LegalHoldGateUnavailableError);
  });
});

describe('the predicate covers every store a hold can name', () => {
  it('renders for each declared holdable resource', () => {
    for (const resource of HOLDABLE_RESOURCES) {
      const exclusion = legalHoldExclusion(resource.resourceType as never, {
        alias: 'target',
        nextParamIndex: 3,
      });
      expect(exclusion.sql).toContain('$3');
      expect(exclusion.params).toEqual([resource.resourceType]);
      expect(exclusion.table).toBe(resource.table);
    }
  });

  it('refuses a store the contract does not declare', () => {
    expect(() =>
      legalHoldPredicate('telemetry' as never, { alias: 't', nextParamIndex: 1 }),
    ).toThrow(/No holdable resource/);
  });
});
