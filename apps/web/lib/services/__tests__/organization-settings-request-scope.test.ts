import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(resolve(WEB_ROOT, path), 'utf8');
const scopedRoutes = [
  ['app/api/settings/organization/shared/route.ts', 1],
  ['app/api/settings/organization/shared/projects/[projectId]/route.ts', 3],
  ['app/api/settings/organization/shared/connectors/[connectorId]/route.ts', 2],
  ['app/api/settings/organization/shared/artifacts/[artifactId]/route.ts', 1],
  ['app/api/settings/organization/shared/conversations/[sharedSessionId]/route.ts', 1],
  ['app/api/settings/organization/spend-limit/route.ts', 2],
] as const;

// Bounded source-shape coverage, not proof of auth, control flow or live RLS.
describe('corrected sharing and spend routes retain request workspace authority', () => {
  for (const [path, count] of scopedRoutes) {
    it(path, () => {
      const source = read(path);
      expect(source).toContain("from '@/lib/services/org-sharing-service'");
      expect(source).not.toMatch(/\bresolveOrgMembership\s*\(/);
      expect(source).not.toMatch(/\bresolveActiveOrganizationId\s*\(/);
      const captures = [
        ...source.matchAll(
          /const \{ db, userId, organizationId \} = await getUserScopedDb\(request\);/g,
        ),
      ];
      const lookups = [
        ...source.matchAll(
          /await resolveOrgMembershipForOrganization\(db, userId, organizationId\)/g,
        ),
      ];
      expect(captures).toHaveLength(count);
      expect(lookups).toHaveLength(count);
      expect([...source.matchAll(/\bresolveOrgMembershipForOrganization\s*\(/g)]).toHaveLength(
        count,
      );
      for (let i = 0; i < count; i += 1) {
        expect(captures[i]!.index).toBeLessThan(lookups[i]!.index!);
        if (i + 1 < count) expect(lookups[i]!.index).toBeLessThan(captures[i + 1]!.index!);
      }
    });
  }

  it('has one exact membership lookup and a separate deliberate saved-selection wrapper', () => {
    const source = read('lib/services/org-sharing-service.ts');
    const wrapperStart = source.indexOf('export async function resolveOrgMembership(');
    const explicitStart = source.indexOf(
      'export async function resolveOrgMembershipForOrganization(',
    );
    const explicitEnd = source.indexOf('export function isOrgAdminRole(', explicitStart);
    expect(wrapperStart).toBeGreaterThan(-1);
    expect(explicitStart).toBeGreaterThan(wrapperStart);
    expect(explicitEnd).toBeGreaterThan(explicitStart);
    const wrapper = source.slice(wrapperStart, explicitStart);
    expect(wrapper).toContain('await resolveActiveOrganizationId(db, userId)');
    expect(wrapper).toContain(
      'return resolveOrgMembershipForOrganization(db, userId, organizationId);',
    );
    expect(wrapper).not.toContain('db.query');
    const helper = source.slice(explicitStart, explicitEnd);
    expect(helper).toContain('organizationId: string | null,');
    expect(helper).not.toContain('organizationId?:');
    const personal = helper.indexOf('if (organizationId === null) return null;');
    expect(personal).toBeGreaterThan(-1);
    expect(personal).toBeLessThan(helper.indexOf('await db.query'));
    expect(helper).toContain('where organization_id = $1 and user_id = $2');
    expect(helper).toContain("and status = 'active'");
    expect(helper).toContain('[organizationId, userId]');
    expect(helper).toContain('if (!row || row.organization_id !== organizationId) return null;');
    expect(helper).not.toMatch(/resolveActiveOrganizationId|getNeonDb|CachedActiveOrganization/);
  });
});
