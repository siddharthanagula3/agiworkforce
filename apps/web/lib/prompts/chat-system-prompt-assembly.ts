import { chatSystemPromptSection, type ChatSystemPromptSections } from './chat-system-prompt';

/**
 * Which sections of a chat system prompt version a turn carries, decided from
 * the turn's state alone.
 *
 * Kept free of imports beyond the template so the eval harness, which cannot
 * resolve workspace packages or path aliases, renders exactly the text the chat
 * route sends. A section a version does not hold renders empty and drops out,
 * so earlier versions render byte for byte as they did before later sections
 * existed.
 */

export const TOOL_SECTION_PREFIX = 'tool.';

const CAPABILITY_SECTION_PREFIX = 'product_capability.';

const SOURCE_LINK_SECTION_PREFIX = 'source_link.';

const ARTIFACTS_CAPABILITY = 'artifacts';

export const CODE_EXECUTION_TOOL_NAMES = ['execute_code', 'code_execution', 'code_interpreter'];

const FILE_CREATION_TOOL_NAMES = [
  'execute_code',
  'write_file',
  'create_folder',
  'create_office_file',
];

/**
 * `unavailable` is a memory that could not be read for this turn. It is neither
 * on nor off, so it renders no memory line rather than either of them.
 */
export type ChatTurnMemory = 'on' | 'off' | 'unavailable';

export interface ArtifactMarkers {
  readonly html: string;
  readonly react: string;
  readonly mermaid: string;
}

export interface ChatTurnState {
  readonly toolNames: readonly string[];
  readonly includeToolInventory?: boolean;
  readonly codeExecutionUnavailable?: boolean;
  readonly researchUnavailable?: boolean;
  readonly attachmentSandboxPaths?: readonly string[];
  /** Absent when the caller does not know the turn's memory state. */
  readonly memory?: ChatTurnMemory;
  /** Present when the surface renders artifacts, so the prompt can name their markers. */
  readonly artifactMarkers?: ArtifactMarkers;
  readonly richInlineBlocks?: boolean;
  /** The window.agi runtime text; absent means sent, as every version before 7 assumed. */
  readonly artifactRuntime?: boolean;
  readonly artifactConnectors?: boolean;
  /** Capability ids the plan and surface grant; absent when the caller does not know them. */
  readonly productCapabilities?: readonly string[];
  /** The model serving the turn, for versions that state it; null when it is not known. */
  readonly servingModel?: ServingModel | null;
  /** This chat's setup, for versions with a setup block; absent when the caller has none. */
  readonly setup?: ChatTurnSetup;
  /** Whose Settings to point the user to, for versions that do. */
  readonly settingsGuidance?: SettingsGuidance;
  /** The client links the saved memories, past chats and project files a turn supplies under the answer. */
  readonly sourceLinks?: boolean;
  /** The client renders a fenced email or writing block as a card. */
  readonly writingCards?: boolean;
  /** The client publishes artifacts as hosted pages, where the artifact app runtime runs. */
  readonly artifactApps?: boolean;
}

export interface ChatTurnClock {
  readonly utc: string;
  readonly timeZone?: string;
  readonly localInstant?: string | null;
}

export type ModelChoice =
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

export type TextOnlyChatSetup = (
  | { readonly temporaryChat: boolean; readonly personalContext: 'not_used' }
  | {
      readonly temporaryChat: boolean;
      readonly personalContext: 'read_only' | 'memory_off_for_chat' | 'off_for_chat';
      readonly inProject: boolean;
    }
) & { readonly projectContext?: 'with_files' | 'without_files' };

export type SettingsGuidance = 'web' | 'mobile' | 'account';

/** Which tools the chat setup lines may point the model to. */
export interface ChatSetupTools {
  readonly memoryTools: boolean;
  readonly fileSearchTools: boolean;
}

export type ChatTurnSetup =
  | {
      readonly chat: ChatSetup;
      readonly tools: ChatSetupTools;
      readonly temporaryChatRetentionDays: number;
    }
  | { readonly textOnly: TextOnlyChatSetup; readonly temporaryChatRetentionDays: number };

export type SectionReader = (key: string, values?: Readonly<Record<string, string>>) => string;

const KNOWLEDGE_CUTOFF = /^(\d{4})-(\d{2})(?:-\d{2})?$/u;

