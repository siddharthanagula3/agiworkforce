import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = join(process.cwd(), 'db/neon/0122_copyright_notices.sql');

async function sql(): Promise<string> {
  return readFile(MIGRATION, 'utf8');
}

function withoutComments(text: string): string {
  return text.replace(/--[^\n]*/g, '');
}

describe('copyright notices migration', () => {
  it('gives a notice a status it can move through, which the audit log could not', async () => {
    const text = withoutComments(await sql());

    expect(text).toMatch(/create table if not exists public\.copyright_notices/i);
    expect(text).toMatch(
      /status text not null default 'received' check \(\s*status in \('received', 'actioned', 'rejected', 'counter_notified'\)/i,
    );
    expect(text).toMatch(/disposition_note text/i);
  });

  it('records that all three affirmations were made, not merely displayed', async () => {
    const text = withoutComments(await sql());

    for (const column of ['affirms_good_faith', 'affirms_accuracy', 'affirms_authority']) {
      expect(text).toMatch(new RegExp(`${column} boolean not null`, 'i'));
    }
  });

  it('keeps a claim reachable after the accused account is deleted', async () => {
    const text = withoutComments(await sql());

    const ownerColumn = text
      .split('\n')
      .find((line) => line.includes('target_owner_id'))
      ?.toLowerCase();

    expect(ownerColumn).toBeDefined();
    expect(ownerColumn).toContain('text');
    expect(ownerColumn).not.toContain('references');
    expect(ownerColumn).not.toContain('cascade');
  });

  it('grants the scoped role nothing, so no signed-in user can enumerate claims', async () => {
    const text = withoutComments(await sql());

    expect(text).not.toMatch(/grant[^;]*copyright_notices[^;]*app_rls/i);
    expect(text).toMatch(/alter table public\.copyright_notices enable row level security/i);
    expect(text).toMatch(/alter table public\.copyright_notices force row level security/i);
  });

  it('constrains the target to the two surfaces the takedown endpoint can revoke', async () => {
    const text = withoutComments(await sql());

    expect(text).toMatch(
      /target_kind text not null check \(target_kind in \('conversation-share', 'published-artifact'\)\)/i,
    );
  });
});
