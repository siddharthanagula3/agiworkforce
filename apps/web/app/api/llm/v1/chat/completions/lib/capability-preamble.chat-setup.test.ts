import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  getAutoRoutingProfileTiers,
  getDefaultAutoRoutingProfile,
  getDefaultModelFor,
  getDeveloperLabel,
  getModelMetadataById,
  getModelRegistryFacts,
  listCanonicalModels,
  ROUTING_PROFILE_CHOICE_OPTIONS,
} from '@agiworkforce/types';
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';

import { CHAT_SANDBOX_NETWORK_ACCESS } from '@/lib/e2b/session-store';
import {
  CHAT_SYSTEM_PROMPT_ID,
  chatSystemPromptSection,
  chatSystemPromptSections,
} from '@/lib/prompts/chat-system-prompt';
import { TEMPORARY_CHAT_RETENTION_DAYS } from '@/lib/server/temporary-files';

import {
  buildCapabilityPreamble,
  buildTextOnlyPreamble,
  servingModelFor,
  type CapabilityPreambleInput,
  type ChatSetup,
  type ModelSelection,
  type TextOnlyPreambleInput,
} from './capability-preamble';

const IDENTITY_VERSION = 8;
const SELECTION = { variants: { [CHAT_SYSTEM_PROMPT_ID]: IDENTITY_VERSION } };
const NOW = new Date('2026-10-02T12:00:00.000Z');
const UNFILLED_PLACEHOLDER = /\{[a-z][a-zA-Z0-9_]*\}/u;

const PRO_MODEL = getDefaultModelFor('pro', 'chat');
const AUTO = getDefaultAutoRoutingProfile();

function picked(
  modelId: string,
  extra: Omit<Extract<ModelSelection, { kind: 'picked' }>, 'kind' | 'modelId'> = {},
): ModelSelection {
  return { kind: 'picked', modelId, ...extra };
}

const MEMORY_TOOLS = ['save_memory', 'search_memory', 'forget_memory'].map((name) => ({
  type: 'function',
  function: { name },
}));
const FILE_TOOLS = ['search_files', 'open_file'].map((name) => ({
  type: 'function',
  function: { name },
}));

const SETUP: ChatSetup = {
  savedChat: true,
  temporaryChat: false,
  memory: 'on',
  pastChats: true,
  project: 'none',
  projectChats: false,
  personalization: 'applied',
  toolsSupported: true,
  connectors: 'on',
  skills: 'on',
};

function render(overrides: Partial<CapabilityPreambleInput> = {}): string {
  return String(
    buildCapabilityPreamble({
      now: NOW,
      tools: [],
      surface: 'web',
      promptSelection: SELECTION,
      servingModel: servingModelFor(PRO_MODEL, picked(PRO_MODEL)),
      chatSetup: SETUP,
      ...overrides,
    }),
  );
}

function setup(overrides: Partial<ChatSetup>): ChatSetup {
  return { ...SETUP, ...overrides };
}

function concreteModelOtherThan(modelId: string): string {
  const other = listCanonicalModels().find(
    (model) => model.id !== modelId && getModelRegistryFacts(model.id)?.isRouter !== true,
  );
  if (!other) throw new Error('the catalog holds no second concrete model');
  return other.id;
}

