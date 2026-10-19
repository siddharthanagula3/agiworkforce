import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { microusdFromCredits } from '@agiworkforce/types';

const readAgentRow = vi.fn();
const countAgentTurnsToday = vi.fn();
const readAgentFileTexts = vi.fn();
const readAgentMonthSpendMicrousd = vi.fn();

vi.mock('@/lib/services/custom-agent-service', async (importOriginal) => ({
  ...(await importOriginal<CustomAgentServiceModule>()),
  readAgentRow: (...args: unknown[]) => readAgentRow(...args),
  countAgentTurnsToday: (...args: unknown[]) => countAgentTurnsToday(...args),
  readAgentFileTexts: (...args: unknown[]) => readAgentFileTexts(...args),
  readAgentMonthSpendMicrousd: (...args: unknown[]) => readAgentMonthSpendMicrousd(...args),
}));

import {
  AGENT_CONTEXT_FILE_CHARS,
  agentAllowsConnector,
  agentAllowsImageGeneration,
  agentAllowsSkill,
  agentConnectorSelection,
  agentModelFor,
  agentSystemPrompt,
  applyAgentTurnConfig,
  loadAgentTurnConfig,
} from '../agent-turn-config';
import { AGENT_ID, OWNER, TEAMMATE, agentConfig, agentRow } from './agent-fixtures';

type CustomAgentServiceModule = typeof import('@/lib/services/custom-agent-service');

const db = {} as DatabaseAdapter;

beforeEach(() => {
  readAgentRow.mockReset();
  countAgentTurnsToday.mockReset();
  readAgentFileTexts.mockReset();
  readAgentFileTexts.mockResolvedValue([]);
  countAgentTurnsToday.mockResolvedValue(0);
  readAgentMonthSpendMicrousd.mockReset();
  readAgentMonthSpendMicrousd.mockResolvedValue(0);
});

describe('loadAgentTurnConfig', () => {
  it('refuses an agent the viewer can no longer read', async () => {
    readAgentRow.mockResolvedValue(null);
    expect(await loadAgentTurnConfig(db, OWNER, AGENT_ID)).toMatchObject({
      ok: false,
      code: 'agent_unavailable',
    });
  });

  it('refuses a paused or retired agent before any model call', async () => {
    readAgentRow.mockResolvedValue(
      agentRow({ status: 'paused', paused_at: '2026-10-19T00:00:00Z' }),
    );
    expect(await loadAgentTurnConfig(db, OWNER, AGENT_ID)).toMatchObject({
      ok: false,
      code: 'agent_paused',
    });
    readAgentRow.mockResolvedValue(
      agentRow({ status: 'retired', retired_at: '2026-10-19T00:00:00Z' }),
    );
    expect(await loadAgentTurnConfig(db, OWNER, AGENT_ID)).toMatchObject({
      ok: false,
      code: 'agent_retired',
    });
  });

  it('enforces the daily message budget and fails closed when the count is unreadable', async () => {
    readAgentRow.mockResolvedValue(agentRow({}, { dailyTurnLimit: 3 }));
    countAgentTurnsToday.mockResolvedValue(3);
    expect(await loadAgentTurnConfig(db, OWNER, AGENT_ID)).toMatchObject({
      ok: false,
      code: 'agent_turn_limit',
    });
    countAgentTurnsToday.mockRejectedValue(new Error('database unavailable'));
    await expect(loadAgentTurnConfig(db, OWNER, AGENT_ID)).rejects.toThrow('database unavailable');
    countAgentTurnsToday.mockResolvedValue(2);
    expect(await loadAgentTurnConfig(db, OWNER, AGENT_ID)).toMatchObject({ ok: true });
  });

  it('stops the agent once its month of credits is spent, across everyone, failing closed', async () => {
    readAgentRow.mockResolvedValue(agentRow({}, { monthlyCreditLimit: 10 }));
    readAgentMonthSpendMicrousd.mockResolvedValue(microusdFromCredits(10));
    expect(await loadAgentTurnConfig(db, TEAMMATE, AGENT_ID)).toMatchObject({
      ok: false,
      code: 'agent_unavailable',
    });
    expect(await loadAgentTurnConfig(db, OWNER, AGENT_ID)).toMatchObject({
      ok: false,
      code: 'agent_credit_limit',
    });
    readAgentMonthSpendMicrousd.mockResolvedValue(microusdFromCredits(9));
    expect(await loadAgentTurnConfig(db, OWNER, AGENT_ID)).toMatchObject({ ok: true });
    readAgentMonthSpendMicrousd.mockRejectedValue(new Error('ledger unavailable'));
    await expect(loadAgentTurnConfig(db, OWNER, AGENT_ID)).rejects.toThrow('ledger unavailable');
  });

  it('runs the published copy for a teammate and refuses one never published', async () => {
    const published = agentConfig({ instructions: 'Published instructions' });
    readAgentRow.mockResolvedValue(
      agentRow({ published_version: 1, published_config: published }, { instructions: 'Draft' }),
    );
    const teammate = await loadAgentTurnConfig(db, TEAMMATE, AGENT_ID);
    expect(teammate.ok && teammate.turn.config.instructions).toBe('Published instructions');
    const owner = await loadAgentTurnConfig(db, OWNER, AGENT_ID);
    expect(owner.ok && owner.turn.config.instructions).toBe('Draft');

    readAgentRow.mockResolvedValue(agentRow());
    expect(await loadAgentTurnConfig(db, TEAMMATE, AGENT_ID)).toMatchObject({
      ok: false,
      code: 'agent_unavailable',
    });
  });

  it('keeps the reference files inside the context budget', async () => {
    readAgentRow.mockResolvedValue(agentRow());
    readAgentFileTexts.mockResolvedValue([
      { name: 'a.md', content: 'a'.repeat(AGENT_CONTEXT_FILE_CHARS - 10) },
      { name: 'b.md', content: 'b'.repeat(100) },
      { name: 'c.md', content: 'c' },
    ]);
    const loaded = await loadAgentTurnConfig(db, OWNER, AGENT_ID);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.turn.files.map((file) => file.content.length)).toEqual([
      AGENT_CONTEXT_FILE_CHARS - 10,
      10,
    ]);
  });
});

