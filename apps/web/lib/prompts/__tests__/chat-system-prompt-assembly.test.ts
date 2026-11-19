import { describe, expect, it } from 'vitest';

import { rendersThroughSetupComposer } from '@/app/api/llm/v1/chat/completions/lib/capability-preamble';

import { chatSystemPromptSection, chatSystemPromptSections } from '../chat-system-prompt';
import {
  assembleChatSystemPrompt,
  type ChatSetup,
  type ChatTurnState,
} from '../chat-system-prompt-assembly';

const CLOCK = { utc: '2026-10-15T12:00:00.000Z' };
const NO_SETUP_TOOLS = { memoryTools: false, fileSearchTools: false };
const RETENTION_DAYS = 30;

const SAVED_CHAT: ChatSetup = {
  savedChat: true,
  temporaryChat: false,
  memory: 'on',
  pastChats: true,
  project: 'none',
  projectChats: false,
  personalization: 'none',
  toolsSupported: true,
  connectors: 'off',
  skills: 'none',
};

const v7 = chatSystemPromptSections(7);
const v10 = chatSystemPromptSections(10);

/** A version holding the v7 sections and the setup, identity and model sections of v10. */
const merged = {
  ...v7,
  ...Object.fromEntries(Object.entries(v10).filter(([key]) => v7[key] === undefined)),
  identity: v10['identity'] ?? '',
  memory_on: v10['memory_on'] ?? '',
  memory_off: v10['memory_off'] ?? '',
};

const CARRIED_STATE: Partial<ChatTurnState> = {
  servingModel: { kind: 'unattributed', name: 'Test Model' },
  setup: { chat: SAVED_CHAT, tools: NO_SETUP_TOOLS, temporaryChatRetentionDays: RETENTION_DAYS },
  settingsGuidance: 'web',
};

function body(sections: Readonly<Record<string, string>>, state: Partial<ChatTurnState> = {}) {
  return assembleChatSystemPrompt(sections, { toolNames: [], ...state }, CLOCK).body;
}

describe('the published assembler with a version that also holds a setup block', () => {
  it('renders the identity rules, the serving model, the setup and the Settings guidance', () => {
    const rendered = body(merged, { memory: 'on', ...CARRIED_STATE });

    expect(rendered).toContain(chatSystemPromptSection(v10, 'identity_rules'));
    expect(rendered).toContain('This turn runs on Test Model.');
    expect(rendered).toContain(
      `${chatSystemPromptSection(v10, 'setup_heading')}\n${chatSystemPromptSection(v10, 'chat_saved')}`,
    );
    expect(rendered).toContain(chatSystemPromptSection(v10, 'past_chats_on'));
    expect(rendered).toContain(chatSystemPromptSection(v10, 'settings_help_web'));
    expect(rendered).toContain(chatSystemPromptSection(v10, 'account_help_web'));
    expect(rendered).toContain(chatSystemPromptSection(v10, 'disclosure'));
    expect(rendered).toContain(chatSystemPromptSection(v10, 'response_language'));
  });

  it('keeps the sections the published versions added beside the setup block', () => {
    const rendered = body(merged, { memory: 'on', ...CARRIED_STATE });

    for (const key of [
      'untrusted_content',
      'capability_honesty',
      'user_documents',
      'people_and_privacy',
      'refusal_style',
      'format_and_length',
    ]) {
      expect(rendered, key).toContain(chatSystemPromptSection(v7, key));
    }
    expect(rendered.indexOf(chatSystemPromptSection(v10, 'identity_rules'))).toBeLessThan(
      rendered.indexOf(chatSystemPromptSection(v7, 'instruction_precedence')),
    );
  });

  it('describes memory once, as a setup line, never also as the published memory paragraph', () => {
    const rendered = body(merged, { memory: 'on', ...CARRIED_STATE });

    expect(rendered).toContain(chatSystemPromptSection(v10, 'memory_on'));
    expect(rendered).not.toContain(chatSystemPromptSection(v7, 'memory_on'));
    expect(body(merged, { memory: 'off' })).not.toContain(
      chatSystemPromptSection(v10, 'memory_off'),
    );
  });

  it('renders the text-only setup lines when the caller gives a text-only setup', () => {
    const rendered = body(merged, {
      servingModel: null,
      setup: {
        textOnly: { temporaryChat: false, personalContext: 'read_only', inProject: false },
        temporaryChatRetentionDays: RETENTION_DAYS,
      },
    });

    expect(rendered).toContain(chatSystemPromptSection(v10, 'memory_read_only'));
    expect(rendered).toContain(chatSystemPromptSection(v10, 'apps_not_used'));
    expect(rendered).toContain(chatSystemPromptSection(v10, 'model_unknown'));
    expect(rendered).not.toContain(chatSystemPromptSection(v10, 'settings_help_web'));
  });

  it('renders a version without those sections exactly as it did', () => {
    for (const version of [1, 5, 6, 7]) {
      const sections = chatSystemPromptSections(version);
      expect(body(sections, { memory: 'on', ...CARRIED_STATE }), `v${version}`).toBe(
        body(sections, { memory: 'on' }),
      );
    }
  });
});

