import 'server-only';

import { EXPLICIT_ARTIFACT_MARKER_FOR } from '@agiworkforce/artifacts';
import {
  getAutoRoutingProfileTiers,
  getDefaultAutoRoutingProfile,
  getDeveloperLabel,
  getModelMetadataById,
  getModelRegistryFacts,
  isAutoModeModelId,
  isValidIanaTimeZone,
  normalizeModelId,
  ROUTING_PROFILE_CHOICE_OPTIONS,
  type RoutingProfileChoice,
} from '@agiworkforce/types';
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';

import {
  CHAT_SYSTEM_PROMPT_ID,
  CHAT_SYSTEM_PROMPT_VERSIONS,
  chatSystemPromptSection,
  chatSystemPromptSections,
  type ChatSystemPromptSections,
} from '@/lib/prompts/chat-system-prompt';
import {
  assembleChatSystemPrompt,
  CODE_EXECUTION_TOOL_NAMES,
  TOOL_SECTION_PREFIX,
  type ChatTurnMemory,
} from '@/lib/prompts/chat-system-prompt-assembly';
import { resolvePrompt, type ResolvePromptOptions } from '@/lib/prompts/prompt-registry';
import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';
import { TEMPORARY_CHAT_RETENTION_DAYS } from '@/lib/server/temporary-files';
import { isFileSearchTool } from '@/lib/server/tools/file-search-tool';
import { isMemoryTool } from '@/lib/server/tools/memory-tools';

const TIME_CONTEXT_GRANULARITY_MS = 60_000;

function providerNativeCodeExecutionName(record: Record<string, unknown>): string | null {
  const type = record['type'];
  if (typeof type === 'string') {
    if (type === 'code_interpreter' || type.startsWith('code_interpreter_')) {
      return 'code_interpreter';
    }
    if (type === 'code_execution' || type.startsWith('code_execution_')) return 'code_execution';
  }
  const googleTool = record['code_execution'];
  if (googleTool && typeof googleTool === 'object') return 'code_execution';
  return null;
}

export function extractToolNames(tools: unknown[] | undefined): string[] {
  if (!Array.isArray(tools)) return [];
  const names: string[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') continue;
    const record = tool as Record<string, unknown>;

    const fn = record['function'];
    if (fn && typeof fn === 'object') {
      const name = (fn as Record<string, unknown>)['name'];
      if (typeof name === 'string' && name) {
        names.push(name);
        continue;
      }
    }

    const name = record['name'];
    if (typeof name === 'string' && name) {
      names.push(name);
      continue;
    }

    if (record['type'] === 'web_search' || record['type'] === 'web_search_2025_08_26') {
      names.push('web_search');
      continue;
    }
    if (record['google_search'] && typeof record['google_search'] === 'object') {
      names.push('web_search');
      continue;
    }
    const nativeCodeExecution = providerNativeCodeExecutionName(record);
    if (nativeCodeExecution) {
      names.push(nativeCodeExecution);
    }
  }
  return [...new Set(names)];
}

export type PreambleSurface = Exclude<CloudChatSurface, 'api'> | 'slack' | 'scheduled';

export type SettingsGuidance = 'web' | 'mobile' | 'account';

const SETTINGS_GUIDANCE: Readonly<Record<PreambleSurface, SettingsGuidance>> = {
  web: 'web',
  desktop: 'web',
  chrome: 'account',
  mobile: 'mobile',
  vscode: 'account',
  cli: 'account',
  unknown: 'account',
  slack: 'account',
  scheduled: 'account',
};

export function settingsGuidanceFor(surface: PreambleSurface): SettingsGuidance {
  return SETTINGS_GUIDANCE[surface];
}