describe('chat system prompt identity', () => {
  it('names the assistant AGI, not the product or the model vendor', () => {
    const preamble = render();

    expect(preamble).toContain('You are AGI, the AI assistant in AGI Workforce');
    expect(preamble).toContain('When the user asks who you are, say you are AGI');
    expect(preamble).toContain("never present yourself as another AI company's assistant");
    expect(preamble).not.toContain('You are AGI Workforce, an AI assistant.');
  });

  it('lets personalization or workspace and project instructions rename the assistant', () => {
    const preamble = render();

    expect(preamble).toContain(
      'unless their personalization or the instructions of their workspace or project give you another name; then use that name.',
    );
    expect(preamble).toContain('Whatever name you use, never claim to be human');
    expect(preamble).toContain(
      'AGI is your name, not a claim to be artificial general intelligence.',
    );
  });

  it('states the model the user picked, with its developer, as the model answering', () => {
    const metadata = getModelMetadataById(PRO_MODEL);
    if (!metadata) throw new Error('the pro default model is not in the catalog');
    const developer = getDeveloperLabel(metadata.developer);

    const preamble = render();

    expect(preamble).toContain(
      `This turn runs on ${metadata.name}, a model made by ${developer}, which the user selected.`,
    );
    expect(preamble).toContain(`say ${metadata.name} by ${developer}`);
  });

  it('says Auto picked the model when the user selected Auto', () => {
    const name = getModelMetadataById(PRO_MODEL)?.name ?? '';
    const preamble = render({
      servingModel: servingModelFor(PRO_MODEL, picked(AUTO.id)),
    });

    expect(preamble).toContain(`This turn runs on ${name}`);
    expect(preamble).toContain(
      `The user selected ${AUTO.label}, which picks the model for each message`,
    );
    expect(preamble).not.toContain('which the user selected.');
  });

  it.each(ROUTING_PROFILE_CHOICE_OPTIONS.map((option) => [option.label, option.choice] as const))(
    'names the %s routing profile the user picked rather than Auto',
    (label, routingProfile) => {
      const preamble = render({
        servingModel: servingModelFor(PRO_MODEL, picked(AUTO.id, { routingProfile })),
      });

      expect(preamble).toContain(
        `The user selected ${label}, which picks the model for each message`,
      );
    },
  );

  it.each(getAutoRoutingProfileTiers().map((tier) => [tier.label, tier.id] as const))(
    'names the %s tier when the request picked its alias directly',
    (label, aliasId) => {
      const preamble = render({ servingModel: servingModelFor(PRO_MODEL, picked(aliasId)) });

      expect(preamble).toContain(`The user selected ${label}, which picks the model`);
    },
  );

  it('treats a router the user picked as an automatic choice named after the router', () => {
    const router = listCanonicalModels().find(
      (model) => getModelRegistryFacts(model.id)?.isRouter === true,
    );
    if (!router) throw new Error('the catalog holds no router model');

    const preamble = render({ servingModel: servingModelFor(PRO_MODEL, picked(router.id)) });

    expect(preamble).toContain(
      `The user selected ${router.name}, which picks the model for each message`,
    );
    expect(preamble).not.toContain('in place of the selected model');
  });

  it('says the workspace default answers when the member left the selection on Auto', () => {
    const name = getModelMetadataById(PRO_MODEL)?.name ?? '';
    const preamble = render({
      servingModel: servingModelFor(
        PRO_MODEL,
        picked(AUTO.id, { workspaceDefaultModelId: PRO_MODEL }),
      ),
    });

    expect(preamble).toContain(
      `This turn runs on ${name}, a model made by ${getDeveloperLabel(getModelMetadataById(PRO_MODEL)?.developer ?? '')}, which the workspace administrator set as the default model for the user's workspace; it answers whenever the user selects ${AUTO.label}.`,
    );
    expect(preamble).not.toContain('which picks the model for each message');
  });

  it('calls a model that is neither the selection nor the workspace default a substitute', () => {
    const preamble = render({
      servingModel: servingModelFor(
        PRO_MODEL,
        picked(AUTO.id, { workspaceDefaultModelId: concreteModelOtherThan(PRO_MODEL) }),
      ),
    });

    expect(preamble).toContain('which the app used in place of the selected model.');
    expect(preamble).not.toContain('set as the default model');
  });

  it('says the app picked the model where the user has no model choice', () => {
    const preamble = render({ servingModel: servingModelFor(PRO_MODEL, { kind: 'assigned' }) });

    expect(preamble).toContain('which the app picked for this message');
    expect(preamble).not.toContain('The user selected');
  });

  it('does not claim the user chose a model the app put in place of their selection', () => {
    const other = concreteModelOtherThan(PRO_MODEL);
    const preamble = render({ servingModel: servingModelFor(PRO_MODEL, picked(other)) });

    expect(preamble).toContain('which the app used in place of the selected model.');
    expect(preamble).not.toContain('which the user selected');
  });

  it('never names a model behind a router, since the router picks it per message', () => {
    const router = listCanonicalModels().find(
      (model) => getModelRegistryFacts(model.id)?.isRouter === true,
    );
    if (!router) throw new Error('the catalog holds no router model');

    const preamble = render({ servingModel: servingModelFor(router.id, picked(router.id)) });

    expect(preamble).toContain(`This turn runs through ${router.name}`);
    expect(preamble).toContain('do not guess which one it picked');
    expect(preamble).not.toContain('a model made by');
  });

  it('names a model it cannot attribute without inventing a developer', () => {
    const preamble = render({
      servingModel: { kind: 'unattributed', name: 'Hosted Free Model' },
    });

    expect(preamble).toContain('This turn runs on Hosted Free Model.');
    expect(preamble).toContain('say Hosted Free Model: that is true for this turn');
    expect(preamble).not.toContain('a model made by');
  });

  it('says the model can change between turns without claiming the user switched it', () => {
    const router = listCanonicalModels().find(
      (model) => getModelRegistryFacts(model.id)?.isRouter === true,
    );
    if (!router) throw new Error('the catalog holds no router model');
    const renderings = [
      render({ servingModel: servingModelFor(PRO_MODEL, { kind: 'assigned' }) }),
      render({ servingModel: servingModelFor(router.id, picked(router.id)) }),
      render({ servingModel: { kind: 'unattributed', name: 'Hosted Free Model' } }),
    ];

    for (const preamble of renderings) {
      expect(preamble).toContain(
        'The model can change between turns of a chat, when the user switches models or the app picks another one',
      );
      expect(preamble).not.toContain('The user can switch models during a chat');
    }
  });

  it('says it does not know the model when the turn does not name one, and names no vendor', () => {
    const preamble = render({ servingModel: null });

    expect(preamble).toContain('Which model serves this turn is not stated here.');
    expect(preamble).toContain(
      'say you do not know, and neither name nor rule out any model or model maker',
    );
    expect(preamble).not.toContain('This turn runs');
    expect(preamble).toContain("never present yourself as another AI company's assistant");
  });

  it("adds the model's training cutoff only when the catalog records one", () => {
    const dated = listCanonicalModels().find(
      (model) =>
        /^\d{4}-\d{2}/u.test(model.knowledgeCutoff ?? '') &&
        getModelRegistryFacts(model.id)?.isRouter !== true,
    );
    if (!dated) throw new Error('the catalog records no knowledge cutoff');
    const undated = listCanonicalModels().find(
      (model) => !model.knowledgeCutoff && getModelRegistryFacts(model.id)?.isRouter !== true,
    );
    if (!undated) throw new Error('every catalog model records a knowledge cutoff');

    expect(render({ servingModel: servingModelFor(dated.id, picked(dated.id)) })).toContain(
      `${dated.name}'s training data runs to about`,
    );
    expect(render({ servingModel: servingModelFor(undated.id, picked(undated.id)) })).not.toContain(
      'training data runs to about',
    );
  });
});

