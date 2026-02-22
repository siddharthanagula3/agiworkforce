import { describe, expect, it } from 'vitest';
import { resolveToolHardTimeoutMs, shouldAbortGenerationOnToolTimeout } from '../toolTimeoutPolicy';

describe('tool timeout policy', () => {
  it('uses fast metadata timeout for filesystem discovery/read tools', () => {
    expect(resolveToolHardTimeoutMs('file_read')).toBe(45_000);
    expect(resolveToolHardTimeoutMs('file_list')).toBe(45_000);
    expect(resolveToolHardTimeoutMs('mcp__filesystem__list_directory')).toBe(45_000);
    expect(resolveToolHardTimeoutMs('mcp__filesystem__list_allowed_directories')).toBe(45_000);
    expect(resolveToolHardTimeoutMs('mcp__filesystem__read_text_file')).toBe(45_000);
    expect(shouldAbortGenerationOnToolTimeout('file_read')).toBe(false);
    expect(shouldAbortGenerationOnToolTimeout('file_list')).toBe(false);
    expect(shouldAbortGenerationOnToolTimeout('mcp__filesystem__list_directory')).toBe(false);
    expect(shouldAbortGenerationOnToolTimeout('mcp__filesystem__list_allowed_directories')).toBe(
      false,
    );
    expect(shouldAbortGenerationOnToolTimeout('mcp__filesystem__read_text_file')).toBe(false);
  });

  it('allows long runtime for terminal and document creation tools', () => {
    expect(resolveToolHardTimeoutMs('terminal_execute')).toBe(600_000);
    expect(resolveToolHardTimeoutMs('document_create_pdf')).toBe(600_000);
    expect(resolveToolHardTimeoutMs('image_generate')).toBe(600_000);
    expect(resolveToolHardTimeoutMs('media_generate_image')).toBe(600_000);
    expect(resolveToolHardTimeoutMs('video_generate')).toBe(600_000);
    expect(resolveToolHardTimeoutMs('media_generate_video')).toBe(600_000);
    expect(shouldAbortGenerationOnToolTimeout('terminal_execute')).toBe(false);
  });

  it('uses default timeout for general tools', () => {
    expect(resolveToolHardTimeoutMs('browser_navigate')).toBe(180_000);
    expect(shouldAbortGenerationOnToolTimeout('browser_navigate')).toBe(false);
  });
});