export interface CapabilityPreambleInput {
  tools: unknown[] | undefined;
  surface?: PreambleSurface;
  timeZone?: string;
  now?: Date;
  /**
   * The user turned "Run code" on for this turn but no execution tool could be
   * attached for the routed model. Without this the turn runs identically to one
   * where the toggle was never touched, so the drop has to be disclosed.
   */
  codeExecutionUnavailable?: boolean;
  /**
   * The user turned Deep Research on, but the model this turn routed to cannot
   * do it, so the research loop never ran.
   *
   * Disclosed for the same reason `codeExecutionUnavailable` is: the toggle
   * stays lit in the UI, and without this the user receives an ordinary
   * single-turn answer that looks like a researched one. Silence here is the
   * difference between a degraded feature and a dishonest one.
   */
  researchUnavailable?: boolean;
  /**
   * Where this turn's attachments sit in the managed sandbox. Only the managed
   * `execute_code` tool runs in that sandbox, so a provider's own hosted
   * interpreter must never be told these paths: its container has never seen
   * the files.
   */
  attachmentSandboxPaths?: readonly string[];
  /** Absent when the caller does not know whether memory serves this turn. */
  memory?: ChatTurnMemory;
  /** The surface renders fenced artifacts, so the prompt may tell the model how to write one. */
  artifacts?: boolean;
  /** Send the window.agi runtime text; absent means sent. */
  artifactRuntime?: boolean;
  artifactConnectors?: boolean;
  /** Capability ids from the handshake for this plan and surface. */
  productCapabilities?: readonly string[];
  /** Selects the prompt version; absent, the manifest pin serves. */
  promptSelection?: ResolvePromptOptions;
  servingModel?: ServingModel | null;
  chatSetup?: ChatSetup;
}

export type ModelSelection =
  | {
      readonly kind: 'picked';
      readonly modelId: string;
      readonly routingProfile?: RoutingProfileChoice;
      readonly workspaceDefaultModelId?: string;
    }
  | { readonly kind: 'assigned' };

type ModelChoice =
  | { readonly kind: 'selected' }
  | { readonly kind: 'auto'; readonly label: string }
  | { readonly kind: 'workspace_default'; readonly label: string }
  | { readonly kind: 'substituted' }
  | { readonly kind: 'assigned' };

export type ServingModel =
  | {
      readonly kind: 'model';
      readonly name: string;
      readonly developer: string;
      readonly knowledgeCutoff: string | null;
      readonly choice: ModelChoice;
    }
  | { readonly kind: 'router'; readonly name: string; readonly developer: string }
  | { readonly kind: 'unattributed'; readonly name: string };

export interface ChatSetup {
  readonly savedChat: boolean;
  readonly temporaryChat: boolean;
  readonly memory: 'on' | 'off' | 'off_for_chat' | 'off_by_workspace' | 'unavailable';
  readonly pastChats: boolean;
  readonly project: 'none' | 'with_files' | 'without_files';
  readonly projectChats: boolean;
  readonly personalization: 'applied' | 'none' | 'off' | 'unavailable';
  readonly toolsSupported: boolean;
  readonly connectors: 'on' | 'off' | 'unavailable' | 'locked_down';
  readonly skills: 'on' | 'off' | 'none';
}

const KNOWLEDGE_CUTOFF = /^(\d{4})-(\d{2})(?:-\d{2})?$/u;

function formatKnowledgeCutoff(value: string | undefined): string | null {
  const match = value ? KNOWLEDGE_CUTOFF.exec(value) : null;
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(match[1]), month - 1, 1)));
}

function automaticSelectionLabel(
  modelId: string,
  routingProfile: RoutingProfileChoice | undefined,
): string | null {
  const umbrella = getDefaultAutoRoutingProfile();
  const profileOption =
    modelId === umbrella.id
      ? ROUTING_PROFILE_CHOICE_OPTIONS.find((option) => option.choice === routingProfile)
      : undefined;
  if (profileOption) return profileOption.label;
  if (isAutoModeModelId(modelId)) {
    return (
      [umbrella, ...getAutoRoutingProfileTiers()].find((profile) => profile.id === modelId)
        ?.label ?? umbrella.label
    );
  }
  if (getModelRegistryFacts(modelId)?.isRouter === true) {
    return getModelMetadataById(modelId)?.name ?? null;
  }
  return null;
}

