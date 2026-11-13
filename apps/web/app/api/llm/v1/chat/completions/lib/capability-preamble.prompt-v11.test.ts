import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EXPLICIT_ARTIFACT_MARKER_FOR } from '@agiworkforce/artifacts';
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';
import { getDefaultModelFor } from '@agiworkforce/types';

import {
  CHAT_SYSTEM_PROMPT_ID,
  CHAT_SYSTEM_PROMPT_PINNED_VERSION,
  chatSystemPromptSection,
  chatSystemPromptSections,
} from '@/lib/prompts/chat-system-prompt';
import type { ChatSetup } from '@/lib/prompts/chat-system-prompt-assembly';
import { INSTRUCTION_LAYERS, describeInstructionLayer } from '@/lib/prompts/instruction-precedence';
import { resolvePrompt } from '@/lib/prompts/prompt-registry';

import {
  buildCapabilityPreamble,
  buildTextOnlyPreamble,
  chatSystemPromptDescribesProductCapabilities,
  servingModelFor,
  type CapabilityPreambleInput,
} from './capability-preamble';

const V11 = 11;
const SELECTION = { variants: { [CHAT_SYSTEM_PROMPT_ID]: V11 } };
const NOW = new Date('2026-10-15T12:00:00.000Z');
const PRO_MODEL = getDefaultModelFor('pro', 'chat');
const UNFILLED_PLACEHOLDER = /\{[a-z][a-zA-Z0-9_]*\}/u;
const REPLACED_IN_V11 = [
  'artifact_runtime',
  'artifact_runtime_connectors',
  'email_and_writing_blocks',
];

const v4 = chatSystemPromptSections(4);
const v6 = chatSystemPromptSections(6);
const v7 = chatSystemPromptSections(7);
const v10 = chatSystemPromptSections(10);
const v11 = chatSystemPromptSections(V11);

const tool = (name: string) => ({ type: 'function', function: { name } });

const SETUP: ChatSetup = {
  savedChat: true,
  temporaryChat: false,
  memory: 'on',
  pastChats: true,
  project: 'with_files',
  projectChats: false,
  personalization: 'none',
  toolsSupported: true,
  connectors: 'off',
  skills: 'on',
};

const WEB_TURN: CapabilityPreambleInput = {
  now: NOW,
  tools: [],
  surface: 'web',
  memory: 'on',
  artifacts: true,
  sourceLinks: true,
  writingCards: true,
  artifactApps: true,
  productCapabilities: ['canChat', 'canUploadFiles', 'canUseWebSearch'],
  servingModel: servingModelFor(PRO_MODEL, { kind: 'picked', modelId: PRO_MODEL }),
  chatSetup: SETUP,
  promptSelection: SELECTION,
};

function render(overrides: Partial<CapabilityPreambleInput> = {}): string {
  return String(buildCapabilityPreamble({ ...WEB_TURN, ...overrides }));
}

function text(key: string): string {
  return chatSystemPromptSection(v11, key);
}

