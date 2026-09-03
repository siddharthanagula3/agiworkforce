import { describe, expect, it } from 'vitest';

import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';

import { buildCapabilityPreamble } from './capability-preamble';
import {
  applyJsonObjectMode,
  applyResearchMode,
  composeManagedSystemPreamble,
  RESEARCH_SYSTEM_PROMPT,
} from './request-processor';
import { JSON_OBJECT_DIRECTIVE } from './json-object-mode';

function splitStaticDynamic(
  messages: Parameters<typeof applyJsonObjectMode>[0]['messages'],
  dynamicSystemMessageRefs: ReadonlySet<object>,
) {
  return {
    staticMessages: messages.filter((message) => !dynamicSystemMessageRefs.has(message as object)),
    dynamicMessages: messages.filter((message) => dynamicSystemMessageRefs.has(message as object)),
  };
}

describe('composeManagedSystemPreamble', () => {
  it('keeps the stable prefix byte-identical across two turns even when the timestamp, skills, and memories all differ', () => {
    const turnOnePreamble = buildCapabilityPreamble({
      now: new Date('2026-07-25T12:03:00.000Z'),
      tools: [{ type: 'function', function: { name: 'web_search' } }],
    });
    const turnTwoPreamble = buildCapabilityPreamble({
      now: new Date('2026-07-25T13:57:00.000Z'),
      tools: [{ type: 'function', function: { name: 'web_search' } }],
    });

    const turnOne = composeManagedSystemPreamble({
      capabilityPreamble: turnOnePreamble,
      customInstructionsPreamble: 'Reply in a formal tone.',
      dynamicSystemAddition: '<skill><name>design-review</name></skill>',
    });
    const turnTwo = composeManagedSystemPreamble({
      capabilityPreamble: turnTwoPreamble,
      customInstructionsPreamble: 'Reply in a formal tone.',
      dynamicSystemAddition: 'Memory: user prefers morning meetings.',
    });

    const stableOne = turnOne.split(SYSTEM_PROMPT_CACHE_BOUNDARY)[0];
    const stableTwo = turnTwo.split(SYSTEM_PROMPT_CACHE_BOUNDARY)[0];
    expect(stableOne).toBe(stableTwo);
    expect(turnOne).not.toBe(turnTwo);
  });

  it('puts the timestamp, matched skill, and recalled memory after the boundary', () => {
    const capabilityPreamble = buildCapabilityPreamble({
      now: new Date('2026-07-25T12:03:00.000Z'),
      tools: [],
    });

    const preamble = composeManagedSystemPreamble({
      capabilityPreamble,
      customInstructionsPreamble: null,
      dynamicSystemAddition: '<skill><name>design-review</name></skill>',
    });

    expect(preamble).toContain(SYSTEM_PROMPT_CACHE_BOUNDARY);
    const [before, after] = preamble.split(SYSTEM_PROMPT_CACHE_BOUNDARY);
    expect(before).not.toContain('<skill>');
    expect(before).not.toContain('The current UTC date and time is');
    expect(after).toContain('<skill>');
    expect(after).toContain('The current UTC date and time is 2026-07-25T12:03:00.000Z');
  });

  it('folds custom instructions into the stable side, ahead of the boundary', () => {
    const capabilityPreamble = buildCapabilityPreamble({
      now: new Date('2026-07-25T12:03:00.000Z'),
      tools: [],
    });

    const preamble = composeManagedSystemPreamble({
      capabilityPreamble,
      customInstructionsPreamble: 'Always answer in haiku.',
      dynamicSystemAddition: '',
    });

    const [before] = preamble.split(SYSTEM_PROMPT_CACHE_BOUNDARY);
    expect(before).toContain('Always answer in haiku.');
  });

  it('returns just the stable block when there is no dynamic content at all', () => {
    const preamble = composeManagedSystemPreamble({
      capabilityPreamble: null,
      customInstructionsPreamble: 'Always answer in haiku.',
      dynamicSystemAddition: '',
    });

    expect(preamble).toBe('Always answer in haiku.');
    expect(preamble).not.toContain(SYSTEM_PROMPT_CACHE_BOUNDARY);
  });
});