export function formatKnowledgeCutoff(value: string | undefined): string | null {
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

export function servingModelBlocks(section: SectionReader, model: ServingModel | null): string[] {
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

function chatSetupLines(
  section: SectionReader,
  setup: ChatSetup,
  tools: ChatSetupTools,
  temporaryChatRetentionDays: number,
): string[] {
  const lines: string[] = [];
  const outsideProject = (key: string): string =>
    (setup.projectChats ? section(`${key}_in_project`) : '') || section(key);
  if (setup.temporaryChat) {
    lines.push(
      section('chat_temporary', {
        temporaryChatRetentionDays: String(temporaryChatRetentionDays),
      }),
    );
  } else {
    if (setup.savedChat) lines.push(section('chat_saved'));
    if (setup.memory !== 'on' && setup.memory !== 'off') {
      lines.push(outsideProject(`memory_${setup.memory}`));
    } else {
      lines.push(section(setup.memory === 'on' ? 'memory_on' : 'memory_off'));
      if (setup.memory === 'on' && tools.memoryTools) {
        lines.push(section('memory_tools'));
      }
      lines.push(setup.pastChats ? section('past_chats_on') : outsideProject('past_chats_off'));
    }
  }

  if (setup.project === 'with_files') {
    lines.push(section('project_with_files'));
    if (tools.fileSearchTools) lines.push(section('project_file_tools'));
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

export function chatSetupBlock(
  section: SectionReader,
  setup: ChatSetup | undefined,
  tools: ChatSetupTools,
  temporaryChatRetentionDays: number,
): string {
  const heading = section('setup_heading');
  if (!setup || heading.length === 0) return '';
  const lines = chatSetupLines(section, setup, tools, temporaryChatRetentionDays).filter(
    (line) => line.length > 0,
  );
  return lines.length > 0 ? [heading, ...lines].join('\n') : '';
}

function textOnlySetupLines(
  section: SectionReader,
  setup: TextOnlyChatSetup,
  temporaryChatRetentionDays: number,
): string[] {
  const lines: string[] = [];
  if (setup.temporaryChat) {
    lines.push(
      section('chat_temporary', {
        temporaryChatRetentionDays: String(temporaryChatRetentionDays),
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

export function textOnlySetupBlock(
  section: SectionReader,
  setup: TextOnlyChatSetup | undefined,
  temporaryChatRetentionDays: number,
): string {
  const heading = section('setup_heading');
  if (!setup || heading.length === 0) return '';
  const lines = textOnlySetupLines(section, setup, temporaryChatRetentionDays).filter(
    (line) => line.length > 0,
  );
  return lines.length > 0 ? [heading, ...lines].join('\n') : '';
}

function sourceLinksBlock(
  section: SectionReader,
  setup: ChatTurnSetup | undefined,
  sourceLinks: boolean | undefined,
): string {
  if (!sourceLinks || !setup || !('chat' in setup)) return '';
  const { chat } = setup;
  const personal = !chat.temporaryChat && (chat.memory === 'on' || chat.memory === 'off');
  const linked = [
    personal && chat.memory === 'on' ? 'memory' : '',
    personal && chat.pastChats ? 'past_chats' : '',
    chat.project === 'with_files' ? 'project_files' : '',
  ];
  const lines = linked
    .filter((id) => id.length > 0)
    .map((id) => section(`${SOURCE_LINK_SECTION_PREFIX}${id}`))
    .filter((line) => line.length > 0);
  const heading = section('source_links_heading');
  if (lines.length === 0 || heading.length === 0) return '';
  return [[heading, ...lines].join('\n'), section('source_links_rules')]
    .filter((block) => block.length > 0)
    .join('\n\n');
}

function turnSetupBlock(section: SectionReader, setup: ChatTurnSetup | undefined): string {
  if (!setup) return '';
  return 'chat' in setup
    ? chatSetupBlock(section, setup.chat, setup.tools, setup.temporaryChatRetentionDays)
    : textOnlySetupBlock(section, setup.textOnly, setup.temporaryChatRetentionDays);
}

export interface AssembledChatSystemPrompt {
  /** Identical on every turn with the same state, so it can sit in the cached prefix. */
  readonly body: string;
  /** Changes with the clock, so it belongs after the cache boundary. */
  readonly time: string;
}

function productCapabilityBlock(
  sections: ChatSystemPromptSections,
  capabilities: readonly string[] | undefined,
): string {
  const lines = (capabilities ?? [])
    .map((id) => chatSystemPromptSection(sections, `${CAPABILITY_SECTION_PREFIX}${id}`))
    .filter((line) => line.length > 0)
    .map((line) => `- ${line}`);
  const heading = chatSystemPromptSection(sections, 'product_capabilities_heading');
  if (lines.length === 0 || heading.length === 0) return '';
  return [
    [heading, ...lines].join('\n'),
    chatSystemPromptSection(sections, 'product_capabilities_rules'),
  ].join('\n\n');
}

function describeTool(sections: ChatSystemPromptSections, name: string): string {
  const description = chatSystemPromptSection(sections, `${TOOL_SECTION_PREFIX}${name}`);
  return description ? `- ${name}, ${description}` : `- ${name}`;
}

export function renderChatToolInventory(
  sections: ChatSystemPromptSections,
  toolNames: readonly string[],
  bareToolNames?: ReadonlySet<string>,
): string {
  if (toolNames.length === 0) return chatSystemPromptSection(sections, 'no_tools');
  return [
    [
      chatSystemPromptSection(sections, 'tools_heading'),
      ...toolNames.map((name) =>
        bareToolNames?.has(name) ? `- ${name}` : describeTool(sections, name),
      ),
    ].join('\n'),
    chatSystemPromptSection(sections, 'tools_reality'),
  ]
    .filter((block) => block.length > 0)
    .join('\n\n');
}

export function assembleChatSystemPrompt(
  sections: ChatSystemPromptSections,
  state: ChatTurnState,
  clock: ChatTurnClock,
): AssembledChatSystemPrompt {
  const section: SectionReader = (key, values) => chatSystemPromptSection(sections, key, values);
  const describesSetup = sections['setup_heading'] !== undefined;

  const { toolNames } = state;
  const hasSearch = toolNames.includes('web_search');
  const hasFetch = toolNames.includes('web_fetch') || toolNames.includes('url_fetch');
  const hasFileCreation = toolNames.some((name) => FILE_CREATION_TOOL_NAMES.includes(name));
  const hasCodeExecution =
    !state.codeExecutionUnavailable &&
    toolNames.some((name) => CODE_EXECUTION_TOOL_NAMES.includes(name));
  const stagedAttachmentPaths =
    !state.codeExecutionUnavailable && toolNames.includes('execute_code')
      ? (state.attachmentSandboxPaths ?? [])
      : [];

  const time =
    section('time_utc', { utc: clock.utc }) +
    (clock.localInstant
      ? section('time_local', {
          timeZone: clock.timeZone ?? '',
          localInstant: clock.localInstant,
        })
      : '') +
    section('time_rules');

  const blocks: string[] = [
    section('identity'),
    section('identity_rules'),
    ...servingModelBlocks(section, state.servingModel ?? null),
    section('instruction_precedence'),
    section('untrusted_content'),
    section('capability_honesty'),
    productCapabilityBlock(
      sections,
      state.productCapabilities && state.artifactMarkers
        ? [...state.productCapabilities, ARTIFACTS_CAPABILITY]
        : state.productCapabilities,
    ),
  ];

  if (toolNames.length > 0) {
    if (state.includeToolInventory !== false)
      blocks.push(renderChatToolInventory(sections, toolNames));

    blocks.push(hasSearch ? section('search') : section('search_unavailable'));
    blocks.push(hasSearch || hasFetch ? section('citations') : section('citations_none'));
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
    if (state.includeToolInventory !== false)
      blocks.push(renderChatToolInventory(sections, toolNames));
    blocks.push(section('citations_none'));
  }
  blocks.push(section('reference_sources'));

  blocks.push(
    turnSetupBlock(section, state.setup),
    sourceLinksBlock(section, state.setup, state.sourceLinks),
  );
  if (state.settingsGuidance) {
    blocks.push(
      section(`settings_help_${state.settingsGuidance}`),
      section(`account_help_${state.settingsGuidance}`),
    );
  }
  blocks.push(section('disclosure'), section('response_language'));

  blocks.push(
    section('user_documents'),
    section('people_and_privacy'),
    section('safety_limits'),
    section('refusal_style'),
    section('wellbeing'),
    section('professional_advice'),
    section('evenhandedness'),
    section('copyright'),
  );
  // In a version with a setup block, memory_on and memory_off are lines of that block.
  if (!describesSetup && state.memory === 'on') blocks.push(section('memory_on'));
  if (!describesSetup && state.memory === 'off') blocks.push(section('memory_off'));
  blocks.push(section('memory_outcomes'), section('action_receipts'));
  if (toolNames.length > 0) blocks.push(section('consequential_actions'));
  blocks.push(
    section('tone'),
    section('mistakes'),
    section('format_and_length'),
    section('email_and_writing_blocks'),
  );
  if (state.writingCards) blocks.push(section('email_and_writing_cards'));
  if (state.artifactMarkers) {
    blocks.push(
      section('artifacts', {
        htmlMarker: state.artifactMarkers.html,
        reactMarker: state.artifactMarkers.react,
        mermaidMarker: state.artifactMarkers.mermaid,
      }),
      section(
        state.richInlineBlocks === false && sections['inline_blocks_unavailable'] !== undefined
          ? 'inline_blocks_unavailable'
          : 'inline_blocks',
      ),
    );
  }
  if (state.artifactRuntime !== false) {
    blocks.push(section('artifact_runtime'));
    if (state.artifactConnectors) blocks.push(section('artifact_runtime_connectors'));
  }
  if (state.artifactApps) {
    blocks.push(section('artifact_apps'));
    if (state.artifactConnectors) blocks.push(section('artifact_apps_connectors'));
  }

  if (state.codeExecutionUnavailable) blocks.push(section('code_execution_unavailable'));
  if (state.researchUnavailable) blocks.push(section('research_unavailable'));

  return { body: blocks.filter((block) => block.length > 0).join('\n\n'), time };
}
