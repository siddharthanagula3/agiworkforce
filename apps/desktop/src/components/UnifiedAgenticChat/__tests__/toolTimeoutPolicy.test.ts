import { describe, expect, it } from 'vitest';
import { resolveToolHardTimeoutMs, shouldAbortGenerationOnToolTimeout } from '../toolTimeoutPolicy';

describe('tool timeout policy', () => {
  it('uses short timeout and abort recovery for fast filesystem discovery tools', () => {
    expect(resolveToolHardTimeoutMs('file_read')).toBe(10_000);
    expect(resolveToolHardTimeoutMs('file_list')).toBe(10_000);
    expect(resolveToolHardTimeoutMs('mcp__filesystem__list_directory')).toBe(10_000);
    expect(resolveToolHardTimeoutMs('mcp__filesystem__list_allowed_directories')).toBe(10_000);
    expect(resolveToolHardTimeoutMs('mcp__filesystem__read_text_file')).toBe(10_000);
    expect(shouldAbortGenerationOnToolTimeout('file_read')).toBe(true);
    expect(shouldAbortGenerationOnToolTimeout('file_list')).toBe(true);
    expect(shouldAbortGenerationOnToolTimeout('mcp__filesystem__list_directory')).toBe(true);
    expect(shouldAbortGenerationOnToolTimeout('mcp__filesystem__list_allowed_directories')).toBe(
      true,
    );
    expect(shouldAbortGenerationOnToolTimeout('mcp__filesystem__read_text_file')).toBe(true);
  });

  it('allows long runtime for terminal and document creation tools', () => {
    expect(resolveToolHardTimeoutMs('terminal_execute')).toBe(300_000);
    expect(resolveToolHardTimeoutMs('document_create_pdf')).toBe(300_000);
    expect(shouldAbortGenerationOnToolTimeout('terminal_execute')).toBe(false);
  });

  it('uses default timeout for general tools', () => {
    expect(resolveToolHardTimeoutMs('browser_navigate')).toBe(120_000);
    expect(shouldAbortGenerationOnToolTimeout('browser_navigate')).toBe(false);
  });
});
