import { describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { StatementScanPostgres, type Row } from '@/lib/services/__tests__/statement-scan-postgres';
import {
  messageExists,
  resolveAnsweredParentId,
  resolveLinearTail,
  resolveSurvivingLeaf,
} from '../message-thread';

const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const PARENT = '22222222-2222-4222-8222-222222222222';
const WITHDRAWN = '33333333-3333-4333-8333-333333333333';
const KEPT = '44444444-4444-4444-8444-444444444444';

function turn(id: string, parentId: string | null, deletedAt: string | null, role = 'user'): Row {
  return {
    id,
    parent_id: parentId,
    conversation_id: CONVERSATION,
    role,
    created_at: `2026-09-1${id[0]}T00:00:00.000Z`,
    deleted_at: deletedAt,
  };
}

function seeded() {
  return new StatementScanPostgres({
    web_messages: [
      turn(PARENT, null, null),
      turn(KEPT, PARENT, null, 'assistant'),
      turn(WITHDRAWN, PARENT, '2026-09-19T00:00:00.000Z', 'assistant'),
    ],
  }) as unknown as DatabaseAdapter;
}

describe('the thread reads that resolve a visible turn', () => {
  it('does not find a turn the user deleted', async () => {
    expect(await messageExists(seeded(), CONVERSATION, WITHDRAWN)).toBe(false);
    expect(await messageExists(seeded(), CONVERSATION, KEPT)).toBe(true);
  });

  it('answers no deleted leaf, so a new turn is never hung off one', async () => {
    expect(await resolveAnsweredParentId(seeded(), CONVERSATION, WITHDRAWN)).toBeNull();
    expect(await resolveAnsweredParentId(seeded(), CONVERSATION, KEPT)).toBe(PARENT);
  });

  it('never makes a deleted turn the tail a linear thread grows from', async () => {
    const db = new StatementScanPostgres({
      web_messages: [turn(WITHDRAWN, null, '2026-09-19T00:00:00.000Z'), turn(KEPT, null, null)],
    }) as unknown as DatabaseAdapter;
    expect(await resolveLinearTail(db, CONVERSATION)).toBe(KEPT);
  });

  it('never lands the reader on a deleted sibling after a delete', async () => {
    const db = new StatementScanPostgres({
      web_messages: [turn(PARENT, null, null), turn(WITHDRAWN, PARENT, '2026-09-19T00:00:00.000Z')],
    }) as unknown as DatabaseAdapter;
    expect(await resolveSurvivingLeaf(db, CONVERSATION, KEPT, PARENT)).toBe(PARENT);
    expect(await resolveSurvivingLeaf(seeded(), CONVERSATION, WITHDRAWN, PARENT)).toBe(KEPT);
  });
});