describe('what the chat setup tells the model', () => {
  it('describes memory as on, and offers the memory tools only when the turn has them', () => {
    expect(render()).toContain('- Memory is on.');
    expect(render()).not.toContain('use the memory tools');
    expect(render({ tools: MEMORY_TOOLS })).toContain('use the memory tools');
  });

  it('says memory is off rather than implying recall', () => {
    const preamble = render({ chatSetup: setup({ memory: 'off', pastChats: false }) });

    expect(preamble).toContain('- Memory is off, so you cannot see or save memories');
    expect(preamble).toContain('- Search past chats is off');
    expect(preamble).not.toContain('- Memory is on.');
  });

  it('turns memory and past chats off together when the chat switched memory off', () => {
    const preamble = render({ chatSetup: setup({ memory: 'off_for_chat', pastChats: false }) });

    expect(preamble).toContain('- Memory is off for this chat');
    expect(preamble).not.toContain('Search past chats');
  });

  it('blames the workspace, not the user, when the workspace turned memory off', () => {
    const preamble = render({ chatSetup: setup({ memory: 'off_by_workspace', pastChats: false }) });

    expect(preamble).toContain("- The user's workspace administrator has turned memory off");
    expect(preamble).toContain('the user cannot turn it on themselves');
    expect(preamble).not.toContain('- Memory is off, so you cannot see or save memories');
    expect(preamble).not.toContain('Search past chats');
  });

  it('says memory could not be loaded instead of calling it off when the read failed', () => {
    const preamble = render({ chatSetup: setup({ memory: 'unavailable', pastChats: false }) });

    expect(preamble).toContain('- Memory could not be loaded for this message');
    expect(preamble).not.toContain('- Memory is off');
    expect(preamble).not.toContain('Search past chats');
  });

  it('says personalization could not be loaded instead of saying there is none', () => {
    const preamble = render({ chatSetup: setup({ personalization: 'unavailable' }) });

    expect(preamble).toContain("- The user's personalization could not be loaded for this message");
    expect(preamble).not.toContain('- No custom instructions or other personalization apply');
  });

  it('replaces the memory and history lines with the temporary chat promise', () => {
    const preamble = render({
      tools: MEMORY_TOOLS,
      chatSetup: setup({ temporaryChat: true, savedChat: false }),
    });

    expect(preamble).toContain('- This is a temporary chat.');
    expect(preamble).toContain(`deleted after ${TEMPORARY_CHAT_RETENTION_DAYS} days`);
    expect(preamble).toContain('the user is asked before each call to a connected app');
    expect(preamble).not.toContain('- Memory is on.');
    expect(preamble).not.toContain('Search past chats is on');
    expect(preamble).not.toContain("saved in the user's chat history");
  });

  it('claims no connected app when none is on for the chat', () => {
    const preamble = render({ chatSetup: setup({ connectors: 'off' }) });

    expect(preamble).toContain('- No connected apps are on for this chat');
    expect(preamble).not.toContain('reach you as tools named after each app');
  });

  it('withholds connected apps and skills from a model that cannot use tools', () => {
    const preamble = render({ chatSetup: setup({ toolsSupported: false }) });

    expect(preamble).toContain('cannot use tools, so connected apps and skills are not available');
    expect(preamble).not.toContain('reach you as tools named after each app');
    expect(preamble).not.toContain('the skill tool loads them');
  });

  it('describes project knowledge only for a chat in a project', () => {
    expect(render()).toContain('- This chat is not in a project');
    expect(render({ chatSetup: setup({ project: 'without_files' }) })).toContain(
      'the project has no knowledge files',
    );

    const withFiles = render({ chatSetup: setup({ project: 'with_files' }) });
    expect(withFiles).toContain('its list of knowledge files');
    expect(withFiles).not.toContain('Use the file search tools');
    expect(render({ tools: FILE_TOOLS, chatSetup: setup({ project: 'with_files' }) })).toContain(
      'Use the file search tools',
    );
  });

  it('reports personalization as applied, absent or switched off', () => {
    expect(render()).toContain("- The user's personalization");
    expect(render({ chatSetup: setup({ personalization: 'none' }) })).toContain(
      '- No custom instructions or other personalization apply to this chat.',
    );
    expect(render({ chatSetup: setup({ personalization: 'off' }) })).toContain(
      '- Personalization is off for this chat',
    );
  });

  it('mentions skills only where they can be offered', () => {
    expect(render()).toContain('the skill tool loads them');
    expect(render({ chatSetup: setup({ skills: 'off' }) })).toContain(
      'Skills are turned off for this account by its workspace administrator.',
    );
    const developerSurface = render({ chatSetup: setup({ skills: 'none' }) });
    expect(developerSurface).not.toContain('the skill tool loads them');
    expect(developerSurface).not.toContain('Skills are turned off');
  });

  it('points the user to Settings and admits what it cannot see', () => {
    const preamble = render();

    expect(preamble).toContain('Settings: Memory for memory and past-chat search');
    expect(preamble).toContain('Connectors for connected apps');
    expect(preamble).toContain("You cannot see the user's plan, usage, limits, billing");
    expect(preamble).toContain("Reply in the language of the user's latest message");
  });

  it.each(['web', 'desktop'] as const)(
    'gives the web app Settings and composer guidance on %s',
    (surface) => {
      const preamble = render({ surface });

      expect(preamble).toContain('General for their name, custom instructions and response style');
      expect(preamble).toContain('Skills and Plugins to add or turn off skills and plugins');
      expect(preamble).toContain('They pick the model with the model picker');
      expect(preamble).toContain('point them to Usage or Billing in Settings;');
    },
  );

  it('names the mobile Settings rows in the mobile app', () => {
    const preamble = render({ surface: 'mobile' });

    expect(preamble).toContain(
      'Personalization for their name, custom instructions and response style',
    );
    expect(preamble).toContain('point them to Usage or Subscription in Settings');
    expect(preamble).toContain('point them to Help Center in Settings');
    expect(preamble).not.toContain('General for their name');
    expect(preamble).not.toContain('Skills and Plugins');
  });

  it.each(['chrome', 'cli', 'vscode', 'unknown', 'slack', 'scheduled'] as const)(
    'sends the user to the web app and promises no picker or composer on %s',
    (surface) => {
      const preamble = render({ surface });

      expect(preamble).toContain('in Settings in the AGI Workforce web app');
      expect(preamble).not.toContain('model picker');
      expect(preamble).not.toContain('composer');
      expect(preamble).not.toContain('temporary chat to keep');
    },
  );

  it('leaves no template placeholder unfilled in any rendering', () => {
    const renderings = [
      render(),
      render({
        tools: [...MEMORY_TOOLS, ...FILE_TOOLS],
        chatSetup: setup({ project: 'with_files' }),
      }),
      render({ chatSetup: setup({ temporaryChat: true, savedChat: false }) }),
      render({ servingModel: servingModelFor(PRO_MODEL, picked(AUTO.id)) }),
      render({ servingModel: { kind: 'unattributed', name: 'Hosted Free Model' } }),
    ];

    for (const preamble of renderings) expect(preamble).not.toMatch(UNFILLED_PLACEHOLDER);
  });

  it('keeps the setup ahead of the cache boundary and byte-identical across two turns', () => {
    const turnOne = render({ now: new Date('2026-10-02T12:03:00.000Z') });
    const turnTwo = render({ now: new Date('2026-10-02T13:41:00.000Z') });
    const [stableOne] = turnOne.split(SYSTEM_PROMPT_CACHE_BOUNDARY);
    const [stableTwo] = turnTwo.split(SYSTEM_PROMPT_CACHE_BOUNDARY);

    expect(stableOne).toContain('What is set up for this chat right now:');
    expect(stableOne).toBe(stableTwo);
    expect(turnOne).not.toBe(turnTwo);
  });

  it('does not tell a tool-less turn that no tools exist when connected apps may still arrive', () => {
    const preamble = render({ tools: [] });

    expect(preamble).toContain('None of the built-in tools are attached to this turn');
    expect(preamble).not.toContain('No tools are available on this turn');
  });
});

