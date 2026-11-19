import { describe, expect, it } from 'vitest';
import {
  hasRunningCodeExecutionTool,
  isExecutingCode,
  readCodeExecutionResult,
  safeExecutionImageSrc,
} from './code-execution-result';

describe('code execution result', () => {
  it('reads the saved result and keeps only well formed images', () => {
    expect(
      readCodeExecutionResult({
        codeExecutionResult: {
          stdout: '1\n',
          returnCode: 2,
          images: [{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }, { mediaType: 'image/png' }],
        },
      }),
    ).toEqual({
      stdout: '1\n',
      stderr: '',
      returnCode: 2,
      images: [{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }],
    });
    expect(readCodeExecutionResult({ codeExecutionResult: 'nope' })).toBeUndefined();
    expect(readCodeExecutionResult(undefined)).toBeUndefined();
  });

  it('inlines only raster images with base64 data', () => {
    expect(safeExecutionImageSrc({ mediaType: ' IMAGE/PNG ', data: 'iVBO\nRw0K' })).toBe(
      'data:image/png;base64,iVBORw0K',
    );
    expect(safeExecutionImageSrc({ mediaType: 'image/svg+xml', data: 'PHN2Zz4=' })).toBeNull();
    expect(safeExecutionImageSrc({ mediaType: 'image/png', data: 'not base64!' })).toBeNull();
  });

  it('counts a running execute_code call only while the answer streams', () => {
    const running = {
      isStreaming: true,
      toolCalls: [{ id: 't', name: 'execute_code', status: 'running' as const, args: {} }],
    };
    expect(hasRunningCodeExecutionTool(running)).toBe(true);
    expect(hasRunningCodeExecutionTool({ ...running, isStreaming: false })).toBe(false);
    expect(isExecutingCode({ isStreaming: false, metadata: { isExecutingCode: true } })).toBe(true);
  });
});
