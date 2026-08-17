import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageBubble } from '../MessageBubble';
import { readCodeExecutionResult } from '../CodeExecutionOutput';
import type { ChatMessage } from '../../lib/types';

function assistant(message: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: 'Here is the result.',
    createdAt: '2026-08-15T12:00:00.000Z',
    ...message,
  };
}

function render(message: ChatMessage): string {
  return renderToStaticMarkup(<MessageBubble message={message} isLast />);
}

describe('MessageBubble code execution console', () => {
  it('renders stdout for a text-only execution turn', () => {
    const html = render(
      assistant({
        metadata: {
          codeExecutionResult: { stdout: 'hello from python\n42\n', stderr: '', returnCode: 0 },
        },
      }),
    );
    expect(html).toContain('code-execution-stdout');
    expect(html).toContain('hello from python');
  });

  it('renders stderr and the exit code for a failed run', () => {
    const html = render(
      assistant({
        metadata: {
          codeExecutionResult: {
            stdout: '',
            stderr: 'ZeroDivisionError: division by zero',
            returnCode: 1,
          },
        },
      }),
    );
    expect(html).toContain('code-execution-stderr');
    expect(html).toContain('ZeroDivisionError: division by zero');
    expect(html).toContain('Exit code: 1');
  });

  it('shows a running console instead of a duplicate generated-files strip', () => {
    const html = render(
      assistant({
        content: '',
        isStreaming: true,
        toolCalls: [{ id: 'tc-1', name: 'execute_code', args: {}, status: 'running' }],
      }),
    );
    expect(html).toContain('code-execution-output');
    expect(html).toContain('Running code…');
    expect(html).not.toContain('generated-files-pending');
  });

  it('keeps the generated-files pending strip for non-code execution tools', () => {
    const html = render(
      assistant({
        content: '',
        isStreaming: true,
        toolCalls: [{ id: 'tc-2', name: 'write_file', args: {}, status: 'running' }],
      }),
    );
    expect(html).toContain('generated-files-pending');
    expect(html).not.toContain('code-execution-output');
  });

  it('renders nothing for a turn without execution metadata', () => {
    expect(render(assistant({}))).not.toContain('code-execution-output');
  });

  it('drops inline images that are not safe base64 raster data', () => {
    const html = render(
      assistant({
        metadata: {
          codeExecutionResult: {
            stdout: 'plotted',
            stderr: '',
            returnCode: 0,
            images: [{ mediaType: 'image/svg+xml', data: '<svg onload=alert(1)>' }],
          },
        },
      }),
    );
    expect(html).not.toContain('data:image/svg+xml');
    expect(html).not.toContain('alert(1)');
  });

  it('reads a malformed result without throwing', () => {
    expect(readCodeExecutionResult({ codeExecutionResult: { stdout: 7 } })).toEqual({
      stdout: '',
      stderr: '',
      returnCode: 0,
    });
    expect(readCodeExecutionResult({ codeExecutionResult: 'nope' })).toBeUndefined();
    expect(readCodeExecutionResult(undefined)).toBeUndefined();
  });
});
