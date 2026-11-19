/**
 * Renders the product's chat system prompt in front of each case, so a run can
 * measure a prompt version rather than only a model.
 *
 * The template and the assembler are loaded by relative path at runtime, the
 * same text and the same per-turn section choice the chat route sends: the
 * tools a case offers stand in for the tools a turn attached, and a case's own
 * `memory` for the memory state the route knows. Every case is a web chat turn:
 * artifacts render, the artifact runtime is sent, email and writing blocks show
 * as cards, the markers come from the artifacts package, and the product
 * capabilities are the handshake's grant for the case's `plan` (free when
 * absent), from a fixture a web test holds to the product. A version that
 * states the serving model is told the measured model, as the user's choice,
 * from the model catalog. Every case gets the chat setup the route sends for a
 * saved web chat on an account with default settings: memory off and past chat
 * search off unless the case declares its memory, no personalization, connected
 * apps on only where the plan grants them, skills on, its `project` when it
 * names one, the memory and file tool lines when it offers those tools, and the
 * web chat's links to the sources the turn supplied. The clock is pinned to
 * noon UTC on the recording date, so one recording renders one request.
 *
 * @module evals/chat-prompt
 * @packageDocumentation
 */

import { fileURLToPath, pathToFileURL } from 'node:url';

import { readFileSync } from 'node:fs';

import { loadArtifactsPackage } from './artifacts-package';
import type { ChatTurnMemory, ChatTurnPlan, ChatTurnProject, EvalCase, EvalDataset } from './types';

export const CHAT_SYSTEM_PROMPT_ID = 'chat.system';

const PROMPTS_DIR = fileURLToPath(new URL('../../../apps/web/lib/prompts/', import.meta.url));
const PRODUCT_CAPABILITIES = fileURLToPath(
  new URL('../datasets/fixtures/product-capabilities.json', import.meta.url),
);
const MODEL_CATALOG = fileURLToPath(
  new URL('../../../packages/contracts/types/src/models.json', import.meta.url),
);
const TEMPORARY_CHAT_RETENTION_MODULE = fileURLToPath(
  new URL('../../../apps/web/lib/server/temporary-files/retention.ts', import.meta.url),
);
const TEMPORARY_CHAT_RETENTION_DAYS = /export const TEMPORARY_CHAT_RETENTION_DAYS = (\d+);/u;
const MEMORY_TOOLS_MODULE = fileURLToPath(
  new URL('../../../apps/web/lib/server/tools/memory-tools.ts', import.meta.url),
);
const FILE_SEARCH_TOOLS_MODULE = fileURLToPath(
  new URL('../../../apps/web/lib/server/tools/file-search-tool.ts', import.meta.url),
);
const TOOL_NAME_EXPORT = /export const [A-Z_]+_TOOL_NAME = '([a-z_]+)';/gu;
const CONNECTORS_CAPABILITY = 'canUseConnectors';
const DEFAULT_PLAN: ChatTurnPlan = 'free';
const DEFAULT_MEMORY: ChatTurnMemory = 'off';

type Sections = Readonly<Record<string, string>>;

interface TemplateModule {
  readonly chatSystemPromptSections: (version: number) => Sections;
}

interface ServingModelState {
  readonly kind: 'model';
  readonly name: string;
  readonly developer: string;
  readonly knowledgeCutoff: string | null;
  readonly choice: { readonly kind: 'selected' };
}

interface ChatSetupState {
  readonly savedChat: boolean;
  readonly temporaryChat: boolean;
  readonly memory: ChatTurnMemory;
  readonly pastChats: boolean;
  readonly project: ChatTurnProject | 'none';
  readonly projectChats: boolean;
  readonly personalization: 'none';
  readonly toolsSupported: boolean;
  readonly connectors: 'on' | 'unavailable';
  readonly skills: 'on';
}

interface AssemblyModule {
  readonly assembleChatSystemPrompt: (
    sections: Sections,
    state: {
      readonly toolNames: readonly string[];
      readonly memory?: ChatTurnMemory;
      readonly artifactMarkers?: Readonly<Record<'html' | 'react' | 'mermaid', string>>;
      readonly productCapabilities?: readonly string[];
      readonly servingModel?: ServingModelState | null;
      readonly setup?: {
        readonly chat: ChatSetupState;
        readonly tools: { readonly memoryTools: boolean; readonly fileSearchTools: boolean };
        readonly temporaryChatRetentionDays: number;
      };
      readonly settingsGuidance?: 'web';
      readonly sourceLinks?: boolean;
      readonly writingCards?: boolean;
      readonly artifactApps?: boolean;
    },
    clock: { readonly utc: string },
  ) => { readonly body: string; readonly time: string };
  readonly formatKnowledgeCutoff: (value: string | undefined) => string | null;
}

interface ModelCatalog {
  readonly models: Readonly<
    Record<
      string,
      { readonly name: string; readonly developer: string; readonly knowledgeCutoff?: string }
    >
  >;
  readonly developers: Readonly<Record<string, { readonly label: string }>>;
}

export interface ChatPromptRenderer {
  readonly version: number;
  readonly stamp: string;
  readonly render: (evalCase: EvalCase) => string;
}

