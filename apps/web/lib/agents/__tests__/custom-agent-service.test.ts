import { describe, expect, it } from 'vitest';
import { getModelEffortOptions, getSelectableModels } from '@agiworkforce/types';

import {
  createAgent,
  effectiveAgentConfig,
  normalizeAgentWebDomains,
  updateAgentDraft,
  sameAgentConfig,
  toManagedCloudAgent,
  validateAgentModel,
} from '@/lib/services/custom-agent-service';
import { OWNER, TEAMMATE, agentConfig, agentRow } from './agent-fixtures';

describe('custom agent presentation', () => {
  it('shows the owner the working copy with an unpublished-changes flag', () => {
    const unpublished = toManagedCloudAgent(agentRow(), OWNER, null);
    expect(unpublished).toMatchObject({
      isOwner: true,
      ownerUserId: null,
      hasUnpublishedChanges: true,
    });
    const published = toManagedCloudAgent(
      agentRow({ published_version: 1, published_config: agentConfig() }),
      OWNER,
      null,
    );
    expect(published?.hasUnpublishedChanges).toBe(false);
    const edited = toManagedCloudAgent(
      agentRow({ published_version: 1, published_config: agentConfig() }, { name: 'Renamed' }),
      OWNER,
      null,
    );
    expect(edited?.hasUnpublishedChanges).toBe(true);
  });

  it('shows a teammate only the published copy, with its owner, and nothing unpublished', () => {
    expect(toManagedCloudAgent(agentRow(), TEAMMATE, 'Ada')).toBeNull();
    const shared = toManagedCloudAgent(
      agentRow(
        { published_version: 2, published_config: agentConfig({ name: 'Published name' }) },
        { name: 'Draft name' },
      ),
      TEAMMATE,
      'Ada',
    );
    expect(shared).toMatchObject({
      name: 'Published name',
      isOwner: false,
      ownerName: 'Ada',
      ownerUserId: agentRow().user_id,
      hasUnpublishedChanges: false,
    });
    expect(effectiveAgentConfig(agentRow({ published_config: { name: '' } }), TEAMMATE)).toBeNull();
  });

  it('compares configurations without regard to allowlist order', () => {
    expect(
      sameAgentConfig(
        agentConfig({ connectorIds: ['b', 'a'] }),
        agentConfig({ connectorIds: ['a', 'b'] }),
      ),
    ).toBe(true);
    expect(sameAgentConfig(agentConfig({ connectorIds: [] }), agentConfig())).toBe(false);
  });

  it('accepts Auto and catalog models and refuses anything else', () => {
    expect(validateAgentModel(null)).toBeNull();
    expect(validateAgentModel('auto')).toBe('auto');
    expect(() => validateAgentModel('not-a-model')).toThrow('Pick a model from the list.');
  });

  it('keeps the website rules of each agent and reads a version published before them as none', () => {
    const ruled = agentRow(
      {},
      { allowedWebDomains: ['docs.example'], blockedWebDomains: ['ads.example'] },
    );
    expect(toManagedCloudAgent(ruled, OWNER, null)).toMatchObject({
      allowedWebDomains: ['docs.example'],
      blockedWebDomains: ['ads.example'],
    });
    const { allowedWebDomains: _a, blockedWebDomains: _b, ...older } = agentConfig();
    const published = toManagedCloudAgent(
      agentRow({ published_version: 1, published_config: older }),
      OWNER,
      null,
    );
    expect(published?.hasUnpublishedChanges).toBe(false);
  });

  it('stores website rules as bare, sorted, unique domains and refuses anything else', () => {
    expect(
      normalizeAgentWebDomains(['https://www.Docs.example/path', '*.b.example', 'docs.example']),
    ).toEqual(['b.example', 'docs.example']);
    expect(() => normalizeAgentWebDomains(['not a site'])).toThrow(
      'not a site is not a website address.',
    );
  });
});