describe('which composer renders a version', () => {
  it('keeps versions 8 to 10, written on version 4, on the setup composer', () => {
    for (const version of [8, 9, 10]) {
      expect(rendersThroughSetupComposer(chatSystemPromptSections(version)), `v${version}`).toBe(
        true,
      );
    }
  });

  it('renders the published versions, and one that adds a setup block to them, as published', () => {
    for (const version of [1, 6, 7]) {
      expect(rendersThroughSetupComposer(chatSystemPromptSections(version)), `v${version}`).toBe(
        false,
      );
    }
    expect(rendersThroughSetupComposer(merged)).toBe(false);
  });
});

describe('the sources a version says the client links under the answer', () => {
  const withLinks = {
    ...merged,
    source_links_heading: 'LINKS HEADING',
    'source_link.memory': '- MEMORY LINK',
    'source_link.past_chats': '- PAST CHAT LINK',
    'source_link.project_files': '- PROJECT FILE LINK',
    source_links_rules: 'LINK RULES',
  };
  const chat = (overrides: Partial<ChatSetup> = {}) => ({
    chat: { ...SAVED_CHAT, ...overrides },
    tools: NO_SETUP_TOOLS,
    temporaryChatRetentionDays: RETENTION_DAYS,
  });

  it('lists each source the setup lets reach the turn, after the setup block', () => {
    const rendered = body(withLinks, { setup: chat({ project: 'with_files' }), sourceLinks: true });

    expect(rendered).toContain(
      'LINKS HEADING\n- MEMORY LINK\n- PAST CHAT LINK\n- PROJECT FILE LINK\n\nLINK RULES',
    );
    expect(rendered.indexOf('LINKS HEADING')).toBeGreaterThan(
      rendered.indexOf(chatSystemPromptSection(v10, 'setup_heading')),
    );
  });

  it('lists only the sources that can reach the turn', () => {
    expect(
      body(withLinks, { setup: chat({ memory: 'off', pastChats: false }), sourceLinks: true }),
    ).not.toContain('LINKS HEADING');
    expect(
      body(withLinks, {
        setup: chat({ memory: 'unavailable', pastChats: false, project: 'with_files' }),
        sourceLinks: true,
      }),
    ).toContain('LINKS HEADING\n- PROJECT FILE LINK\n\nLINK RULES');
    const temporary = body(withLinks, {
      setup: chat({ temporaryChat: true, savedChat: false }),
      sourceLinks: true,
    });
    expect(temporary).not.toContain('MEMORY LINK');
    expect(temporary).not.toContain('PAST CHAT LINK');
  });

  it('promises no link where the client draws none', () => {
    expect(body(withLinks, { setup: chat({ project: 'with_files' }) })).not.toContain(
      'LINKS HEADING',
    );
    expect(
      body(withLinks, {
        setup: {
          textOnly: { temporaryChat: false, personalContext: 'read_only', inProject: false },
          temporaryChatRetentionDays: RETENTION_DAYS,
        },
        sourceLinks: true,
      }),
    ).not.toContain('LINKS HEADING');
  });
});

describe('the email and writing cards a version describes', () => {
  const withCards = { ...merged, email_and_writing_cards: 'CARD RULES' };

  it('tells the model about the cards only where the client renders them', () => {
    expect(body(withCards, { writingCards: true })).toContain('CARD RULES');
    expect(body(withCards, {})).not.toContain('CARD RULES');
    expect(body(withCards, { writingCards: false })).not.toContain('CARD RULES');
  });

  it('places them after the format rules', () => {
    const rendered = body(withCards, { writingCards: true });

    expect(rendered.indexOf('CARD RULES')).toBeGreaterThan(
      rendered.indexOf(chatSystemPromptSection(v7, 'format_and_length')),
    );
  });
});

describe('the artifact app runtime a version describes', () => {
  const withApps = {
    ...merged,
    artifact_apps: 'APP RUNTIME',
    artifact_apps_connectors: 'APP CONNECTORS',
  };

  it('describes the runtime only where the client publishes artifacts as hosted apps', () => {
    expect(body(withApps, { artifactApps: true })).toContain('APP RUNTIME');
    expect(body(withApps, {})).not.toContain('APP RUNTIME');
    expect(body(withApps, { artifactConnectors: true })).not.toContain('APP CONNECTORS');
  });

  it('adds the connected apps option only where connectors are released for the plan', () => {
    expect(body(withApps, { artifactApps: true })).not.toContain('APP CONNECTORS');
    expect(body(withApps, { artifactApps: true, artifactConnectors: true })).toContain(
      'APP RUNTIME\n\nAPP CONNECTORS',
    );
  });
});
