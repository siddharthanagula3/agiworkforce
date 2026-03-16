/**
 * Unit tests for use-unified-adapter.ts
 *
 * Tests cover:
 * - ChatMessage → AdaptedMessage mapping
 * - Null/empty input handling
 * - ChatSession → ConversationSummary mapping
 * - ToolExecution → AdaptedToolEvent mapping
 * - No data loss in transformations
 */

import { describe, it, expect } from 'vitest';
import {
  adaptMessage,
  adaptSession,
  adaptToolExecution,
} from '../use-unified-adapter';
import type { ChatMessage, ChatSession } from '../../stores/chat-store';
import type { ToolExecution } from '@/stores/unified/chat/toolStore';

// ============================================================================
// Fixtures
// ============================================================================

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'user',
    content: 'Hello, world',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    isStreaming: false,
    ...overrides,
  };
}

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'session-1',
    title: 'My Chat',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    preview: 'Hello...',
    messageCount: 3,
    ...overrides,
  };
}

function makeToolExecution(overrides: Partial<ToolExecution> = {}): ToolExecution {
  return {
    id: 'exec-1',
    toolName: 'read_file',
    input: { path: '/foo/bar.ts' },
    output: 'file contents',
    duration: 120,
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    success: true,
    ...overrides,
  };
}

// ============================================================================
// adaptMessage
// ============================================================================

describe('adaptMessage', () => {
  it('maps basic fields correctly', () => {
    const msg = makeMessage();
    const adapted = adaptMessage(msg);

    expect(adapted.id).toBe('msg-1');
    expect(adapted.role).toBe('user');
    expect(adapted.content).toBe('Hello, world');
    expect(adapted.timestamp).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(adapted.streaming).toBe(false);
  });

  it('maps assistant role', () => {
    const msg = makeMessage({ role: 'assistant' });
    const adapted = adaptMessage(msg);
    expect(adapted.role).toBe('assistant');
  });

  it('sets streaming flag when isStreaming is true', () => {
    const msg = makeMessage({ isStreaming: true });
    const adapted = adaptMessage(msg);
    expect(adapted.streaming).toBe(true);
  });

  it('maps metadata fields', () => {
    const msg = makeMessage({
      metadata: { model: 'claude-3-5-sonnet', tokensUsed: 500 },
    });
    const adapted = adaptMessage(msg);
    expect(adapted.metadata?.model).toBe('claude-3-5-sonnet');
    expect(adapted.metadata?.tokensUsed).toBe(500);
    expect(adapted.metadata?.timestamp).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
  });

  it('maps thinkingSteps to a single thinking string', () => {
    const msg = makeMessage({
      metadata: { thinkingSteps: ['Step 1', 'Step 2'] },
    });
    const adapted = adaptMessage(msg);
    expect(adapted.thinking).toBe('Step 1\nStep 2');
  });

  it('sets thinking to undefined when thinkingSteps is empty', () => {
    const msg = makeMessage({ metadata: { thinkingSteps: [] } });
    const adapted = adaptMessage(msg);
    expect(adapted.thinking).toBeUndefined();
  });

  it('sets thinking to undefined when no metadata', () => {
    const msg = makeMessage({ metadata: undefined });
    const adapted = adaptMessage(msg);
    expect(adapted.thinking).toBeUndefined();
  });

  it('maps tools to toolCalls', () => {
    const msg = makeMessage({
      metadata: {
        tools: [
          { name: 'bash', status: 'completed', durationMs: 300, args: 'ls -la' },
        ],
      },
    });
    const adapted = adaptMessage(msg);
    expect(adapted.toolCalls).toHaveLength(1);
    expect(adapted.toolCalls?.[0]).toEqual({
      name: 'bash',
      status: 'completed',
      durationMs: 300,
      args: 'ls -la',
    });
  });

  it('sets toolCalls to undefined when tools array is empty', () => {
    const msg = makeMessage({ metadata: { tools: [] } });
    const adapted = adaptMessage(msg);
    expect(adapted.toolCalls).toBeUndefined();
  });

  it('sets toolCalls to undefined when no metadata', () => {
    const msg = makeMessage({ metadata: undefined });
    const adapted = adaptMessage(msg);
    expect(adapted.toolCalls).toBeUndefined();
  });

  it('preserves content verbatim (no trimming or truncation)', () => {
    const longContent = 'a'.repeat(5000);
    const msg = makeMessage({ content: longContent });
    const adapted = adaptMessage(msg);
    expect(adapted.content).toBe(longContent);
    expect(adapted.content.length).toBe(5000);
  });
});