describe('what the tools tell the model', () => {
  const CAPABILITIES_SETTINGS_FILE = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    '..',
    '..',
    'features',
    'settings',
    'sections',
    'CapabilitiesSection.tsx',
  );
  const TRUSTED_HOSTS_TEXT = 'only GitHub, npm and PyPI';

  it('says the chat sandbox reaches only the hosts its trusted egress allows', () => {
    const preamble = render({ tools: [{ type: 'function', function: { name: 'execute_code' } }] });

    expect(CHAT_SANDBOX_NETWORK_ACCESS).toBe('trusted');
    expect(readFileSync(CAPABILITIES_SETTINGS_FILE, 'utf8')).toContain(TRUSTED_HOSTS_TEXT);
    expect(preamble).toContain(`Its network reaches ${TRUSTED_HOSTS_TEXT}`);
    expect(preamble).toContain('cannot call other sites or APIs');
    expect(preamble).not.toContain('a network connection');
  });
});

describe('the text-only preamble', () => {
  const FREE_MODEL = { kind: 'unattributed', name: 'Hosted Free Model' } as const;
  const sections = chatSystemPromptSections(IDENTITY_VERSION);

  function textOnly(overrides: Partial<TextOnlyPreambleInput> = {}): string {
    return buildTextOnlyPreamble({
      now: NOW,
      promptSelection: SELECTION,
      servingModel: FREE_MODEL,
      ...overrides,
    });
  }

  it('keeps who the assistant is, the model, the missing tools and the honesty rules', () => {
    const preamble = textOnly();

    for (const key of [
      'identity',
      'identity_rules',
      'no_tools',
      'disclosure',
      'response_language',
    ]) {
      expect(preamble, key).toContain(chatSystemPromptSection(sections, key));
    }
    expect(preamble).toContain('This turn runs on Hosted Free Model.');
    expect(preamble).toContain('say Hosted Free Model: that is true for this turn');
    expect(preamble).toContain('The current UTC date and time is 2026-10-02T12:00:00.000Z');
  });

  it('leaves out the artifact runtime, the Settings guidance and every tool section', () => {
    const preamble = textOnly({ timeZone: 'Europe/London' });

    for (const key of [
      'artifact_runtime',
      'instruction_precedence',
      'settings_help_web',
      'settings_help_mobile',
      'settings_help_account',
      'account_help_web',
      'account_help_mobile',
      'account_help_account',
      'tools_heading',
      'tools_reality',
    ]) {
      expect(preamble, key).not.toContain(chatSystemPromptSection(sections, key));
    }
    expect(preamble).toContain('(Europe/London)');
    expect(preamble).not.toMatch(UNFILLED_PLACEHOLDER);
  });

  it('says memory, personalization and project knowledge are not used where the route reads none', () => {
    const preamble = textOnly({
      setup: { temporaryChat: false, personalContext: 'not_used' },
    });

    expect(preamble).toContain('What is set up for this chat right now:');
    expect(preamble).toContain(
      '- Memory, past chats, personalization and project knowledge are not used with this model',
    );
    expect(preamble).toContain('- Connected apps and skills are not available with this model');
    expect(preamble).not.toContain("but the project's instructions and knowledge files");
    expect(preamble).not.toContain('- Memory is on.');
  });

  it('says what reaches the model and that it saves nothing when the route reads the account', () => {
    const preamble = textOnly({
      setup: { temporaryChat: false, personalContext: 'read_only', inProject: true },
    });

    expect(preamble).toContain('appear further down when they are turned on and bear on this');
    expect(preamble).toContain('This model cannot save anything to memory.');
    expect(preamble).toContain("but the project's instructions and knowledge files are not used");
    expect(preamble).not.toContain('are not used with this model: you cannot see');
  });

  it('reports memory and personalization switched off for the chat', () => {
    expect(
      textOnly({
        setup: { temporaryChat: false, personalContext: 'off_for_chat', inProject: false },
      }),
    ).toContain('- Personalization is off for this chat');
    expect(
      textOnly({
        setup: { temporaryChat: false, personalContext: 'memory_off_for_chat', inProject: false },
      }),
    ).toContain('- Memory is off for this chat');
  });

  it('gives a temporary chat its promise in place of the memory lines', () => {
    const preamble = textOnly({
      setup: { temporaryChat: true, personalContext: 'read_only', inProject: false },
    });

    expect(preamble).toContain('- This is a temporary chat.');
    expect(preamble).toContain(`deleted after ${TEMPORARY_CHAT_RETENTION_DAYS} days`);
    expect(preamble).not.toContain('This model cannot save anything to memory.');
    expect(preamble).not.toMatch(UNFILLED_PLACEHOLDER);
  });

  it('adds no setup to version 1, which has none', () => {
    const versionOne = { variants: { [CHAT_SYSTEM_PROMPT_ID]: 1 } };

    expect(
      textOnly({
        promptSelection: versionOne,
        setup: { temporaryChat: true, personalContext: 'not_used' },
      }),
    ).toBe(textOnly({ promptSelection: versionOne }));
  });

  it('renders version 1 byte for byte as the full preamble of a tool-less turn', () => {
    const versionOne = { variants: { [CHAT_SYSTEM_PROMPT_ID]: 1 } };

    expect(textOnly({ promptSelection: versionOne, servingModel: null })).toBe(
      buildCapabilityPreamble({
        now: NOW,
        tools: [],
        surface: 'web',
        promptSelection: versionOne,
        servingModel: null,
      }),
    );
  });
});