describe('saving the website rules of an agent', () => {
  function recordingDb(row = agentRow()) {
    const executed: Array<{ sql: string; params: unknown[] }> = [];
    return {
      executed,
      db: {
        query: async () => [row],
        execute: async (sql: string, params: unknown[]) => {
          executed.push({ sql, params });
        },
      } as never,
    };
  }

  it('writes both lists as text arrays', async () => {
    const { db, executed } = recordingDb();
    await updateAgentDraft(db, OWNER, agentRow().id, {
      allowedWebDomains: ['www.docs.example'],
      blockedWebDomains: ['ads.example'],
    });
    expect(executed[0]?.sql).toContain('allowed_web_domains = $2::text[]');
    expect(executed[0]?.sql).toContain('blocked_web_domains = $3::text[]');
    expect(executed[0]?.params).toEqual([agentRow().id, ['docs.example'], ['ads.example'], OWNER]);
  });

  it('refuses a site that is both allowed and blocked', async () => {
    const { db, executed } = recordingDb();
    await expect(
      updateAgentDraft(db, OWNER, agentRow().id, {
        allowedWebDomains: ['docs.example'],
        blockedWebDomains: ['www.docs.example'],
      }),
    ).rejects.toThrow('docs.example cannot be both allowed and blocked.');
    expect(executed).toEqual([]);
  });
});

describe('reasoning effort of an agent', () => {
  const highestHigh = getSelectableModels().find((model) => {
    const efforts = getModelEffortOptions(model.id);
    return efforts.includes('high') && !efforts.includes('xhigh') && !efforts.includes('max');
  });
  const noEffort = getSelectableModels().find(
    (model) => getModelEffortOptions(model.id).length === 0,
  );

  function recordingDb(row = agentRow()) {
    const executed: Array<{ sql: string; params: unknown[] }> = [];
    return {
      executed,
      db: {
        query: async (sql: string, params: unknown[]) => {
          executed.push({ sql, params });
          return [row];
        },
        execute: async (sql: string, params: unknown[]) => {
          executed.push({ sql, params });
        },
      } as never,
    };
  }

  it('presents the level and reads a version published before effort existed as none', () => {
    expect(toManagedCloudAgent(agentRow({}, { effort: 'xhigh' }), OWNER, null)?.effort).toBe(
      'xhigh',
    );
    const { effort: _effort, ...older } = agentConfig();
    const published = toManagedCloudAgent(
      agentRow({ published_version: 1, published_config: older }),
      OWNER,
      null,
    );
    expect(published).toMatchObject({ effort: null, hasUnpublishedChanges: false });
  });

  it('writes the level the owner picks while the model is chosen per chat', async () => {
    const { db, executed } = recordingDb();
    await updateAgentDraft(db, OWNER, agentRow().id, { effort: 'max' });
    const update = executed.find((call) => call.sql.startsWith('update public.user_agents'));
    expect(update?.sql).toContain('effort = $2');
    expect(update?.params).toEqual([agentRow().id, 'max', OWNER]);
  });

  it('moves the level to the nearest one a newly pinned model takes, or clears it', async () => {
    expect(highestHigh).toBeDefined();
    expect(noEffort).toBeDefined();
    const pinned = recordingDb(agentRow({}, { effort: 'max' }));
    await updateAgentDraft(pinned.db, OWNER, agentRow().id, { model: highestHigh!.id });
    const update = pinned.executed.find((call) => call.sql.startsWith('update public.user_agents'));
    expect(update?.params).toEqual([agentRow().id, highestHigh!.id, 'high', OWNER]);

    const plain = recordingDb(agentRow({}, { effort: 'max' }));
    await updateAgentDraft(plain.db, OWNER, agentRow().id, { model: noEffort!.id });
    const cleared = plain.executed.find((call) => call.sql.startsWith('update public.user_agents'));
    expect(cleared?.params).toEqual([agentRow().id, noEffort!.id, null, OWNER]);
  });

  it('stores the level on a new agent', async () => {
    const { db, executed } = recordingDb();
    await createAgent(db, OWNER, null, { name: 'Coder', effort: 'max' });
    const insert = executed.find((call) => call.sql.includes('insert into public.user_agents'));
    expect(insert?.sql).toContain('blocked_web_domains, effort');
    expect(insert?.params.at(-1)).toBe('max');
  });
});