// ============================================================================
// adaptSession
// ============================================================================

describe('adaptSession', () => {
  it('maps basic fields correctly', () => {
    const session = makeSession();
    const adapted = adaptSession(session);

    expect(adapted.id).toBe('session-1');
    expect(adapted.title).toBe('My Chat');
    expect(adapted.updatedAt).toEqual(new Date('2026-01-02T00:00:00.000Z'));
    expect(adapted.messageCount).toBe(3);
  });

  it('maps preview to lastMessage', () => {
    const session = makeSession({ preview: 'Last user message here' });
    const adapted = adaptSession(session);
    expect(adapted.lastMessage).toBe('Last user message here');
  });

  it('sets lastMessage to undefined when preview is empty string', () => {
    const session = makeSession({ preview: '' });
    const adapted = adaptSession(session);
    expect(adapted.lastMessage).toBeUndefined();
  });

  it('defaults isPinned to false', () => {
    const session = makeSession();
    const adapted = adaptSession(session);
    expect(adapted.isPinned).toBe(false);
  });

  it('defaults isArchived to false', () => {
    const session = makeSession();
    const adapted = adaptSession(session);
    expect(adapted.isArchived).toBe(false);
  });

  it('maps messageCount=0 correctly', () => {
    const session = makeSession({ messageCount: 0 });
    const adapted = adaptSession(session);
    expect(adapted.messageCount).toBe(0);
  });
});

// ============================================================================
// adaptToolExecution
// ============================================================================

describe('adaptToolExecution', () => {
  it('maps basic fields correctly', () => {
    const exec = makeToolExecution();
    const adapted = adaptToolExecution(exec);

    expect(adapted.id).toBe('exec-1');
    expect(adapted.toolName).toBe('read_file');
    expect(adapted.durationMs).toBe(120);
    expect(adapted.timestamp).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(adapted.input).toEqual({ path: '/foo/bar.ts' });
    expect(adapted.output).toBe('file contents');
  });

  it('maps success=true to status completed', () => {
    const exec = makeToolExecution({ success: true, error: undefined });
    const adapted = adaptToolExecution(exec);
    expect(adapted.status).toBe('completed');
  });

  it('maps error presence to status failed (regardless of success flag)', () => {
    const exec = makeToolExecution({ success: false, error: 'permission denied' });
    const adapted = adaptToolExecution(exec);
    expect(adapted.status).toBe('failed');
    expect(adapted.error).toBe('permission denied');
  });

  it('maps success=false with no error to status running', () => {
    const exec = makeToolExecution({ success: false, error: undefined });
    const adapted = adaptToolExecution(exec);
    expect(adapted.status).toBe('running');
  });

  it('formats snake_case tool names to Title Case displayName', () => {
    const exec = makeToolExecution({ toolName: 'read_file' });
    const adapted = adaptToolExecution(exec);
    expect(adapted.displayName).toBe('Read File');
  });

  it('formats camelCase tool names to Title Case displayName', () => {
    const exec = makeToolExecution({ toolName: 'webSearch' });
    const adapted = adaptToolExecution(exec);
    expect(adapted.displayName).toBe('Web Search');
  });

  it('handles single-word tool names', () => {
    const exec = makeToolExecution({ toolName: 'bash' });
    const adapted = adaptToolExecution(exec);
    expect(adapted.displayName).toBe('Bash');
  });

  it('passes through input record without mutation', () => {
    const input = { path: '/foo', overwrite: true };
    const exec = makeToolExecution({ input });
    const adapted = adaptToolExecution(exec);
    // Ensure the input reference is the same object (no deep clone overhead)
    expect(adapted.input).toBe(input);
  });
});
