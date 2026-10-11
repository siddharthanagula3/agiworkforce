/**
 * Renders the product's chat system prompt in front of each case, so a run can
 * measure a prompt version rather than only a model.
 *
 * The template and the assembler are loaded by relative path at runtime, the
 * same text and the same per-turn section choice the chat route sends: the
 * tools a case offers stand in for the tools a turn attached, and a case's own
 * `memory` for the memory state the route knows. The clock is pinned to noon
 * UTC on the recording date, so one recording renders one request.
 *
 * @module evals/chat-prompt
 * @packageDocumentation
 */

import { fileURLToPath, pathToFileURL } from 'node:url';

import type { ChatTurnMemory, EvalCase, EvalDataset } from './types';

export const CHAT_SYSTEM_PROMPT_ID = 'chat.system';

const PROMPTS_DIR = fileURLToPath(new URL('../../../apps/web/lib/prompts/', import.meta.url));

type Sections = Readonly<Record<string, string>>;

interface TemplateModule {
  readonly chatSystemPromptSections: (version: number) => Sections;
}

interface AssemblyModule {
  readonly assembleChatSystemPrompt: (
    sections: Sections,
    state: { readonly toolNames: readonly string[]; readonly memory?: ChatTurnMemory },
    clock: { readonly utc: string },
  ) => { readonly body: string; readonly time: string };
}

export interface ChatPromptRenderer {
  readonly version: number;
  readonly stamp: string;
  readonly render: (evalCase: EvalCase) => string;
}

export function chatPromptStamp(version: number): string {
  return `${CHAT_SYSTEM_PROMPT_ID}@${version}`;
}

export async function loadChatPromptRenderer(
  version: number,
  recordedOn: string,
): Promise<ChatPromptRenderer> {
  const template = (await import(
    pathToFileURL(`${PROMPTS_DIR}chat-system-prompt.ts`).href
  )) as TemplateModule;
  const assembly = (await import(
    pathToFileURL(`${PROMPTS_DIR}chat-system-prompt-assembly.ts`).href
  )) as AssemblyModule;
  const sections = template.chatSystemPromptSections(version);
  const utc = `${recordedOn}T12:00:00.000Z`;
  return {
    version,
    stamp: chatPromptStamp(version),
    render: (evalCase) => {
      const { body, time } = assembly.assembleChatSystemPrompt(
        sections,
        {
          toolNames: (evalCase.tools ?? []).map((tool) => tool.name),
          ...(evalCase.memory === undefined ? {} : { memory: evalCase.memory }),
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
