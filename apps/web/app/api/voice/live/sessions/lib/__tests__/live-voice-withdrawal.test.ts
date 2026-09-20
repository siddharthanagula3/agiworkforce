import { describe, expect, it } from 'vitest';
import { StatementScanPostgres, type Row } from '@/lib/services/__tests__/statement-scan-postgres';
import { loadLiveVoiceTranscript } from '../live-voice-context';

const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const ANCESTOR = '22222222-2222-4222-8222-222222222222';
const WITHDRAWN = '33333333-3333-4333-8333-333333333333';
const LEAF = '44444444-4444-4444-8444-444444444444';

function message(
  id: string,
  parentId: string | null,
  content: string,
  deletedAt: string | null,
): Row {
  return {
    id,
    parent_id: parentId,
    conversation_id: CONVERSATION,
    role: 'user',
    content,
    created_at: `2026-09-1${id[0]}T00:00:00.000Z`,
    deleted_at: deletedAt,
  };
}

function seeded() {
  return new StatementScanPostgres({
    web_messages: [
      message(ANCESTOR, null, 'the opening question', null),
      message(WITHDRAWN, ANCESTOR, 'the sentence the user took back', '2026-09-19T00:00:00.000Z'),
      message(LEAF, WITHDRAWN, 'what the user is asking now', null),
    ],
  });
}

const db = () => seeded() as unknown as Parameters<typeof loadLiveVoiceTranscript>[0];

describe('loadLiveVoiceTranscript', () => {
  it('keeps a deleted turn out of a linear transcript', async () => {
    const turns = await loadLiveVoiceTranscript(db(), {
      conversationId: CONVERSATION,
      activeLeafMessageId: null,
    });
    const spoken = turns.map((turn) => turn.content);
    expect(spoken).toContain('what the user is asking now');
    expect(spoken).not.toContain('the sentence the user took back');
  });

  it('keeps a deleted turn out of a branched transcript', async () => {
    const turns = await loadLiveVoiceTranscript(db(), {
      conversationId: CONVERSATION,
      activeLeafMessageId: LEAF,
    });
    const spoken = turns.map((turn) => turn.content);
    expect(spoken).toContain('what the user is asking now');
    expect(spoken).not.toContain('the sentence the user took back');
  });

  it('speaks nothing at all when the active leaf is the withdrawn turn', async () => {
    const turns = await loadLiveVoiceTranscript(db(), {
      conversationId: CONVERSATION,
      activeLeafMessageId: WITHDRAWN,
    });
    expect(turns).toEqual([]);
  });

  it('walks past no ancestor once the turn between them is withdrawn', async () => {
    const turns = await loadLiveVoiceTranscript(db(), {
      conversationId: CONVERSATION,
      activeLeafMessageId: LEAF,
    });
    expect(turns.map((turn) => turn.content)).not.toContain('the opening question');
  });
});