function modelChoice(modelId: string, selection: ModelSelection): ModelChoice {
  if (selection.kind === 'assigned') return { kind: 'assigned' };
  const served = normalizeModelId(modelId);
  const automaticLabel = automaticSelectionLabel(selection.modelId, selection.routingProfile);
  if (selection.workspaceDefaultModelId !== undefined) {
    return automaticLabel && normalizeModelId(selection.workspaceDefaultModelId) === served
      ? { kind: 'workspace_default', label: automaticLabel }
      : { kind: 'substituted' };
  }
  if (normalizeModelId(selection.modelId) === served) return { kind: 'selected' };
  return automaticLabel ? { kind: 'auto', label: automaticLabel } : { kind: 'substituted' };
}

export function servingModelFor(modelId: string, selection: ModelSelection): ServingModel | null {
  const metadata = getModelMetadataById(modelId);
  if (!metadata) return null;
  const developer = getDeveloperLabel(metadata.developer);
  if (getModelRegistryFacts(modelId)?.isRouter === true) {
    return { kind: 'router', name: metadata.name, developer };
  }
  return {
    kind: 'model',
    name: metadata.name,
    developer,
    knowledgeCutoff: formatKnowledgeCutoff(metadata.knowledgeCutoff),
    choice: modelChoice(modelId, selection),
  };
}

function roundDownToGranularity(instant: Date, granularityMs: number): Date {
  return new Date(Math.floor(instant.getTime() / granularityMs) * granularityMs);
}

function formatLocalInstant(now: Date, timeZone: string | undefined): string | null {
  if (!timeZone || !isValidIanaTimeZone(timeZone)) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = read('year');
  const month = read('month');
  const day = read('day');
  const hour = read('hour');
  const minute = read('minute');
  const second = read('second');
  if (!year || !month || !day || !hour || !minute || !second) return null;
  return `${year}-${month}-${day} ${hour}:${minute}:${second} (${timeZone})`;
}

/**
 * The chat system prompt this turn serves, resolved through the manifest so the
 * version is stamped rather than implied by whatever the builder holds.
 */
export function resolveChatSystemPrompt(options: ResolvePromptOptions = {}): {
  version: number;
  stamp: string;
  sections: ChatSystemPromptSections;
} {
  const resolved = resolvePrompt(CHAT_SYSTEM_PROMPT_ID, options);
  return {
    version: resolved.version,
    stamp: resolved.stamp,
    sections: chatSystemPromptSections(resolved.version),
  };
}

export function chatSystemPromptDescribesSetup(options: ResolvePromptOptions = {}): boolean {
  return resolveChatSystemPrompt(options).sections['setup_heading'] !== undefined;
}

export function capabilityPreambleStamp(options: ResolvePromptOptions = {}): string {
  return resolvePrompt(CHAT_SYSTEM_PROMPT_ID, options).stamp;
}

function buildPublishedCapabilityPreamble(input: CapabilityPreambleInput): string | null {
  const { sections } = resolveChatSystemPrompt(input.promptSelection ?? {});
  const now = roundDownToGranularity(input.now ?? new Date(), TIME_CONTEXT_GRANULARITY_MS);
  const { body, time } = assembleChatSystemPrompt(
    sections,
    {
      toolNames: extractToolNames(input.tools),
      ...(input.codeExecutionUnavailable ? { codeExecutionUnavailable: true } : {}),
      ...(input.researchUnavailable ? { researchUnavailable: true } : {}),
      ...(input.attachmentSandboxPaths
        ? { attachmentSandboxPaths: input.attachmentSandboxPaths }
        : {}),
      ...(input.memory ? { memory: input.memory } : {}),
      ...(input.artifacts
        ? {
            artifactMarkers: {
              html: EXPLICIT_ARTIFACT_MARKER_FOR.html,
              react: EXPLICIT_ARTIFACT_MARKER_FOR.react,
              mermaid: EXPLICIT_ARTIFACT_MARKER_FOR.mermaid,
            },
          }
        : {}),
      ...(input.artifactRuntime === false ? { artifactRuntime: false } : {}),
      ...(input.artifactConnectors ? { artifactConnectors: true } : {}),
      ...(input.productCapabilities ? { productCapabilities: input.productCapabilities } : {}),
    },
    {
      utc: now.toISOString(),
      ...(input.timeZone ? { timeZone: input.timeZone } : {}),
      localInstant: formatLocalInstant(now, input.timeZone),
    },
  );
  return `${body}${SYSTEM_PROMPT_CACHE_BOUNDARY}${time}`;
}

