/**
 * Tests that toolStatusEvent threads tool args through the SSE payload on
 * running events, enabling ToolCallCard to render a syntax-highlighted
 * code Request block via detectCodeBlock.
 */
import { describe, it, expect } from 'vitest';
import { toolStatusEvent } from './tool-loop';

/** Parse the JSON payload from a `data: {...}\n\n` SSE line. */
function parseSse(line: string): Record<string, unknown> {
  const stripped = line.replace(/^data: /, '').trim();
  return JSON.parse(stripped) as Record<string, unknown>;
}

/** Extract x_tool_status from a parsed SSE payload. */
function extractStatus(parsed: Record<string, unknown>): Record<string, unknown> {
  const choices = parsed['choices'] as Array<Record<string, unknown>>;
  const delta = choices[0]?.['delta'] as Record<string, unknown>;
  return delta['x_tool_status'] as Record<string, unknown>;
}

describe('toolStatusEvent', () => {
  const MODEL = 'test-model';

  it('includes args in the running event when args are provided', () => {
    const args = { language: 'python', code: 'print("hello")' };
    const line = toolStatusEvent('execute_code', 'running', MODEL, args);
    const status = extractStatus(parseSse(line));
    expect(status['args']).toEqual(args);
  });

  it('does not include args in completed events', () => {
    const args = { language: 'python', code: 'print("hello")' };
    const line = toolStatusEvent('execute_code', 'completed', MODEL, args);
    const status = extractStatus(parseSse(line));
    expect(status['args']).toBeUndefined();
  });

  it('does not include args in failed events', () => {
    const args = { language: 'python', code: 'print("hello")' };
    const line = toolStatusEvent('execute_code', 'failed', MODEL, args);
    const status = extractStatus(parseSse(line));
    expect(status['args']).toBeUndefined();
  });

  it('does not include args when args is empty object', () => {
    const line = toolStatusEvent('execute_code', 'running', MODEL, {});
    const status = extractStatus(parseSse(line));
    expect(status['args']).toBeUndefined();
  });

  it('does not include args when args is omitted', () => {
    const line = toolStatusEvent('execute_code', 'running', MODEL);
    const status = extractStatus(parseSse(line));
    expect(status['args']).toBeUndefined();
  });

  it('always includes type, name, and status fields', () => {
    const line = toolStatusEvent('execute_code', 'running', MODEL, { code: 'x = 1' });
    const status = extractStatus(parseSse(line));
    expect(status['type']).toBe('mcp_tool_use');
    expect(status['name']).toBe('execute_code');
    expect(status['status']).toBe('running');
  });

  it('args flow enables detectCodeBlock to extract language and code', () => {
    const args = { language: 'python', code: 'import numpy as np' };
    const line = toolStatusEvent('execute_code', 'running', MODEL, args);
    const status = extractStatus(parseSse(line));
    // Simulate what useChatStream would store as MessageToolEntry.parameters
    const parameters = status['args'] as Record<string, unknown>;
    expect(typeof parameters['language']).toBe('string');
    expect(typeof parameters['code']).toBe('string');
    expect(parameters['language']).toBe('python');
    expect(parameters['code']).toBe('import numpy as np');
  });
});
