import { describe, it, expect } from 'vitest';
import { detectCodeBlock } from './ToolCallCard';

describe('detectCodeBlock', () => {
  it('returns null when no parameters supplied', () => {
    expect(detectCodeBlock('execute_code', undefined)).toBeNull();
  });

  it('returns null for non-code tools even with a code field', () => {
    expect(detectCodeBlock('web_search', { code: 'print(1)' })).toBeNull();
    expect(detectCodeBlock('file_read', { code: 'print(1)', language: 'python' })).toBeNull();
  });

  it('detects execute_code with explicit language and code', () => {
    const result = detectCodeBlock('execute_code', { language: 'python', code: 'print("hi")' });
    expect(result).toEqual({ language: 'python', code: 'print("hi")' });
  });

  it('detects code_execute (snake_case variant)', () => {
    const result = detectCodeBlock('code_execute', {
      language: 'javascript',
      code: 'console.log(1)',
    });
    expect(result).toEqual({ language: 'javascript', code: 'console.log(1)' });
  });

  it('falls back to python when no language field is present', () => {
    const result = detectCodeBlock('execute_code', { code: 'print("hi")' });
    expect(result?.language).toBe('python');
    expect(result?.code).toBe('print("hi")');
  });

  it('falls back to command field when code field is absent', () => {
    const result = detectCodeBlock('computer', { command: 'ls -la', language: 'bash' });
    expect(result).toEqual({ language: 'bash', code: 'ls -la' });
  });

  it('returns null when no code or command field present', () => {
    expect(detectCodeBlock('execute_code', { language: 'python' })).toBeNull();
  });

  it('detects tools matching execute in the name', () => {
    const result = detectCodeBlock('jupyter_execute', { language: 'python', code: 'x = 1' });
    expect(result).toEqual({ language: 'python', code: 'x = 1' });
  });
});