function describeTool(sections: ChatSystemPromptSections, name: string): string {
  const description = chatSystemPromptSection(sections, `${TOOL_SECTION_PREFIX}${name}`);
  return description ? `- ${name}, ${description}` : `- ${name}`;
}

type SectionReader = (key: string, values?: Readonly<Record<string, string>>) => string;

function servingModelBlocks(section: SectionReader, model: ServingModel | null): string[] {
  if (!model) return [section('model_unknown')];
  if (model.kind === 'unattributed') {
    const values = { modelName: model.name };
    return [section('model_unattributed', values), section('model_rules_unattributed', values)];
  }
  if (model.kind === 'router') {
    const values = { modelName: model.name, modelDeveloper: model.developer };
    return [section('model_router', values), section('model_rules_router', values)];
  }
  const values = {
    modelName: model.name,
    modelDeveloper: model.developer,
    knowledgeCutoff: model.knowledgeCutoff ?? '',
    ...('label' in model.choice ? { autoLabel: model.choice.label } : {}),
  };
  const serving = [
    section(`model_${model.choice.kind}`, values),
    model.knowledgeCutoff ? section('model_knowledge_cutoff', values) : '',
  ]
    .filter((text) => text.length > 0)
    .join(' ');
  return [serving, section('model_rules', values)];
}

export function retargetServingModel<T extends { role: string; content: unknown }>(
  messages: readonly T[],
  from: ServingModel | null,
  to: ServingModel | null,
): T[] {
  const replacements = CHAT_SYSTEM_PROMPT_VERSIONS.flatMap(({ sections }) => {
    const section: SectionReader = (key, values) => chatSystemPromptSection(sections, key, values);
    const render = (model: ServingModel | null) =>
      servingModelBlocks(section, model)
        .filter((block) => block.length > 0)
        .join('\n\n');
    const before = render(from);
    const after = render(to);
    return before.length > 0 && before !== after ? [[before, after] as const] : [];
  });
  if (replacements.length === 0) return [...messages];
  return messages.map((message) =>
    message.role === 'system' && typeof message.content === 'string'
      ? {
          ...message,
          content: replacements.reduce(
            (text, [before, after]) => text.replace(before, () => after),
            message.content,
          ),
        }
      : message,
  );
}

function chatSetupLines(
  section: SectionReader,
  setup: ChatSetup,
  toolNames: readonly string[],
): string[] {
  const lines: string[] = [];
  const outsideProject = (key: string): string =>
    (setup.projectChats ? section(`${key}_in_project`) : '') || section(key);
  if (setup.temporaryChat) {
    lines.push(
      section('chat_temporary', {
        temporaryChatRetentionDays: String(TEMPORARY_CHAT_RETENTION_DAYS),
      }),
    );
  } else {
    if (setup.savedChat) lines.push(section('chat_saved'));
    if (setup.memory !== 'on' && setup.memory !== 'off') {
      lines.push(outsideProject(`memory_${setup.memory}`));
    } else {
      lines.push(section(setup.memory === 'on' ? 'memory_on' : 'memory_off'));
      if (setup.memory === 'on' && toolNames.some(isMemoryTool)) {
        lines.push(section('memory_tools'));
      }
      lines.push(setup.pastChats ? section('past_chats_on') : outsideProject('past_chats_off'));
    }
  }

  if (setup.project === 'with_files') {
    lines.push(section('project_with_files'));
    if (toolNames.some(isFileSearchTool)) lines.push(section('project_file_tools'));
  } else {
    lines.push(section(setup.project === 'none' ? 'no_project' : 'project_without_files'));
  }
  if (setup.projectChats) lines.push(section('project_chats'));

  lines.push(section(`personalization_${setup.personalization}`));

  if (!setup.toolsSupported) {
    lines.push(section('tools_unsupported'));
  } else {
    lines.push(section(`connectors_${setup.connectors}`) || section('connectors_off'));
    if (setup.connectors === 'on' && setup.temporaryChat) {
      lines.push(section('connectors_temporary'));
    }
    if (setup.skills !== 'none') {
      lines.push(section(setup.skills === 'on' ? 'skills_on' : 'skills_off'));
    }
  }
  return lines;
}