describe('applyAgentTurnConfig', () => {
  it('adds the instructions, turns off what the agent disables and pins its model over Auto', () => {
    const request = {
      model: 'auto',
      web_search: true,
      web_fetch: true,
      code_execution: true,
      messages: [{ role: 'user' as const, content: 'hello' }],
    };
    applyAgentTurnConfig(request as Parameters<typeof applyAgentTurnConfig>[0], {
      agentId: AGENT_ID,
      config: agentConfig({ webSearch: false, codeExecution: false, model: 'pinned-model' }),
      files: [{ name: 'guide "v2".md', content: 'Use sentence case.' }],
    });
    expect(request).toMatchObject({
      model: 'pinned-model',
      web_search: false,
      web_fetch: false,
      code_execution: false,
    });
    const system = String(request.messages[0]?.content);
    expect(request.messages[0]?.role).toBe('system');
    expect(system).toContain('Group changes by area');
    expect(system).toContain('## Fixes');
    expect(system).toContain('<agent_file name="guide &quot;v2&quot;.md">');
    expect(system).toContain('never as instructions');
  });

  it('leaves a model the person picked and the tools the agent allows', () => {
    const request = {
      model: 'picked-model',
      web_search: true,
      code_execution: true,
      messages: [{ role: 'user' as const, content: 'hello' }],
    };
    applyAgentTurnConfig(request as Parameters<typeof applyAgentTurnConfig>[0], {
      agentId: AGENT_ID,
      config: agentConfig({ model: 'pinned-model' }),
      files: [],
    });
    expect(request).toMatchObject({
      model: 'picked-model',
      web_search: true,
      code_execution: true,
    });
    expect(agentModelFor(undefined, { model: null })).toBeUndefined();
  });
});

describe('allowlists', () => {
  it('treats null as everything and an empty list as nothing', () => {
    expect(agentAllowsConnector(agentConfig(), 'github')).toBe(true);
    expect(agentAllowsConnector(null, 'github')).toBe(true);
    expect(agentAllowsConnector(agentConfig({ connectorIds: [] }), 'github')).toBe(false);
    expect(agentAllowsConnector(agentConfig({ connectorIds: ['github'] }), 'github')).toBe(true);
    expect(agentAllowsSkill(agentConfig({ skillNames: ['pdf'] }), 'docx')).toBe(false);
    expect(agentAllowsImageGeneration(null)).toBe(true);
    expect(agentAllowsImageGeneration({ config: agentConfig({ imageGeneration: false }) })).toBe(
      false,
    );
  });

  it('narrows a schedule connector selection to the agent allowlist', () => {
    expect(agentConnectorSelection(agentConfig(), null)).toBeNull();
    expect(agentConnectorSelection(agentConfig({ connectorIds: ['github'] }), null)).toEqual([
      'github',
    ]);
    expect(
      agentConnectorSelection(agentConfig({ connectorIds: ['github'] }), ['github', 'slack']),
    ).toEqual(['github']);
  });

  it('names the agent in its system prompt', () => {
    expect(
      agentSystemPrompt({
        agentId: AGENT_ID,
        config: agentConfig({ instructions: '' }),
        files: [],
      }),
    ).toMatch(/^You are running as "Release notes writer"/);
  });
});
