import { describe, expect, it } from 'vitest';
import {
  ELEMENT_LIST_HEADING,
  PAGE_CONTENT_FENCE_BEGIN,
  PAGE_CONTENT_FENCE_END,
} from '../src/features/computer-use/cdpDriver';
import type { AgentMessage } from '../src/features/computer-use/cloudAgentClient';
import {
  DOM_SUMMARY_HEADING,
  RETAINED_OBSERVATIONS,
  pruneObservationHistory,
} from '../src/features/computer-use/historyBudget';

const GOAL = 'Book the cheapest refundable flight to Lisbon';
// A 1280x800 PNG lands near 90 KB, which is what detail:high sends every step.
const SCREENSHOT_CHARS = 120_000;

function screenshotBase64(step: number): string {
  return `${step}`.padStart(SCREENSHOT_CHARS, 'A');
}

function domSummary(step: number): string {
  const elements = Array.from(
    { length: 30 },
    (_, i) => `  [${i + 1}] button label="Action ${i + 1} at step ${step}"`,
  );
  return [
    `URL: https://example.test/step/${step}`,
    `TITLE: Step ${step}`,
    '',
    `${ELEMENT_LIST_HEADING}30 addressable of 41 found):`,
    ...elements,
    '',
    PAGE_CONTENT_FENCE_BEGIN,
    `body text for step ${step} `.repeat(200),
    PAGE_CONTENT_FENCE_END,
  ].join('\n');
}

function systemMessage(): AgentMessage {
  return { role: 'system', content: 'You are a browser automation agent powered by AGI Cloud.' };
}

function openingMessage(): AgentMessage {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text:
          `Goal: ${GOAL}\n\n` +
          `${DOM_SUMMARY_HEADING}:\n${domSummary(0)}\n\n` +
          'I have also attached a screenshot of the current page state.',
      },
      {
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${screenshotBase64(0)}`, detail: 'high' },
      },
    ],
  };
}

function assistantCall(step: number, name: string, args: Record<string, unknown>): AgentMessage {
  return {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: `call_${step}_${name}`,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}

function toolResult(step: number, name: string, content: string): AgentMessage {
  return { role: 'tool', content, tool_call_id: `call_${step}_${name}`, name };
}

function screenshotImage(step: number): AgentMessage {
  return {
    role: 'user',
    content: [
      { type: 'text', text: 'Here is the current screenshot:' },
      {
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${screenshotBase64(step)}`, detail: 'high' },
      },
    ],
  };
}

const TOOL_ERROR = 'Tool error: click requires either index, selector, or {x, y}';
const APPROVAL_REFUSAL = 'Action skipped, no approval received (timeout or user denied).';

/**
 * A run shaped like the real loop: read_dom every step, a screenshot every
 * third, one tool error and one approval refusal, and a final answer.
 */
function syntheticRun(steps: number): AgentMessage[] {
  const history: AgentMessage[] = [systemMessage(), openingMessage()];
  for (let step = 1; step <= steps; step += 1) {
    if (step % 3 === 0) {
      history.push(assistantCall(step, 'screenshot', {}));
      history.push(
        toolResult(
          step,
          'screenshot',
          JSON.stringify({
            type: 'screenshot',
            base64: screenshotBase64(step),
            note: 'See image in next turn.',
          }),
        ),
      );
      history.push(screenshotImage(step));
      continue;
    }
    if (step === 5) {
      history.push(assistantCall(step, 'click', {}));
      history.push(toolResult(step, 'click', TOOL_ERROR));
      continue;
    }
    if (step === 8) {
      history.push(assistantCall(step, 'type', { text: 'lisbon' }));
      history.push(toolResult(step, 'type', APPROVAL_REFUSAL));
      continue;
    }
    history.push(assistantCall(step, 'read_dom', {}));
    history.push(toolResult(step, 'read_dom', domSummary(step)));
  }
  return history;
}

function bytes(history: readonly AgentMessage[]): number {
  return JSON.stringify(history).length;
}

function assistantToolCallIds(history: readonly AgentMessage[]): string[] {
  return history.flatMap((message) =>
    'tool_calls' in message && message.tool_calls ? message.tool_calls.map((call) => call.id) : [],
  );
}

function toolResultIds(history: readonly AgentMessage[]): string[] {
  return history.flatMap((message) =>
    message.role === 'tool' && message.tool_call_id ? [message.tool_call_id] : [],
  );
}