describe('chat prompt v9', () => {
  const V6 = { variants: { [CHAT_SYSTEM_PROMPT_ID]: 9 } };

  function renderV6(overrides: Partial<CapabilityPreambleInput> = {}): string {
    return render({ promptSelection: V6, ...overrides });
  }

  it('tells a project chat its other chats appear and narrows past chats to chats outside it', () => {
    const preamble = renderV6({
      chatSetup: setup({
        project: 'without_files',
        projectChats: true,
        memory: 'off',
        pastChats: false,
      }),
    });

    expect(preamble).toContain(
      "- Excerpts from the user's other chats in this project appear further down.",
    );
    expect(preamble).toContain(
      "- Search past chats is off, so you cannot see the user's chats outside this project.",
    );
    expect(preamble).not.toContain(
      "- Search past chats is off, so you cannot see the user's other chats.",
    );
  });

  it.each([
    [
      'off_for_chat',
      '- Memory is off for this chat, so saved memories and chats outside this project are not used here',
    ],
    [
      'unavailable',
      "- Memory could not be loaded for this message, so you cannot see saved memories or the user's chats outside this project here.",
    ],
  ] as const)('narrows memory %s to chats outside the project', (memory, line) => {
    const preamble = renderV6({
      chatSetup: setup({ project: 'with_files', projectChats: true, memory, pastChats: false }),
    });

    expect(preamble).toContain(line);
    expect(preamble).toContain('in this project appear further down');
  });

  it('keeps the plain lines in a project whose other chats did not reach the turn', () => {
    const preamble = renderV6({
      chatSetup: setup({
        project: 'without_files',
        projectChats: false,
        memory: 'off',
        pastChats: false,
      }),
    });

    expect(preamble).toContain(
      "- Search past chats is off, so you cannot see the user's other chats.",
    );
    expect(preamble).not.toContain('in this project appear further down');
  });

  it('says memory is off for the workspace without saying an administrator turned it off', () => {
    const preamble = renderV6({
      chatSetup: setup({ memory: 'off_by_workspace', pastChats: false }),
    });

    expect(preamble).toContain(
      "- Memory is off for the user's workspace, and only a workspace administrator can turn it on",
    );
    expect(preamble).not.toContain('administrator has turned memory off');
  });

  it.each([
    [
      'unavailable',
      '- Connected apps are not available on this turn, even ones the user has connected',
    ],
    ['locked_down', '- Lockdown mode is on for this account, so connected apps cannot be used'],
  ] as const)('says connected apps are %s rather than disconnected', (connectors, line) => {
    const preamble = renderV6({ chatSetup: setup({ connectors }) });

    expect(preamble).toContain(line);
    expect(preamble).not.toContain('reach you as tools named after each app');
    expect(preamble).not.toContain('- No connected apps are on for this chat');
  });

  it('falls back to the connected-apps-off line in v5, which has no line for those states', () => {
    for (const connectors of ['unavailable', 'locked_down'] as const) {
      const preamble = render({ chatSetup: setup({ connectors }) });

      expect(preamble).toContain('- No connected apps are on for this chat');
      expect(preamble).not.toContain('reach you as tools named after each app');
    }
  });

  it.each(['web', 'desktop'] as const)('names General under Settings on %s', (surface) => {
    expect(renderV6({ surface })).toContain(
      'General under Settings for their name, custom instructions and response style',
    );
  });

  it('says a temporary chat is kept past its retention only under a legal hold', () => {
    expect(renderV6({ chatSetup: setup({ temporaryChat: true, savedChat: false }) })).toContain(
      `deleted after ${TEMPORARY_CHAT_RETENTION_DAYS} days unless a legal hold on their workspace keeps it longer.`,
    );
  });

  it('leaves no template placeholder unfilled in any rendering', () => {
    const renderings = [
      renderV6(),
      renderV6({
        chatSetup: setup({ project: 'with_files', projectChats: true, pastChats: false }),
      }),
      renderV6({ chatSetup: setup({ temporaryChat: true, savedChat: false }) }),
      renderV6({ chatSetup: setup({ connectors: 'locked_down' }) }),
    ];

    for (const preamble of renderings) expect(preamble).not.toMatch(UNFILLED_PLACEHOLDER);
  });
});

