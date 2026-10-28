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
  readonly codeExecutionUnavailable?: boolean;
  readonly researchUnavailable?: boolean;
  readonly attachmentSandboxPaths?: readonly string[];
  /** Absent when the caller does not know the turn's memory state. */
  readonly memory?: ChatTurnMemory;
  /** Present when the surface renders artifacts, so the prompt can name their markers. */
  readonly artifactMarkers?: ArtifactMarkers;
  /** The window.agi runtime text; absent means sent, as every version before 7 assumed. */
  readonly artifactRuntime?: boolean;
  readonly artifactConnectors?: boolean;
  /** Capability ids the plan and surface grant; absent when the caller does not know them. */
  readonly productCapabilities?: readonly string[];
}

export interface ChatTurnClock {
  readonly utc: string;
  readonly timeZone?: string;
  readonly localInstant?: string | null;
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

export function assembleChatSystemPrompt(
  sections: ChatSystemPromptSections,
  state: ChatTurnState,
  clock: ChatTurnClock,
): AssembledChatSystemPrompt {
  const section = (key: string, values?: Readonly<Record<string, string>>) =>
    chatSystemPromptSection(sections, key, values);

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
    blocks.push(
      [section('tools_heading'), ...toolNames.map((name) => describeTool(sections, name))].join(
        '\n',
      ),
      section('tools_reality'),
    );

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
    blocks.push(section('no_tools'), section('citations_none'));
  }

  blocks.push(section('user_documents'), section('people_and_privacy'), section('refusal_style'));
  if (state.memory === 'on') blocks.push(section('memory_on'));
  if (state.memory === 'off') blocks.push(section('memory_off'));
  blocks.push(section('format_and_length'), section('email_and_writing_blocks'));
  if (state.artifactMarkers) {
    blocks.push(
      section('artifacts', {
        htmlMarker: state.artifactMarkers.html,
        reactMarker: state.artifactMarkers.react,
        mermaidMarker: state.artifactMarkers.mermaid,
      }),
      section('inline_blocks'),
    );
  }
  if (state.artifactRuntime !== false) {
    blocks.push(section('artifact_runtime'));
    if (state.artifactConnectors) blocks.push(section('artifact_runtime_connectors'));
  }

  if (state.codeExecutionUnavailable) blocks.push(section('code_execution_unavailable'));
  if (state.researchUnavailable) blocks.push(section('research_unavailable'));

  return { body: blocks.filter((block) => block.length > 0).join('\n\n'), time };
}
