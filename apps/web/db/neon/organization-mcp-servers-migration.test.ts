import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAX_ORG_MCP_SERVERS } from '@/app/api/settings/organization/mcp/org-mcp-servers';

const MIGRATION = '0250_organization_mcp_servers.sql';

const migration = fs.readFileSync(path.resolve(import.meta.dirname, MIGRATION), 'utf8');
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down', MIGRATION.replace(/\.sql$/, '.down.sql')),
  'utf8',
);

describe('organization MCP servers migration', () => {
  it('keeps the short id out of the 0086 org-shared namespace', () => {
    expect(migration).toContain("short_id ~ '^p[0-9a-f]{10}$'");
  });

  it('never lets the application role write a governance table', () => {
    expect(migration).toContain('GRANT SELECT ON public.organization_mcp_servers TO app_rls');
    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON public.organization_mcp_servers FROM app_rls',
    );
    expect(migration).toContain('FORCE ROW LEVEL SECURITY');
  });

  it('lets only a member of the workspace read its servers', () => {
    expect(migration).toContain('FOR SELECT TO app_rls');
    expect(migration).toContain('public.organization_members m');
    expect(migration).toContain('m.user_id = public.current_app_user_id()');
  });

  it('cannot record a published server without the moment it was published', () => {
    expect(migration).toContain('CHECK (published = false OR published_at IS NOT NULL)');
  });

  it('retires by column rather than by delete, so the short id is never reused', () => {
    expect(migration).toContain('retired_at timestamptz');
    expect(migration).toMatch(/published_idx[\s\S]*WHERE published AND retired_at IS NULL/);
  });

  it('refuses two servers at the same URL in one workspace', () => {
    expect(migration).toContain(
      'CONSTRAINT organization_mcp_servers_url_unique UNIQUE (organization_id, url)',
    );
  });

  it('reverses itself and says what the reversal costs', () => {
    expect(reversal).toContain('DROP TABLE IF EXISTS public.organization_mcp_servers');
    expect(reversal).toContain('WHAT THIS COSTS');
    expect(reversal).toContain(`WHERE filename = '${MIGRATION}'`);
  });

  it('bounds how many servers one workspace can publish', () => {
    expect(MAX_ORG_MCP_SERVERS).toBeGreaterThan(0);
    expect(MAX_ORG_MCP_SERVERS).toBeLessThanOrEqual(512);
  });
});