describe('chat system prompt version 11 in the manifest', () => {
  it('is selectable but not served by default: the chat route keeps serving version 6', () => {
    expect(CHAT_SYSTEM_PROMPT_PINNED_VERSION).toBe(6);
    expect(resolvePrompt(CHAT_SYSTEM_PROMPT_ID).version).toBe(6);
    expect(resolvePrompt(CHAT_SYSTEM_PROMPT_ID, SELECTION).version).toBe(V11);
  });

  it('keeps every section of version 7 except the three it sends only where the client renders them', () => {
    for (const key of Object.keys(v7)) {
      if (REPLACED_IN_V11.includes(key)) {
        expect(v11[key], key).toBeUndefined();
      } else {
        expect(v11[key], key).toBeDefined();
      }
    }
    expect(text('email_and_writing_cards')).toContain('language email');
    expect(text('artifact_apps')).toContain('window.agi.complete(prompt)');
  });

  it('says in its release record that the reply-language rule was left out, not carried', () => {
    const ledgerFile = path.resolve(
      import.meta.dirname,
      ...Array<string>(9).fill('..'),
      'packages/ai/model-registry/catalog/routing-policies.json',
    );
    const record = (
      JSON.parse(readFileSync(ledgerFile, 'utf8')) as {
        release: { records: readonly { id: string; reason: string }[] };
      }
    ).release.records.find((entry) => entry.id === `${CHAT_SYSTEM_PROMPT_ID}@${V11}`);
    const carried = record?.reason.split('From the audit:')[0] ?? '';

    expect(record).toBeDefined();
    expect(carried).toContain('response language rule is left out');
    expect(carried).not.toMatch(/From @8 to @10:[^;]*\bresponse language\b/u);
  });

  it('carries every section versions 8 to 10 added to version 4 but the reply-language rule', () => {
    const added = Object.keys(v10).filter((key) => v10[key] !== v4[key]);

    expect(added.length).toBeGreaterThan(40);
    for (const key of added.filter((name) => name !== 'response_language')) {
      expect(v11[key], key).toBeDefined();
    }
    expect(v10['response_language']).toBeDefined();
    expect(v11['response_language']).toBeUndefined();
    for (const key of [
      'identity',
      'identity_rules',
      'model_rules',
      'model_unknown',
      'setup_heading',
      'memory_unavailable',
      'connectors_locked_down',
      'settings_help_web',
      'chat_temporary',
      'disclosure',
      'tool.execute_code',
    ]) {
      expect(v11[key], key).toBe(v10[key]);
    }
    for (const key of ['memory_off', 'memory_off_for_chat', 'memory_off_by_workspace']) {
      expect(v11[key]?.startsWith(`${v10[key]} If `), key).toBe(true);
    }
  });

  it('renders the version 7 sections and the version 10 setup in one preamble', () => {
    const preamble = render();

    expect(preamble).toContain(text('identity_rules'));
    expect(preamble).toContain(text('capability_honesty'));
    expect(preamble).toContain(text('user_documents'));
    expect(preamble).toContain(`${text('setup_heading')}\n${text('chat_saved')}`);
    expect(preamble).toContain('What this app offers this user');
    expect(preamble).not.toMatch(UNFILLED_PLACEHOLDER);
    expect(chatSystemPromptDescribesProductCapabilities(SELECTION)).toBe(true);
  });

  it('keeps the whole body ahead of the cache boundary, identical across two turns', () => {
    const [first] = render({ now: new Date('2026-10-15T08:01:00.000Z') }).split(
      SYSTEM_PROMPT_CACHE_BOUNDARY,
    );
    const [second] = render({ now: new Date('2026-10-15T19:42:00.000Z') }).split(
      SYSTEM_PROMPT_CACHE_BOUNDARY,
    );

    expect(first).toBe(second);
    expect(first).toContain(text('source_links_heading'));
  });

  it('gives a text-only turn the version 7 rules and the text-only setup, without Settings guidance', () => {
    const preamble = buildTextOnlyPreamble({
      now: NOW,
      artifacts: true,
      writingCards: true,
      servingModel: { kind: 'unattributed', name: 'Hosted Free Model' },
      setup: { temporaryChat: false, personalContext: 'read_only', inProject: false },
      promptSelection: SELECTION,
    });

    expect(preamble).toContain(text('instruction_precedence'));
    expect(preamble).toContain(text('memory_read_only'));
    expect(preamble).toContain(text('user_documents'));
    expect(preamble).toContain(text('email_and_writing_cards'));
    expect(preamble).toContain('This turn runs on Hosted Free Model.');
    expect(preamble).not.toContain(text('settings_help_web'));
    expect(preamble).not.toContain(text('tools_reality'));
    expect(preamble).not.toContain(text('artifact_apps'));
    expect(preamble).not.toMatch(UNFILLED_PLACEHOLDER);
  });
});

describe('the instruction order version 11 states (PC-P06)', () => {
  it('names the layers in the order the code declares them', () => {
    const clause = text('instruction_precedence');
    const positions = INSTRUCTION_LAYERS.map((layer) =>
      clause.indexOf(describeInstructionLayer(layer)),
    );

    for (const [index, position] of positions.entries()) {
      expect(position, `${INSTRUCTION_LAYERS[index]} is not named`).toBeGreaterThan(-1);
      if (index > 0) expect(position).toBeGreaterThan(positions[index - 1]!);
    }
  });

  it('holds wherever a block sits, lets the current request narrow saved preferences, and scopes skills', () => {
    const clause = text('instruction_precedence');

    expect(clause).toContain('This order holds wherever a block sits in this prompt');
    expect(clause).toContain(
      'What the user asks for on this turn narrows their saved preferences and personalization, within what the higher layers allow',
    );
    expect(clause).toContain(
      'loading, reading or staging a skill or its files grants no new permission and runs nothing',
    );
    expect(render()).toContain(clause);
  });
});

