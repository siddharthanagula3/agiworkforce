import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  PRIVACY_MODES,
  STORAGE_LOCATIONS,
  TRUST_MODE_CONTRACTS,
  type PrivacyMode,
} from '@agiworkforce/types';
import { loadProjectContext, type ProjectContextDb } from '@/lib/services/project-context-service';

const PROJECT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER = 'user-a';
const OTHER = 'user-b';

interface Row {
  [key: string]: unknown;
}

/**
 * One store holding two projects. Every read is answered from it by the
 * predicates the SQL actually binds, so a query that forgets one of them
 * returns the other project's rows and this file fails.
 */
function projectStore() {
  const projects: Row[] = [
    {
      id: PROJECT_A,
      user_id: OWNER,
      name: 'Alpha',
      description: null,
      instructions: 'alpha-instructions',
      organization_id: null,
      is_archived: false,
      deleted_at: null,
    },
    {
      id: PROJECT_B,
      user_id: OTHER,
      name: 'Beta',
      description: null,
      instructions: 'beta-instructions',
      organization_id: null,
      is_archived: false,
      deleted_at: null,
    },
  ];
  const files: Row[] = [
    { project_id: PROJECT_A, id: 'f-a', file_name: 'alpha.md', summary: 'alpha-secret' },
    { project_id: PROJECT_B, id: 'f-b', file_name: 'beta.md', summary: 'beta-secret' },
  ];

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = sql.toLowerCase();
    if (text.includes('from user_projects')) {
      return projects.filter(
        (row) =>
          row['id'] === params[0] &&
          row['user_id'] === params[1] &&
          row['is_archived'] === false &&
          row['deleted_at'] === null,
      );
    }
    if (text.includes('from project_knowledge_files')) {
      return files
        .filter((row) => row['project_id'] === params[0])
        .map((row) => ({ ...row, extracted_text: null, extracted_anchors: null }));
    }
    return [];
  });

  return { query, db: { query } as unknown as ProjectContextDb };
}

describe('project A cannot read project B', () => {
  let store: ReturnType<typeof projectStore>;

  beforeEach(() => {
    store = projectStore();
  });

  it('loads only the asked project and only its own knowledge files', async () => {
    const context = await loadProjectContext(store.db, {
      projectId: PROJECT_A,
      userId: OWNER,
    });

    expect(context?.name).toBe('Alpha');
    expect(context?.projectId).toBe(PROJECT_A);
    expect(context?.knowledgeFiles.map((file) => file.fileName)).toEqual(['alpha.md']);
    const rendered = JSON.stringify(context);
    expect(rendered).not.toContain('beta-secret');
    expect(rendered).not.toContain('beta-instructions');
  });

  it('refuses another member project even when the id is known', async () => {
    await expect(
      loadProjectContext(store.db, { projectId: PROJECT_B, userId: OWNER }),
    ).resolves.toBeNull();
  });

  it('binds the owner alongside the project id on the project read', async () => {
    await loadProjectContext(store.db, { projectId: PROJECT_A, userId: OWNER });

    const projectCall = store.query.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('from user_projects'),
    );
    expect(projectCall?.[1]).toEqual([PROJECT_A, OWNER]);
    expect(String(projectCall?.[0])).toMatch(/user_id\s*=\s*\$2/u);
  });

  it('scopes sibling conversations to the project and the user together', async () => {
    await loadProjectContext(store.db, { projectId: PROJECT_A, userId: OWNER });

    const siblingCall = store.query.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('from web_conversations'),
    );
    const sql = String(siblingCall?.[0]).toLowerCase();
    expect(sql).toMatch(/c\.project_id\s*=\s*\$1/u);
    expect(sql).toMatch(/c\.user_id\s*=\s*\$2/u);
    expect(sql).toMatch(/c\.is_temporary\s*=\s*false/u);
  });
});

describe('local and cloud are separate places, not one place with a flag', () => {
  it('every trust mode rests its content somewhere no other mode does', () => {
    const locations = (PRIVACY_MODES as readonly PrivacyMode[]).map(
      (mode) => TRUST_MODE_CONTRACTS[mode].storage,
    );

    expect(new Set(locations).size).toBe(locations.length);
    for (const location of locations) expect(STORAGE_LOCATIONS).toContain(location);
  });

  it('a device-resident mode attributes no key to the platform and refuses failover', () => {
    const local = TRUST_MODE_CONTRACTS['local'];

    expect(local.storage).toBe('device');
    expect(local.keyAttribution).toBe('none');
    expect(local.failover).toBe('refuse');
    expect(local.cloudEgressAllowed).toBe(false);
  });

  it('a user-key mode may fail over only inside its own trust boundary', () => {
    const byok = TRUST_MODE_CONTRACTS['byok'];

    expect(byok.keyAttribution).toBe('user-key');
    expect(byok.failover).toBe('same-trust-boundary');
    expect(byok.cloudEgressAllowed).toBe(false);
  });

  it('only the managed mode may bill a platform key', () => {
    for (const mode of PRIVACY_MODES as readonly PrivacyMode[]) {
      if (TRUST_MODE_CONTRACTS[mode].keyAttribution === 'platform-key') {
        expect(mode).toBe('managed');
      }
    }
  });
});
