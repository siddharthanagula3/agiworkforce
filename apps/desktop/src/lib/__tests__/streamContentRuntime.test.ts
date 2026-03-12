import { describe, expect, it } from 'vitest';
import {
  buildRunningToolArtifactPatch,
  buildTerminalToolArtifactPatch,
  buildThinkingContentPlan,
  parseToolArguments,
  parseToolResultData,
} from '../streamContentRuntime';

describe('streamContentRuntime', () => {
  it('builds deterministic thinking plans for start, delta, and complete events', () => {
    expect(buildThinkingContentPlan('start', 'ignored')).toEqual({ clear: true });
    expect(buildThinkingContentPlan('delta', 'step one')).toEqual({
      clear: false,
      append: 'step one',
    });
    expect(buildThinkingContentPlan('delta', '')).toEqual({ clear: false });
    expect(buildThinkingContentPlan('complete', 'final reasoning')).toEqual({
      clear: true,
      append: 'final reasoning',
    });
  });

  it('parses tool-call arguments and builds a running artifact patch', () => {
    expect(parseToolArguments('{\"prompt\":\"Generate image\",\"output_path\":\"/tmp/out.png\"}'))
      .toEqual({
        prompt: 'Generate image',
        output_path: '/tmp/out.png',
      });

    expect(buildRunningToolArtifactPatch('image.generate', '{\"file_path\":\"src/app.ts\"}')).toMatchObject({
      toolName: 'image.generate',
      status: 'running',
      filePath: 'src/app.ts',
    });
  });

  it('builds terminal artifact patches from structured or raw tool results', () => {
    expect(parseToolResultData('plain text')).toEqual({ raw_result: 'plain text' });
    expect(parseToolResultData('{\"url\":\"https://example.com/image.png\"}')).toEqual({
      url: 'https://example.com/image.png',
    });

    expect(
      buildTerminalToolArtifactPatch({
        toolName: 'image.generate',
        success: false,
        result: 'generation failed',
      }),
    ).toMatchObject({
      toolName: 'image.generate',
      status: 'failed',
      success: false,
      error: 'generation failed',
      content: 'generation failed',
    });
  });
});
