import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = ['app/api/user/export/route.ts', 'lib/server/restricted-user-export-reader.ts']
  .map((path) => readFileSync(join(process.cwd(), path), 'utf8'))
  .join('\n');

function exportedSections(): string[] {
  return [...source.matchAll(/section: '([a-z_]+)'/g)].map((m) => m[1] as string);
}

// The export IS the self-serve access right. A category the product can erase
// on request but cannot show is half a right: media_assets was in the erasure
// inventory and missing here until 2026-08-21.
describe('the data export covers the personal data the product holds', () => {
  it('includes the files a user uploaded and the media generated for them', () => {
    expect(exportedSections()).toContain('media_assets');
  });

  it('exports metadata and a fetchable location, not inlined bytes', () => {
    // Bounded to the schema literal. An unbounded slice runs to end of file and
    // matches "data:" and "buffer" in unrelated code below.
    const start = source.indexOf('const mediaAssetExportSchema');
    const block = source.slice(start, source.indexOf('});', start));
    expect(block).toContain('storage_url');
    // Inlining media would make a JSON download unusable; a list with no way to
    // reach the files would not be an answer either.
    expect(block).not.toMatch(/base64|data:|buffer/i);
  });

  it('scopes every export query to the requesting user', () => {
    for (const query of source.matchAll(/sql: `([\s\S]*?)`/g)) {
      const sql = query[1] as string;
      if (!/\bfrom\b/i.test(sql)) continue;
      expect(sql, `unscoped export query: ${sql.slice(0, 80)}`).toMatch(/\$1/);
    }
  });

  // A right-of-access download is a copy handed to whoever holds the file. A
  // credential in it stays valid, so no query may select one. Only the select
  // list is scanned: `from api_keys` names a table, not a column.
  //
  // `key_hash` and `auth_header` are in the pattern because they are what this
  // schema actually calls its two credential columns; a pattern that only knows
  // the generic names passes the tables it most needs to guard.
  it('never selects a credential column', () => {
    const secretColumn =
      /token|secret|password|key_hash|client_secret|private_key|auth_header|credential/i;
    for (const query of source.matchAll(/sql: `([\s\S]*?)`/g)) {
      const sql = query[1] as string;
      const selectList = /\bselect\b([\s\S]*?)\bfrom\b/i.exec(sql);
      if (!selectList) continue;
      for (const column of (selectList[1] as string).split(',')) {
        expect(column, `export query selects a credential: ${column.trim()}`).not.toMatch(
          secretColumn,
        );
      }
    }
  });

  it('still covers the categories it already did', () => {
    const sections = exportedSections();
    for (const required of [
      'profile',
      'conversations',
      'messages',
      'projects',
      'project_knowledge_files',
      'memories',
      'artifacts',
      'user_settings',
      'user_connectors',
      'user_custom_connectors',
      'user_skills',
      'user_shortcuts',
      'scheduled_tasks',
      'support_tickets',
      'support_ticket_replies',
      'feedback',
      'notifications',
      'message_bookmarks',
      'message_reactions',
      'conversation_tags',
      'chat_folders',
      'research_reports',
      'published_artifacts',
      'consent_records',
      'data_rights_requests',
      'search_history',
      'api_keys',
      'security_audit_logs',
    ]) {
      expect(sections).toContain(required);
    }
  });
});
