import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cloud code sessions migration', () => {
  it('adds durable tenant-owned sessions and a bounded terminal journal', async () => {
    const sql = await readFile(join(process.cwd(), 'db/neon/0075_cloud_code_sessions.sql'), 'utf8');

    expect(sql).toMatch(/create table public\.cloud_code_sessions/i);
    expect(sql).toMatch(/unique\s*\(user_id, request_id\)/i);
    expect(sql).toMatch(/create table public\.cloud_code_terminal_entries/i);
    expect(sql).toMatch(/foreign key\s*\(session_id, user_id\)/i);
    expect(sql).toMatch(/octet_length\(stdout\)\s*<=\s*100000/i);
    expect(sql).toMatch(/cloud_code_sessions[\s\S]*force row level security/i);
    expect(sql).toMatch(/cloud_code_terminal_entries[\s\S]*force row level security/i);
    expect(sql.match(/app_row_is_visible\(user_id, organization_id\)/gi)).toHaveLength(2);
    expect(sql.match(/app_row_is_writable\(user_id, organization_id\)/gi)).toHaveLength(2);
    expect(sql).toMatch(/grant select, insert, update, delete on public\.cloud_code_sessions/i);
    expect(sql).toMatch(/cloud_code_terminal_entries_session_id_idx/i);
  });
});
