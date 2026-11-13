import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadArtifactsPackage } from '../src/artifacts-package';
import { chatPromptStamp, loadChatPromptRenderer, withChatPrompt } from '../src/chat-prompt';
import { loadDataset } from '../src/dataset';
import { gradeCheck } from '../src/grader';
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

interface CatalogModel {
  readonly name: string;
  readonly developer: string;
  readonly knowledgeCutoff?: string;
}

const catalog = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../packages/contracts/types/src/models.json', import.meta.url)),
    'utf8',
  ),
) as {
  readonly models: Readonly<Record<string, CatalogModel>>;
  readonly developers: Readonly<Record<string, { readonly label: string }>>;
};

const [measuredKey, measuredModel] = Object.entries(catalog.models).find(
  ([, model]) =>
    model.knowledgeCutoff !== undefined && catalog.developers[model.developer] !== undefined,
) ?? ['', { name: '', developer: '' }];
const measuredDeveloper = catalog.developers[measuredModel.developer]?.label ?? '';

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

describe('rendering version 7 for a web chat turn', () => {
  it('names the markers the artifacts package derives, on every turn variant', async () => {
    const markers = (await loadArtifactsPackage()).EXPLICIT_ARTIFACT_MARKER_FOR;
    const v7 = await loadChatPromptRenderer(7, '2026-10-11');
    for (const id of [
      'chat-prompt/make-a-calculator',
      'chat-prompt/own-resume-profile-search-off',
      'chat-prompt/own-resume-profile-search-on',
    ]) {
      const rendered = v7.render(row(id));
      expect(rendered, id).toContain(`its marker: ${markers['html']} for html or svg`);
      expect(rendered, id).toContain(`${markers['react']} for jsx`);
    }
  });

  it("lists the case plan's product capabilities, free when the case names none", async () => {
    const v7 = await loadChatPromptRenderer(7, '2026-10-11');
    const free = v7.render(row('chat-prompt/what-can-you-do-free'));
    const pro = v7.render(row('chat-prompt/what-can-you-do-pro'));

    expect(free).toContain('- read files the user attaches');
    expect(free).not.toContain('- generate images');
    expect(pro).toContain('- generate images');
    expect(pro).toContain('- run Deep Research');
    expect(free).not.toContain('- work with apps the user has connected');
    expect(pro).toContain('- work with apps the user has connected');
    expect(pro).not.toContain('window.agi.complete(prompt, { connectors:');
    expect(v7.render(row('chat-prompt/make-a-calculator'))).not.toContain('- generate images');
  });

  it('grades the Pro overview for selective chat apps without requiring unreleased integrations', () => {
    const pro = row('chat-prompt/what-can-you-do-pro');
    const answer =
      'I can generate images, run Deep Research, build interactive artifacts, and work with connected apps.';
    expect(pro.checks.map((check) => gradeCheck(check, { text: answer }).passed)).not.toContain(
      false,
    );
    const withoutConnectors =
      'I can generate images, run Deep Research, and build interactive artifacts.';
    expect(
      pro.checks.map((check) => gradeCheck(check, { text: withoutConnectors }).passed),
    ).toContain(false);
  });

  it('renders versions before 7 exactly as their runs measured them', async () => {
    const v6 = await loadChatPromptRenderer(6, '2026-10-11');
    const rendered = v6.render(row('chat-prompt/what-can-you-do-pro'));

    expect(rendered).not.toContain('What this app offers');
    expect(rendered).not.toContain('first line of the block is its marker');
  });
});

describe('rendering version 11 for a web chat turn', () => {
  it('states the model the run measures, from the catalog, and says it is not known without one', async () => {
    const measured = await loadChatPromptRenderer(11, '2026-10-15', measuredKey);
    const unnamed = await loadChatPromptRenderer(11, '2026-10-15');
    const rendered = measured.render(row('chat-prompt/make-a-calculator'));

    expect(measuredKey.length).toBeGreaterThan(0);
    expect(rendered).toContain(
      `This turn runs on ${measuredModel.name}, a model made by ${measuredDeveloper}, which the user selected.`,
    );
    expect(rendered).toContain(`${measuredModel.name}'s training data runs to about`);
    expect(unnamed.render(row('chat-prompt/make-a-calculator'))).toContain(
      'Which model serves this turn is not stated here.',
    );
  });

  it('gives a case that declares its memory the setup of a saved web chat, in its project', async () => {
    const v11 = await loadChatPromptRenderer(11, '2026-10-15', measuredKey);
    const inProject = v11.render(row('chat-prompt/project-file-source-named'));

    expect(inProject).toContain(
      "What is set up for this chat right now:\n- This chat is saved in the user's chat history.\n- Memory is on.",
    );
    expect(inProject).toContain("- This chat is in one of the user's projects.");
    expect(inProject).toContain(
      'Under your answer, the app shows the user the sources it gave you:\n- the saved memories, listed under Sources\n- a link to each project file it supplied',
    );
  });

  it('gives every other case the setup the route sends for a saved web chat on default settings', async () => {
    const v11 = await loadChatPromptRenderer(11, '2026-10-15', measuredKey);
    const rendered = v11.render(row('chat-prompt/make-a-calculator'));

    expect(rendered).toContain(
      "What is set up for this chat right now:\n- This chat is saved in the user's chat history.\n- Memory is off,",
    );
    expect(rendered).toContain('- Search past chats is off');
    expect(rendered).toContain('- Connected apps are not available on this turn');
    expect(rendered).toContain('- Skills the user has installed');
    expect(rendered).not.toContain('Under your answer, the app shows the user the sources');
  });

  it('adds the memory and project file tool lines when a case offers those tools', async () => {
    const v11 = await loadChatPromptRenderer(11, '2026-10-15', measuredKey);
    const sections = (await import('../../../apps/web/lib/prompts/chat-system-prompt')) as {
      chatSystemPromptSections: (version: number) => Readonly<Record<string, string>>;
    };
    const text = sections.chatSystemPromptSections(11);
    const tool = (name: string) => ({ name, description: name, inputSchema: { type: 'object' } });
    const withTools = {
      ...row('chat-prompt/project-file-source-named'),
      tools: [tool('save_memory'), tool('search_files')],
    };

    expect(v11.render(withTools)).toContain(`${text['memory_on']}\n${text['memory_tools']}`);
    expect(v11.render(withTools)).toContain(
      `${text['project_with_files']}\n${text['project_file_tools']}`,
    );
    expect(v11.render(row('chat-prompt/project-file-source-named'))).not.toContain(
      text['memory_tools'],
    );
  });

  it('sends the web chat its cards and artifact apps, and its Settings', async () => {
    const rendered = (await loadChatPromptRenderer(11, '2026-10-15', measuredKey)).render(
      row('chat-prompt/recruiter-follow-up-email'),
    );

    expect(rendered).toContain('put it in a fenced code block with the language email');
    expect(rendered).toContain('window.agi.complete(prompt)');
    expect(rendered).toContain('General under Settings for their name');
  });

  it('renders versions before 8 the same whether or not the run names its model', async () => {
    for (const version of [6, 7]) {
      const plain = await loadChatPromptRenderer(version, '2026-10-15');
      const named = await loadChatPromptRenderer(version, '2026-10-15', measuredKey);
      for (const id of [
        'chat-prompt/forget-with-memory-off',
        'chat-prompt/project-file-source-named',
      ]) {
        expect(named.render(row(id)), `v${version} ${id}`).toBe(plain.render(row(id)));
      }
    }
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
