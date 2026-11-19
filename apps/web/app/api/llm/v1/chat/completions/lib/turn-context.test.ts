import { describe, expect, it } from 'vitest';
import {
  applyAnthropicPayloadPolicyToParams,
  resolveAnthropicPayloadPolicy,
} from '@agiworkforce/provider-protocol';
import { translateChatRequest } from '@agiworkforce/providers-anthropic';
import { listCanonicalModels } from '@agiworkforce/types';

import { buildCapabilityPreamble } from './capability-preamble';
import { toCanonicalChatRequest } from './canonical-request';
import { composeManagedSystemPreamble, separateTurnTime } from './request-processor';
import type { ProcessedRequest } from './request-processor';

type Message = ProcessedRequest['llmRequest']['messages'][number];

const ANTHROPIC_MODEL = listCanonicalModels().find((model) => model.provider === 'anthropic');
if (!ANTHROPIC_MODEL) throw new Error('Turn context test needs an Anthropic catalog model');

const TOOLS = [
  {
    type: 'function',
    function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object' } },
  },
];

function message(role: Message['role'], content: string, extra: Partial<Message> = {}): Message {
  return { role, content, ...extra };
}

function managedTurn(now: Date, history: Message[]): ProcessedRequest {
  const { capabilityPreamble, turnTime } = separateTurnTime(
    buildCapabilityPreamble({ tools: TOOLS, surface: 'cli', now, servingModel: null }),
  );
  const system = composeManagedSystemPreamble({
    capabilityPreamble,
    customInstructionsPreamble: null,
    dynamicSystemAddition: '',
  });
  const messages = [message('system', system), ...history];
  return {
    provider: 'anthropic',
    llmRequest: {
      model: ANTHROPIC_MODEL!.id,
      messages,
      max_tokens: 1024,
      tools: TOOLS,
      usePromptCache: true,
      turnContext: { text: turnTime, afterMessages: messages.length },
    },
  } as ProcessedRequest;
}

function anthropicPayload(processed: ProcessedRequest): {
  system: Array<{ text: string }>;
  messages: Array<{ role: string; content: unknown }>;
} {
  const payload = translateChatRequest(toCanonicalChatRequest(processed)) as unknown as Record<
    string,
    unknown
  >;
  applyAnthropicPayloadPolicyToParams(
    payload,
    resolveAnthropicPayloadPolicy({
      api: 'anthropic-messages',
      provider: 'anthropic',
      enableCacheControl: true,
      cacheRetention: 'long',
    }),
  );
  return payload as ReturnType<typeof anthropicPayload>;
}

function withoutBreakpoints(value: unknown): string {
  return JSON.stringify(value, (key, field: unknown) =>
    key === 'cache_control' ? undefined : field,
  );
}

/** The Messages API reads a string as one text block. */
function blocksOf(content: unknown): Array<Record<string, unknown>> {
  return typeof content === 'string'
    ? [{ type: 'text', text: content }]
    : (content as Array<Record<string, unknown>>);
}

function textOf(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

const FIRST = [message('user', 'What does calc.js do?')];
const SECOND = [
  ...FIRST,
  message('assistant', 'It adds two numbers.'),
  message('user', 'And what time is it?'),
];

describe('turn context', () => {
  it('keeps system, tools and history byte-identical across two minutes', () => {
    const first = anthropicPayload(managedTurn(new Date('2026-10-25T16:33:10.000Z'), FIRST));
    const second = anthropicPayload(managedTurn(new Date('2026-10-25T16:35:40.000Z'), SECOND));

    expect(withoutBreakpoints(second.system)).toBe(withoutBreakpoints(first.system));
    expect(first.system.map((block) => block.text).join('')).not.toContain('16:33');
    const firstHistoryBlock = blocksOf(first.messages[0]!.content)[0];
    const secondHistoryBlock = blocksOf(second.messages[0]!.content)[0];
    expect(withoutBreakpoints(secondHistoryBlock)).toBe(withoutBreakpoints(firstHistoryBlock));
    expect(firstHistoryBlock?.['cache_control']).toBeDefined();
  });

  it('still tells the model the current time, after the conversation', () => {
    const turn = anthropicPayload(managedTurn(new Date('2026-10-25T16:35:40.000Z'), SECOND));
    const last = turn.messages.at(-1)!.content as Array<Record<string, unknown>>;

    expect(last.at(-1)?.['text']).toContain('The current UTC date and time is 2026-10-25T16:35');
    expect(last.at(-1)?.['cache_control']).toBeUndefined();
    expect(last.at(-2)?.['text']).toBe('And what time is it?');
    expect(last.at(-2)?.['cache_control']).toBeDefined();
  });

  it('leaves the turn context where it was as a tool loop appends steps', () => {
    const turn = managedTurn(new Date('2026-10-25T16:35:40.000Z'), FIRST);
    const stepOne = toCanonicalChatRequest(turn);
    const stepTwo = toCanonicalChatRequest({
      ...turn,
      llmRequest: {
        ...turn.llmRequest,
        messages: [
          ...turn.llmRequest.messages,
          message('assistant', '', {
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'read_file', arguments: '{"path":"calc.js"}' },
              },
            ],
          }),
          message('tool', 'module.exports = (a, b) => a + b;', { tool_call_id: 'call_1' }),
        ],
      },
    });

    expect(JSON.stringify(stepTwo.messages.slice(0, stepOne.messages.length))).toBe(
      JSON.stringify(stepOne.messages),
    );
    expect(textOf(stepTwo.messages.at(-1)?.content)).not.toContain('<turn_context>');
  });

  it('follows tool results the client sent with the turn context in its own message', () => {
    const history = [
      ...FIRST,
      message('assistant', '', {
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"calc.js"}' },
          },
        ],
      }),
      message('tool', 'module.exports = (a, b) => a + b;', { tool_call_id: 'call_1' }),
    ];
    const turn = anthropicPayload(managedTurn(new Date('2026-10-25T16:35:40.000Z'), history));
    const toolResults = turn.messages.at(-2)!.content as Array<Record<string, unknown>>;

    expect(toolResults[0]?.['type']).toBe('tool_result');
    expect(toolResults[0]?.['cache_control']).toBeDefined();
    expect(textOf(turn.messages.at(-1)?.content)).toContain('<turn_context>');
  });
});