describe('chat prompt v10', () => {
  const V6 = { variants: { [CHAT_SYSTEM_PROMPT_ID]: 9 } };
  const V7 = { variants: { [CHAT_SYSTEM_PROMPT_ID]: 10 } };

  it('holds no line that narrows past chats or memory to chats outside a project', () => {
    expect(
      Object.keys(chatSystemPromptSections(10)).filter((key) => key.endsWith('_in_project')),
    ).toEqual([]);
  });

  it("tells a project chat with search past chats on that the project's other chats appear", () => {
    const preamble = render({
      promptSelection: V7,
      chatSetup: setup({ project: 'with_files', projectChats: true }),
    });

    expect(preamble).toContain(
      "- Excerpts from the user's other chats in this project appear further down.",
    );
    expect(preamble).toContain('- Search past chats is on');
  });

  it.each([
    ['an ordinary chat', setup({})],
    [
      'a project chat that receives its other chats',
      setup({ project: 'with_files', projectChats: true }),
    ],
    [
      'a project chat with search past chats off',
      setup({ project: 'with_files', pastChats: false }),
    ],
    ['a chat switched off from memory', setup({ memory: 'off_for_chat', pastChats: false })],
    ['a chat whose memory could not be loaded', setup({ memory: 'unavailable', pastChats: false })],
    ['a temporary chat', setup({ temporaryChat: true, savedChat: false })],
  ])('renders %s as v6 does', (_name, chatSetup) => {
    expect(render({ promptSelection: V7, chatSetup })).toBe(
      render({ promptSelection: V6, chatSetup }),
    );
  });
});

describe('the pinned version', () => {
  it('renders byte for byte what it rendered before the chat setup existed', () => {
    const withContext = buildCapabilityPreamble({
      now: NOW,
      tools: MEMORY_TOOLS,
      surface: 'mobile',
      servingModel: servingModelFor(PRO_MODEL, picked(PRO_MODEL)),
      chatSetup: SETUP,
    });
    const withoutContext = buildCapabilityPreamble({
      now: NOW,
      tools: MEMORY_TOOLS,
      surface: 'web',
      servingModel: null,
    });

    expect(withContext).toBe(withoutContext);
    expect(withContext).toContain('You are AGI Workforce, an AI assistant.');
  });
});