function chatSetupBlock(
  section: SectionReader,
  setup: ChatSetup | undefined,
  toolNames: readonly string[],
): string {
  const heading = section('setup_heading');
  if (!setup || heading.length === 0) return '';
  const lines = chatSetupLines(section, setup, toolNames).filter((line) => line.length > 0);
  return lines.length > 0 ? [heading, ...lines].join('\n') : '';
}

function sectionReaderFor(selection: ResolvePromptOptions | undefined): {
  sections: ChatSystemPromptSections;
  section: SectionReader;
} {
  const { sections } = resolveChatSystemPrompt(selection ?? {});
  return {
    sections,
    section: (key, values) => chatSystemPromptSection(sections, key, values),
  };
}

function timeContextFor(
  section: SectionReader,
  instant: Date,
  timeZone: string | undefined,
): string {
  const now = roundDownToGranularity(instant, TIME_CONTEXT_GRANULARITY_MS);
  const browserLocalInstant = formatLocalInstant(now, timeZone);
  return (
    section('time_utc', { utc: now.toISOString() }) +
    (browserLocalInstant
      ? section('time_local', { timeZone: timeZone ?? '', localInstant: browserLocalInstant })
      : '') +
    section('time_rules')
  );
}

function identityBlocks(section: SectionReader, servingModel: ServingModel | null): string[] {
  return [
    section('identity'),
    section('identity_rules'),
    ...servingModelBlocks(section, servingModel),
  ];
}

function joinBlocks(blocks: readonly string[], timeContext: string): string {
  const body = blocks.filter((block) => block.length > 0).join('\n\n');
  return `${body}${SYSTEM_PROMPT_CACHE_BOUNDARY}${timeContext}`;
}

export function buildCapabilityPreamble(input: CapabilityPreambleInput): string | null {
  const { sections, section } = sectionReaderFor(input.promptSelection);
  if (!sections['setup_heading']) return buildPublishedCapabilityPreamble(input);

  const toolNames = extractToolNames(input.tools);
  const hasSearch = toolNames.includes('web_search');
  const hasFetch = toolNames.includes('web_fetch') || toolNames.includes('url_fetch');
  const hasFileCreation = toolNames.some((name) =>
    ['execute_code', 'write_file', 'create_folder', 'create_office_file'].includes(name),
  );
  const hasCodeExecution =
    !input.codeExecutionUnavailable &&
    toolNames.some((name) => CODE_EXECUTION_TOOL_NAMES.includes(name));
  const stagedAttachmentPaths =
    !input.codeExecutionUnavailable && toolNames.includes('execute_code')
      ? (input.attachmentSandboxPaths ?? [])
      : [];

  const blocks: string[] = [
    ...identityBlocks(section, input.servingModel ?? null),
    section('instruction_precedence'),
  ];

  if (toolNames.length > 0) {
    blocks.push(
      [section('tools_heading'), ...toolNames.map((name) => describeTool(sections, name))].join(
        '\n',
      ),
      section('tools_reality'),
    );

    if (hasSearch) blocks.push(section('search'));
    if (hasSearch || hasFetch) blocks.push(section('citations'));
    if (hasCodeExecution) blocks.push(section('code_execution'));

    if (stagedAttachmentPaths.length > 0) {
      blocks.push(
        [
          section('staged_attachments_heading'),
          stagedAttachmentPaths.map((path) => `- ${path}`).join('\n'),
          section('staged_attachments_rules'),
        ].join('\n'),
      );
    }

    if (hasFileCreation) blocks.push(section('file_creation'));
  } else {
    blocks.push(section('no_tools'));
  }

  const guidance = settingsGuidanceFor(input.surface ?? 'unknown');
  blocks.push(
    chatSetupBlock(section, input.chatSetup, toolNames),
    section(`settings_help_${guidance}`),
    section(`account_help_${guidance}`),
    section('disclosure'),
    section('response_language'),
    section('artifact_runtime'),
  );

  if (input.codeExecutionUnavailable) blocks.push(section('code_execution_unavailable'));
  if (input.researchUnavailable) blocks.push(section('research_unavailable'));

  return joinBlocks(blocks, timeContextFor(section, input.now ?? new Date(), input.timeZone));
}