describe('applyJsonObjectMode with a memory message already ahead of it', () => {
  function runTurn(memoryContent: string) {
    const dynamicSystemMessageRefs = new Set<object>();
    const memoryMessage = { role: 'system' as const, content: memoryContent };
    const request = {
      model: 'auto',
      messages: [memoryMessage, { role: 'user' as const, content: 'hi' }],
    } as Parameters<typeof applyJsonObjectMode>[0];
    dynamicSystemMessageRefs.add(memoryMessage);

    applyJsonObjectMode(request, dynamicSystemMessageRefs);

    return { request, dynamicSystemMessageRefs, memoryMessage };
  }

  it('leaves the dynamic-tracked memory message untouched and puts the directive in a static message', () => {
    const { request, dynamicSystemMessageRefs, memoryMessage } = runTurn(
      'Memory: user prefers concise answers.',
    );

    expect(memoryMessage.content).toBe('Memory: user prefers concise answers.');
    const { staticMessages, dynamicMessages } = splitStaticDynamic(
      request.messages,
      dynamicSystemMessageRefs,
    );
    expect(dynamicMessages).toEqual([memoryMessage]);
    expect(
      staticMessages.some(
        (message) =>
          typeof message.content === 'string' && message.content === JSON_OBJECT_DIRECTIVE,
      ),
    ).toBe(true);
  });

  it('keeps the static prefix byte-identical across turns even when the recalled memory differs', () => {
    const turnOne = runTurn('Memory: user prefers concise answers.');
    const turnTwo = runTurn('Memory: user prefers detailed answers.');

    const stableOne = splitStaticDynamic(turnOne.request.messages, turnOne.dynamicSystemMessageRefs)
      .staticMessages.map((message) => message.content)
      .join('\n\n');
    const stableTwo = splitStaticDynamic(turnTwo.request.messages, turnTwo.dynamicSystemMessageRefs)
      .staticMessages.map((message) => message.content)
      .join('\n\n');

    expect(stableOne).toBe(stableTwo);
  });
});

describe('applyResearchMode with a memory message already ahead of it', () => {
  function runTurn(memoryContent: string) {
    const dynamicSystemMessageRefs = new Set<object>();
    const memoryMessage = { role: 'system' as const, content: memoryContent };
    const request = {
      model: 'auto',
      messages: [memoryMessage, { role: 'user' as const, content: 'research this' }],
    } as Parameters<typeof applyResearchMode>[0];
    dynamicSystemMessageRefs.add(memoryMessage);

    applyResearchMode(request, dynamicSystemMessageRefs);

    return { request, dynamicSystemMessageRefs, memoryMessage };
  }

  it('leaves the dynamic-tracked memory message untouched and puts the directive in a static message', () => {
    const { request, dynamicSystemMessageRefs, memoryMessage } = runTurn(
      'Memory: user prefers concise answers.',
    );

    expect(memoryMessage.content).toBe('Memory: user prefers concise answers.');
    const { staticMessages, dynamicMessages } = splitStaticDynamic(
      request.messages,
      dynamicSystemMessageRefs,
    );
    expect(dynamicMessages).toEqual([memoryMessage]);
    expect(
      staticMessages.some(
        (message) =>
          typeof message.content === 'string' && message.content === RESEARCH_SYSTEM_PROMPT,
      ),
    ).toBe(true);
  });

  it('keeps the static prefix byte-identical across turns even when the recalled memory differs', () => {
    const turnOne = runTurn('Memory: user prefers concise answers.');
    const turnTwo = runTurn('Memory: user prefers detailed answers.');

    const stableOne = splitStaticDynamic(turnOne.request.messages, turnOne.dynamicSystemMessageRefs)
      .staticMessages.map((message) => message.content)
      .join('\n\n');
    const stableTwo = splitStaticDynamic(turnTwo.request.messages, turnTwo.dynamicSystemMessageRefs)
      .staticMessages.map((message) => message.content)
      .join('\n\n');

    expect(stableOne).toBe(stableTwo);
  });
});
