import { describe, expect, it } from 'vitest';

import { chatPromptStamp, loadChatPromptRenderer, withChatPrompt } from '../src/chat-prompt';
import { loadDataset } from '../src/dataset';
import { resolveLiveTarget, type RegistryLike } from '../src/live';
import { buildRequest, fingerprintRequest } from '../src/request';
import { CHAT_PROMPT_REQUIRED_REASON, runLive } from '../src/run';
import type { EvalCase } from '../src/types';

const registry: RegistryLike = {
  models: { cheap: { lifecycle: { availability: 'live', deprecated: false } } },
  routes: {
    'direct/cheap': {
      modelKey: 'cheap',
      provider: 'gateway',
      providerModelId: 'cheap-wire',
      harnessId: 'gateway/chat',
      availability: 'live',
      isDefault: true,
      pricing: { inputPerMillion: 0.1, outputPerMillion: 0.4 },
    },
  },
  capabilities: { cheap: { textOutput: true, functionCalling: true } },
  limits: {},
  families: {},
};

const corpus = loadDataset('chat-prompt');

function row(id: string): EvalCase {
  const found = corpus.cases.find((entry) => entry.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

describe('rendering the product chat system prompt for a case', () => {
  it('tells a turn with tools but no search that search is unavailable, from v5 on', async () => {
    const searchOff = row('chat-prompt/own-resume-profile-search-off');
    const v1 = (await loadChatPromptRenderer(1, '2026-10-10')).render(searchOff);
    const v5 = (await loadChatPromptRenderer(5, '2026-10-10')).render(searchOff);

    expect(v1).toContain('- create_office_file');
    expect(v1).not.toContain('Web search is not available on this turn.');
    expect(v5).toContain('Web search is not available on this turn.');
    expect(v5).not.toContain('Web search is available on this turn');
    expect(v5).toContain('2026-10-10T12:00:00.000Z');
  });

  it('never carries both search statements, and gives a search turn the citation contract', async () => {
    const v5 = await loadChatPromptRenderer(5, '2026-10-10');
    const searchOn = v5.render(row('chat-prompt/own-resume-profile-search-on'));

    expect(searchOn).toContain('Web search is available on this turn');
    expect(searchOn).not.toContain('Web search is not available on this turn.');
    expect(searchOn).toContain('[1]');
    expect(searchOn).not.toContain('No sources were retrieved on this turn');
  });

  it('states the memory a case declares and says nothing about memory otherwise', async () => {
    const v5 = await loadChatPromptRenderer(5, '2026-10-10');

    expect(v5.render(row('chat-prompt/forget-with-memory-off'))).toContain(
      'Memory is off for this conversation',
    );
    expect(v5.render(row('chat-prompt/mentioned-file-not-attached'))).not.toMatch(/Memory is o/);
  });

  it("keeps a case's own system text, between the prompt body and the clock", async () => {
    const v5 = await loadChatPromptRenderer(5, '2026-10-10');
    const rendered = v5.render({ ...row('chat-prompt/public-office-contact'), system: 'ROW RULE' });

    expect(rendered.indexOf('ROW RULE')).toBeGreaterThan(rendered.indexOf('You are AGI Workforce'));
    expect(rendered.indexOf('ROW RULE')).toBeLessThan(rendered.indexOf('The current UTC date'));
  });

  it('pins one request per recording date, and a new prompt version is a new request', async () => {
    const searchOff = row('chat-prompt/own-resume-profile-search-off');
    const fingerprint = async (version: number, recordedOn: string) => {
      const [dataset] = withChatPrompt([corpus], await loadChatPromptRenderer(version, recordedOn));
      const evalCase = dataset!.cases.find((entry) => entry.id === searchOff.id)!;
      return fingerprintRequest(buildRequest(evalCase));
    };

    expect(await fingerprint(5, '2026-10-10')).toBe(await fingerprint(5, '2026-10-10'));
    expect(await fingerprint(5, '2026-10-10')).not.toBe(await fingerprint(1, '2026-10-10'));
    expect(await fingerprint(5, '2026-10-10')).not.toBe(await fingerprint(5, '2026-10-11'));
    expect(chatPromptStamp(5)).toBe('chat.system@5');
  });
});

describe('a corpus that needs the product chat prompt', () => {
  const answer = async () => ({ text: 'ok' });

  it('is reported unsupported on a bare-model run instead of graded', async () => {
    const outcome = await runLive([corpus], {
      target: resolveLiveTarget(registry, 'cheap'),
      recordedOn: '2026-10-10',
      responderFor: () => answer,
    });

    expect(outcome.reports).toHaveLength(0);
    expect(outcome.report.unsupportedSuites['chat-prompt']).toBe(CHAT_PROMPT_REQUIRED_REASON);
    expect(outcome.report.promptStamp).toBeUndefined();
  });

  it('is graded when the run renders the prompt, and the run names the version', async () => {
    const renderer = await loadChatPromptRenderer(5, '2026-10-10');
    const outcome = await runLive(withChatPrompt([corpus], renderer), {
      target: resolveLiveTarget(registry, 'cheap'),
      recordedOn: '2026-10-10',
      responderFor: () => answer,
      promptStamp: renderer.stamp,
    });

    expect(outcome.reports.map((report) => report.suite)).toEqual(['chat-prompt']);
    expect(outcome.report.promptStamp).toBe('chat.system@5');
    expect(outcome.recording.promptStamp).toBe('chat.system@5');
  });
});