describe('pruneObservationHistory', () => {
  it('bounds serialized growth across a 20-step run', () => {
    const atFive = bytes(pruneObservationHistory(syntheticRun(5)));
    const atTwenty = bytes(pruneObservationHistory(syntheticRun(20)));

    expect(bytes(syntheticRun(20))).toBeGreaterThan(3 * bytes(syntheticRun(5)));
    expect(atTwenty).toBeLessThan(1.5 * atFive);
  });

  it('keeps every assistant tool call paired with its tool result', () => {
    const history = syntheticRun(20);
    const pruned = pruneObservationHistory(history);

    expect(pruned).toHaveLength(history.length);
    expect(pruned.map((message) => message.role)).toEqual(history.map((message) => message.role));
    expect(assistantToolCallIds(pruned)).toEqual(assistantToolCallIds(history));
    expect(toolResultIds(pruned)).toEqual(toolResultIds(history));
    for (const id of assistantToolCallIds(pruned)) {
      expect(toolResultIds(pruned)).toContain(id);
    }
  });

  it('leaves the newest observations of each kind byte for byte intact', () => {
    const history = syntheticRun(20);
    const pruned = pruneObservationHistory(history);

    const domIndices = history.flatMap((message, index) =>
      message.role === 'tool' && message.name === 'read_dom' ? [index] : [],
    );
    const imageIndices = history.flatMap((message, index) =>
      Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url')
        ? [index]
        : [],
    );

    for (const index of domIndices.slice(-RETAINED_OBSERVATIONS)) {
      expect(pruned[index]).toEqual(history[index]);
    }
    for (const index of imageIndices.slice(-RETAINED_OBSERVATIONS)) {
      expect(pruned[index]).toEqual(history[index]);
    }
    expect(JSON.stringify(pruned[domIndices[0]])).not.toEqual(
      JSON.stringify(history[domIndices[0]]),
    );
    expect(JSON.stringify(pruned[imageIndices[0]])).not.toEqual(
      JSON.stringify(history[imageIndices[0]]),
    );
  });

  it('never resends base64 that the image message beside it already carries', () => {
    const history = syntheticRun(20);
    const pruned = pruneObservationHistory(history);

    const screenshotResults = pruned.filter(
      (message) => message.role === 'tool' && message.name === 'screenshot',
    );
    expect(screenshotResults.length).toBeGreaterThan(0);
    for (const message of screenshotResults) {
      expect(String(message.content)).not.toContain('AAAA');
      expect(String(message.content)).toMatch(/^\[screenshot from step \d+ /);
    }
  });

  it('returns a run with nothing stale unchanged byte for byte', () => {
    const history = syntheticRun(1);
    const pruned = pruneObservationHistory(history);

    expect(JSON.stringify(pruned)).toEqual(JSON.stringify(history));
    pruned.forEach((message, index) => {
      expect(message).toBe(history[index]);
    });
  });

  it('never drops the goal, an error, a refusal or the final answer', () => {
    const history = syntheticRun(20);
    history.push({ role: 'assistant', content: 'Booked the 09:40 TAP flight, refundable.' });
    const pruned = pruneObservationHistory(history);

    const opening = pruned[1];
    const openingText =
      typeof opening?.content === 'string'
        ? opening.content
        : JSON.stringify(opening?.content ?? '');
    expect(openingText).toContain(`Goal: ${GOAL}`);
    expect(openingText).not.toContain(PAGE_CONTENT_FENCE_END);

    const contents = pruned.map((message) =>
      typeof message.content === 'string' ? message.content : '',
    );
    expect(contents).toContain(TOOL_ERROR);
    expect(contents).toContain(APPROVAL_REFUSAL);
    expect(pruned[pruned.length - 1]).toEqual(history[history.length - 1]);
  });

  it('stubs a stale observation with its kind and step', () => {
    const pruned = pruneObservationHistory(syntheticRun(20));
    const stubs = pruned
      .map((message) => (typeof message.content === 'string' ? message.content : ''))
      .filter((content) => content.startsWith('[screenshot from step '));

    expect(stubs.length).toBeGreaterThan(0);
    expect(stubs[0]).toMatch(/^\[screenshot from step \d+ dropped to bound context\./);
  });

  it('keeps at least the newest observation when asked to retain none', () => {
    const history = syntheticRun(20);
    const pruned = pruneObservationHistory(history, 0);
    const lastDom = history.reduce(
      (found, message, index) =>
        message.role === 'tool' && message.name === 'read_dom' ? index : found,
      -1,
    );

    expect(pruned[lastDom]).toEqual(history[lastDom]);
  });
});
