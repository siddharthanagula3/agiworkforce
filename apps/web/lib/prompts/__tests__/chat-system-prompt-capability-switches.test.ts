import { describe, expect, it } from 'vitest';

import {
  CHAT_SYSTEM_PROMPT_PINNED_VERSION,
  CHAT_SYSTEM_PROMPT_VERSIONS,
  chatSystemPromptSection,
  chatSystemPromptSections,
} from '../chat-system-prompt';
import {
  assembleChatSystemPrompt,
  type ChatCapabilityPreferences,
  type ChatTurnState,
} from '../chat-system-prompt-assembly';

const CLOCK = { utc: '2026-11-16T12:00:00.000Z' };
const MARKERS = { html: '<!-- @artifact -->', react: '// @artifact', mermaid: '%% @artifact' };
const SWITCHES_VERSION = 17;
const sections = chatSystemPromptSections(SWITCHES_VERSION);
const text = (key: string) => chatSystemPromptSection(sections, key);

const ALL_ON: ChatCapabilityPreferences = {
  artifacts: true,
  inlineVisualizations: true,
  cloudCodeExecution: true,
};
const ARTIFACTS_OFF: ChatCapabilityPreferences = {
  artifacts: false,
  inlineVisualizations: true,
  cloudCodeExecution: false,
};
const VISUALS_OFF: ChatCapabilityPreferences = {
  artifacts: true,
  inlineVisualizations: false,
  cloudCodeExecution: true,
};

const WEB_TURN: ChatTurnState = {
  toolNames: ['web_search'],
  artifactMarkers: MARKERS,
  richInlineBlocks: true,
  artifactApps: true,
  artifactConnectors: true,
  productCapabilities: ['web_search'],
};

function body(
  state: ChatTurnState,
  preferences?: ChatCapabilityPreferences,
  version = SWITCHES_VERSION,
): string {
  return assembleChatSystemPrompt(
    chatSystemPromptSections(version),
    preferences ? { ...state, capabilityPreferences: preferences } : state,
    CLOCK,
  ).body;
}

describe('the Artifacts and Inline visualizations switches in the chat system prompt', () => {
  it('renders every version exactly as before while both switches are on', () => {
    for (const { version } of CHAT_SYSTEM_PROMPT_VERSIONS) {
      expect(body(WEB_TURN, ALL_ON, version), `chat.system@${version}`).toBe(
        body(WEB_TURN, undefined, version),
      );
    }
  });

  it('leaves out the artifact instructions, markers and runtime when artifacts are off', () => {
    const prompt = body(WEB_TURN, ARTIFACTS_OFF);

    expect(prompt).not.toContain(MARKERS.html);
    expect(prompt).not.toContain(MARKERS.react);
    expect(prompt).not.toContain(MARKERS.mermaid);
    expect(prompt).not.toContain(text('product_capability.artifacts'));
    expect(prompt).not.toContain(text('artifact_apps'));
    expect(prompt).not.toContain(text('artifact_apps_connectors'));
    expect(prompt).not.toContain(text('inline_blocks'));
    expect(prompt).toContain(text('inline_blocks_without_artifacts'));
    expect(text('inline_blocks_without_artifacts')).not.toContain('artifact');
    expect(prompt).toContain(text('artifacts_off'));
    expect(prompt).toContain('- chart:');
    expect(prompt).toContain('- mermaid:');
  });

  it('keeps artifacts while code execution is on, whatever the Artifacts switch says', () => {
    expect(body(WEB_TURN, { ...ARTIFACTS_OFF, cloudCodeExecution: true })).toBe(
      body(WEB_TURN, ALL_ON),
    );
  });

  it('leaves out the chart, mermaid and cards guidance when inline visualizations are off', () => {
    const prompt = body(WEB_TURN, VISUALS_OFF);
    const guidance = text('inline_blocks_without_visualizations');

    expect(prompt).toContain(guidance);
    expect(prompt).not.toContain(text('inline_blocks'));
    for (const fence of ['- chart:', '- mermaid:', '- cards:']) {
      expect(guidance).not.toContain(fence);
    }
    expect(guidance).toContain('- card:');
    expect(guidance).toContain('- checklist:');
    expect(prompt).toContain(text('inline_visualizations_off'));
    expect(prompt).toContain(MARKERS.html);
    expect(prompt).not.toContain(text('artifacts_off'));
  });

  it('leaves out both when both switches are off', () => {
    const prompt = body(WEB_TURN, { ...ARTIFACTS_OFF, inlineVisualizations: false });
    const guidance = text('inline_blocks_without_artifacts_or_visualizations');

    expect(prompt).toContain(guidance);
    expect(guidance).not.toContain('- chart:');
    expect(guidance).not.toContain('artifact');
    expect(prompt).not.toContain(MARKERS.html);
    expect(prompt).toContain(text('artifacts_off'));
    expect(prompt).toContain(text('inline_visualizations_off'));
  });

  it('stops pointing a surface without rich inline controls at artifacts when they are off', () => {
    const phoneTurn: ChatTurnState = { ...WEB_TURN, richInlineBlocks: false, artifactApps: false };

    const prompt = body(phoneTurn, ARTIFACTS_OFF);

    expect(prompt).toContain(text('inline_blocks_unavailable_without_artifacts'));
    expect(prompt).not.toContain(text('inline_blocks_unavailable'));
    expect(body(phoneTurn, VISUALS_OFF)).toContain(text('inline_visualizations_off'));
  });

  it('says nothing about turning artifacts on to a turn that never offered them', () => {
    const plainTurn: ChatTurnState = { toolNames: ['web_search'], artifactRuntime: false };

    const prompt = body(plainTurn, ARTIFACTS_OFF);

    expect(text('artifacts_off').length).toBeGreaterThan(0);
    expect(prompt).not.toContain(text('artifacts_off'));
    expect(prompt).toBe(body(plainTurn, ALL_ON));
    expect(body({ ...plainTurn, artifactApps: true }, ARTIFACTS_OFF)).toContain(
      text('artifacts_off'),
    );
  });

  it('drops the artifact runtime from the pinned version when artifacts are off', () => {
    const pinned = chatSystemPromptSections(CHAT_SYSTEM_PROMPT_PINNED_VERSION);
    const runtime = chatSystemPromptSection(pinned, 'artifact_runtime');
    const turn: ChatTurnState = { toolNames: [], artifactMarkers: MARKERS };

    expect(runtime.length).toBeGreaterThan(0);
    expect(body(turn, ALL_ON, CHAT_SYSTEM_PROMPT_PINNED_VERSION)).toContain(runtime);
    expect(body(turn, ARTIFACTS_OFF, CHAT_SYSTEM_PROMPT_PINNED_VERSION)).not.toContain(runtime);
  });

  it('keeps every section of the version before it unchanged', () => {
    const previous = chatSystemPromptSections(SWITCHES_VERSION - 1);
    for (const [key, value] of Object.entries(previous)) {
      expect(sections[key], key).toBe(value);
    }
  });
});