export type TextOnlyChatSetup = (
  | { readonly temporaryChat: boolean; readonly personalContext: 'not_used' }
  | {
      readonly temporaryChat: boolean;
      readonly personalContext: 'read_only' | 'memory_off_for_chat' | 'off_for_chat';
      readonly inProject: boolean;
    }
) & { readonly projectContext?: 'with_files' | 'without_files' };

export interface TextOnlyPreambleInput {
  servingModel?: ServingModel | null;
  artifacts?: boolean;
  promptSelection?: ResolvePromptOptions;
  timeZone?: string;
  now?: Date;
  setup?: TextOnlyChatSetup;
}

function textOnlySetupLines(section: SectionReader, setup: TextOnlyChatSetup): string[] {
  const lines: string[] = [];
  if (setup.temporaryChat) {
    lines.push(
      section('chat_temporary', {
        temporaryChatRetentionDays: String(TEMPORARY_CHAT_RETENTION_DAYS),
      }),
    );
  }
  if (setup.personalContext === 'not_used') {
    if (setup.projectContext) {
      lines.push(section('memory_off'), section('past_chats_off'), section('personalization_off'));
    } else {
      lines.push(section('personal_context_not_used'));
    }
  } else {
    if (setup.personalContext === 'off_for_chat') lines.push(section('personalization_off'));
    if (!setup.temporaryChat) {
      lines.push(
        section(setup.personalContext === 'read_only' ? 'memory_read_only' : 'memory_off_for_chat'),
      );
    }
    if (setup.inProject && !setup.projectContext) lines.push(section('project_not_used'));
  }
  if (setup.projectContext) lines.push(section(`project_${setup.projectContext}`));
  lines.push(section('apps_not_used'));
  return lines;
}

function textOnlySetupBlock(section: SectionReader, setup: TextOnlyChatSetup | undefined): string {
  const heading = section('setup_heading');
  if (!setup || heading.length === 0) return '';
  const lines = textOnlySetupLines(section, setup).filter((line) => line.length > 0);
  return lines.length > 0 ? [heading, ...lines].join('\n') : '';
}

export function buildTextOnlyPreamble(input: TextOnlyPreambleInput): string {
  const { sections, section } = sectionReaderFor(input.promptSelection);
  if (!sections['setup_heading']) {
    return (
      buildPublishedCapabilityPreamble({
        tools: [],
        ...(input.promptSelection ? { promptSelection: input.promptSelection } : {}),
        ...(input.timeZone ? { timeZone: input.timeZone } : {}),
        ...(input.now ? { now: input.now } : {}),
        ...(input.artifacts ? { artifacts: true } : {}),
        artifactRuntime: false,
        memory: input.setup?.personalContext === 'read_only' ? 'on' : 'off',
      }) ?? ''
    );
  }
  return joinBlocks(
    [
      ...identityBlocks(section, input.servingModel ?? null),
      section('no_tools'),
      textOnlySetupBlock(section, input.setup),
      section('disclosure'),
      section('response_language'),
    ],
    timeContextFor(section, input.now ?? new Date(), input.timeZone),
  );
}