export function chatPromptStamp(version: number): string {
  return `${CHAT_SYSTEM_PROMPT_ID}@${version}`;
}

function servingModelFor(
  modelKey: string | undefined,
  formatKnowledgeCutoff: AssemblyModule['formatKnowledgeCutoff'],
): ServingModelState | null {
  if (modelKey === undefined) return null;
  const catalog = JSON.parse(readFileSync(MODEL_CATALOG, 'utf8')) as ModelCatalog;
  const model = catalog.models[modelKey];
  if (model === undefined) throw new Error(`${modelKey} is not in the model catalog`);
  return {
    kind: 'model',
    name: model.name,
    developer: catalog.developers[model.developer]?.label ?? model.developer,
    knowledgeCutoff: formatKnowledgeCutoff(model.knowledgeCutoff),
    choice: { kind: 'selected' },
  };
}

function temporaryChatRetentionDays(): number {
  const match = TEMPORARY_CHAT_RETENTION_DAYS.exec(
    readFileSync(TEMPORARY_CHAT_RETENTION_MODULE, 'utf8'),
  );
  if (match === null) {
    throw new Error(
      `${TEMPORARY_CHAT_RETENTION_MODULE} no longer declares TEMPORARY_CHAT_RETENTION_DAYS as a number`,
    );
  }
  return Number(match[1]);
}

/**
 * The tool names a server-only module exports, read from its source because the
 * module cannot load outside the web app.
 */
function exportedToolNames(module: string): ReadonlySet<string> {
  const names = new Set(
    [...readFileSync(module, 'utf8').matchAll(TOOL_NAME_EXPORT)].map((match) => match[1] ?? ''),
  );
  if (names.size === 0) throw new Error(`${module} no longer exports a *_TOOL_NAME string`);
  return names;
}

function webChatSetup(evalCase: EvalCase, capabilities: readonly string[]): ChatSetupState {
  return {
    savedChat: true,
    temporaryChat: false,
    memory: evalCase.memory ?? DEFAULT_MEMORY,
    pastChats: false,
    project: evalCase.project ?? 'none',
    projectChats: false,
    personalization: 'none',
    toolsSupported: true,
    connectors: capabilities.includes(CONNECTORS_CAPABILITY) ? 'on' : 'unavailable',
    skills: 'on',
  };
}

/**
 * `modelKey` is the model the run measures, stated to a version that names the
 * serving model; absent, such a version says the model is not known.
 */
export async function loadChatPromptRenderer(
  version: number,
  recordedOn: string,
  modelKey?: string,
): Promise<ChatPromptRenderer> {
  const template = (await import(
    pathToFileURL(`${PROMPTS_DIR}chat-system-prompt.ts`).href
  )) as TemplateModule;
  const assembly = (await import(
    pathToFileURL(`${PROMPTS_DIR}chat-system-prompt-assembly.ts`).href
  )) as AssemblyModule;
  const sections = template.chatSystemPromptSections(version);
  const markers = (await loadArtifactsPackage()).EXPLICIT_ARTIFACT_MARKER_FOR;
  const artifactMarkers = {
    html: markers['html'] ?? '',
    react: markers['react'] ?? '',
    mermaid: markers['mermaid'] ?? '',
  };
  const capabilities = JSON.parse(readFileSync(PRODUCT_CAPABILITIES, 'utf8')) as Record<
    ChatTurnPlan,
    readonly string[]
  >;
  const servingModel = servingModelFor(modelKey, assembly.formatKnowledgeCutoff);
  const retentionDays = temporaryChatRetentionDays();
  const memoryTools = exportedToolNames(MEMORY_TOOLS_MODULE);
  const fileSearchTools = exportedToolNames(FILE_SEARCH_TOOLS_MODULE);
  const utc = `${recordedOn}T12:00:00.000Z`;
  return {
    version,
    stamp: chatPromptStamp(version),
    render: (evalCase) => {
      const toolNames = (evalCase.tools ?? []).map((tool) => tool.name);
      const productCapabilities = capabilities[evalCase.plan ?? DEFAULT_PLAN];
      const { body, time } = assembly.assembleChatSystemPrompt(
        sections,
        {
          toolNames,
          ...(evalCase.memory === undefined ? {} : { memory: evalCase.memory }),
          artifactMarkers,
          productCapabilities,
          servingModel,
          setup: {
            chat: webChatSetup(evalCase, productCapabilities),
            tools: {
              memoryTools: toolNames.some((name) => memoryTools.has(name)),
              fileSearchTools: toolNames.some((name) => fileSearchTools.has(name)),
            },
            temporaryChatRetentionDays: retentionDays,
          },
          settingsGuidance: 'web',
          sourceLinks: true,
          writingCards: true,
          artifactApps: true,
        },
        { utc },
      );
      return [body, evalCase.system, time].filter(Boolean).join('\n\n');
    },
  };
}

export function withChatPrompt(
  datasets: readonly EvalDataset[],
  renderer: ChatPromptRenderer,
): readonly EvalDataset[] {
  return datasets.map((dataset) => ({
    ...dataset,
    cases: dataset.cases.map((evalCase) => ({ ...evalCase, system: renderer.render(evalCase) })),
  }));
}