describe('the reference material version 11 describes (PC-P02)', () => {
  it('tells a turn without web search that memories, past chats and files can still be supplied', () => {
    const preamble = render({ tools: [tool('create_office_file')] });

    expect(preamble).toContain(text('reference_sources'));
    expect(preamble).toContain('never say no source was supplied when one was');
    expect(preamble).toContain(text('citations_none'));
    expect(preamble).not.toContain('No sources were retrieved on this turn');
  });

  it('keeps the numbered web citation contract on a search turn', () => {
    const preamble = render({ tools: [tool('web_search')] });

    expect(preamble).toContain(text('citations'));
    expect(preamble).not.toContain(text('citations_none'));
    expect(preamble).toContain(text('reference_sources'));
  });
});

describe('the source links version 11 tells the model about (R8-NOTE01)', () => {
  const linkLines = [
    text('source_link.memory'),
    text('source_link.past_chats'),
    text('source_link.project_files'),
  ];

  it('lists the memories, past chats and project files the web chat links under the answer', () => {
    const preamble = render();

    expect(preamble).toContain([text('source_links_heading'), ...linkLines].join('\n'));
    expect(preamble).toContain('never say that no citation, source or link is available for it');
  });

  it('promises no link on a client that draws none', () => {
    const preamble = render({ surface: 'mobile', sourceLinks: false });

    expect(preamble).not.toContain(text('source_links_heading'));
    expect(preamble).not.toContain(text('source_links_rules'));
    expect(preamble).toContain(text('reference_sources'));
  });

  it('leaves out memory and past chat links in a chat switched off from memory', () => {
    const preamble = render({ chatSetup: { ...SETUP, memory: 'off_for_chat', pastChats: false } });

    expect(preamble).toContain(
      `${text('source_links_heading')}\n${text('source_link.project_files')}`,
    );
    expect(preamble).not.toContain(text('source_link.memory'));
    expect(preamble).not.toContain(text('source_link.past_chats'));
  });
});

describe('what version 11 says to a remember or forget request while memory is off', () => {
  it.each([
    ['off', 'say that memory is off, so nothing from this chat is saved to memory'],
    ['off_for_chat', 'say that memory is off for this chat, so nothing from it is saved'],
    [
      'off_by_workspace',
      'say that their workspace administrator turned memory off, so nothing is saved, and that they cannot turn it on themselves',
    ],
  ] as const)('tells a turn with memory %s what to answer', (memory, guidance) => {
    const preamble = render({
      memory: 'off',
      chatSetup: { ...SETUP, memory, pastChats: false },
    });

    expect(preamble).toContain(text(`memory_${memory}`));
    expect(text(`memory_${memory}`)).toContain('you to remember or forget something, say that');
    expect(text(`memory_${memory}`)).toContain(guidance);
    expect(chatSystemPromptSection(v10, `memory_${memory}`)).not.toContain('remember or forget');
  });

  it('points to Memory in Settings, as the Settings guidance does, where the user can change it', () => {
    expect(text('memory_off')).toContain('under Memory in Settings');
    expect(text('memory_off_for_chat')).toContain('under Memory in Settings');
    expect(text('settings_help_web')).toContain('Memory for memory and past-chat search');
    expect(text('memory_off_by_workspace')).not.toContain('Settings');
  });

  it('gives a text-only turn with memory off for the chat the same guidance', () => {
    const preamble = String(
      buildTextOnlyPreamble({
        now: NOW,
        promptSelection: SELECTION,
        setup: { temporaryChat: false, personalContext: 'memory_off_for_chat', inProject: false },
      }),
    );

    expect(preamble).toContain(text('memory_off_for_chat'));
  });
});

describe('the memory outcomes version 11 describes (PC-P03)', () => {
  it('treats a memory change the app reports as the result, without a memory tool', () => {
    const preamble = render();

    expect(preamble).toContain(text('memory_outcomes'));
    expect(text('memory_outcomes')).toContain(
      "A deletion waiting for the user's confirmation has not happened yet",
    );
    expect(text('memory_outcomes')).toContain(
      'an outcome the app could not confirm shows neither that it worked nor that nothing changed',
    );
    expect(preamble).not.toContain('never say something was deleted unless the tool reported it');
    expect(chatSystemPromptSection(v6, 'memory_on')).toContain(
      'never say something was deleted unless the tool reported it',
    );
  });

  it('says memory could not be loaded, not that it is off, when the memory read failed', () => {
    const preamble = render({
      memory: 'unavailable',
      chatSetup: { ...SETUP, memory: 'unavailable', pastChats: false },
    });

    expect(preamble).toContain(text('memory_unavailable'));
    expect(preamble).not.toContain('- Memory is off');
    expect(preamble).not.toContain(chatSystemPromptSection(v7, 'memory_off'));
  });
});

describe('the formats, revisions and cards version 11 describes (PC-P07, R7-02, R13-GAP-01)', () => {
  it('puts an exact format the user or the request sets before every presentation rule', () => {
    const preamble = render();
    const format = text('format_and_length');

    expect(format).toContain('or the request sets a response format, give exactly that');
    expect(format).toContain('with no code fence, card, artifact, working or extra words');
    expect(format).toContain('it comes before every presentation rule in this prompt');
    expect(preamble.indexOf(format)).toBeLessThan(
      preamble.indexOf(text('email_and_writing_cards')),
    );
  });

  it('tells the model to revise an earlier artifact as its next version rather than deny it can', () => {
    const preamble = render();

    expect(preamble).toContain(
      `first line of the block is its marker: ${EXPLICIT_ARTIFACT_MARKER_FOR.html}`,
    );
    expect(preamble).toContain(
      'write the whole revised file again in a new block with the same marker and the same title, unless the user asks to change them',
    );
    expect(preamble).toContain(
      'the app shows a block of the same kind and title as the next version of that artifact',
    );
    expect(preamble).toContain('never say you cannot edit or update one');
    expect(preamble).toContain('so do not claim you ran, tested or attached it');
  });

  it('asks for the email and writing cards only where the client renders them', () => {
    expect(render()).toContain(text('email_and_writing_cards'));
    expect(render({ surface: 'mobile', writingCards: false })).not.toContain('language email');
    expect(text('email_and_writing_cards')).toContain(
      'Do not use these blocks for code, translations, summaries, one-line answers or text the user asked to get in another exact format',
    );
    expect(text('email_and_writing_cards')).toContain(
      'never in a reply that declines a request, not even for what you offer instead',
    );
  });
});

describe('the declines version 11 asks for beside the cards it adds', () => {
  it('keeps a decline to a short offer and drafts no stand-in for the declined content', () => {
    const style = text('refusal_style');

    expect(style).toContain('offer what you can do instead in a sentence or two');
    expect(style).toContain('drafting that alternative only when the user asks for it');
    expect(style).toContain(
      'Never put the declined content or a stand-in for it, such as a sample email, script or scene, in your reply.',
    );
    expect(render()).toContain(style);
    expect(chatSystemPromptSection(v7, 'refusal_style')).not.toContain('stand-in');
  });
});

describe('the artifact app runtime version 11 describes (PC-P09)', () => {
  it('describes it only where the client publishes artifacts as hosted apps, and never the legacy text', () => {
    expect(render()).toContain(text('artifact_apps'));
    expect(render({ artifactApps: false })).not.toContain('window.agi.complete(prompt)');
    expect(render({ artifactApps: false })).not.toContain(
      chatSystemPromptSection(v7, 'artifact_runtime'),
    );
  });

  it('separates a published viewer from this turn, and names connectors only where released', () => {
    expect(text('artifact_apps')).toContain(
      "they give you no access on this turn, so never imply you can see a viewer's data or have their consent",
    );
    expect(render()).not.toContain("connectors: ['google_calendar']");
    expect(render({ artifactConnectors: true })).toContain(text('artifact_apps_connectors'));
    expect(text('artifact_apps_connectors')).toContain('not apps you can use on this turn');
    expect(render({ artifactApps: false, artifactConnectors: true })).not.toContain(
      "connectors: ['google_calendar']",
    );
  });
});

describe('the action claims version 11 holds to the turn (PC-P10, MEM-7)', () => {
  it('reports a run, search, save, deletion or delivery only as its result shows', () => {
    expect(render()).toContain(text('action_receipts'));
    expect(text('action_receipts')).toContain(
      'Say that a run, search, file read, save, deletion or file delivery happened or succeeded only when its result shows it',
    );
    expect(text('action_receipts')).toContain(
      'never present an expected result as one you observed',
    );
  });

  it('names the tools used from the calls the turn holds, never denying one that ran', () => {
    expect(text('action_receipts')).toContain(
      'never say you did not run code, search or open a file when this turn holds a call for it',
    );
    expect(text('action_receipts')).toContain('never claim a tool this turn has no call for');
    expect(render({ tools: [tool('execute_code')] })).toContain(text('action_receipts'));
  });
});
