import { describe, expect, it } from 'vitest';
import { normalizeToolNameForUi } from '../chatToolUtils';
import { getToolDisplayInfo } from '../toolDisplayNames';
import { decodeBase64ToolSegment, decodeCompositeToolName } from '../toolNameEncoding';

describe('toolNameEncoding', () => {
  it('decodes individual b64 tool segments', () => {
    expect(decodeBase64ToolSegment('b64_cmVhZF9maWxl')).toBe('read_file');
  });

  it('decodes composite MCP tool names without disturbing plain segments', () => {
    expect(decodeCompositeToolName('mcp__filesystem__b64_cmVhZF9maWxl')).toBe(
      'mcp__filesystem__read_file',
    );
  });

  it('normalizes server-prefixed MCP names for the transcript UI', () => {
    expect(normalizeToolNameForUi('__server__mcp__filesystem__b64_cmVhZF9maWxl')).toBe(
      'mcp__filesystem__read_file',
    );
  });

  it('renders decoded MCP action names as readable display labels', () => {
    expect(getToolDisplayInfo('mcp__filesystem__b64_cmVhZF9maWxl')).toMatchObject({
      displayName: 'Read file',
      activeForm: 'Reading file...',
      completedForm: 'Read file',
      category: 'file',
    });
  });

  it('renders decoded fallback names when the tool is not in MCP format', () => {
    expect(getToolDisplayInfo('tool_b64_YXBpZnktc2xhc2gtcmFnLXdlYi1icm93c2Vy')).toMatchObject({
      displayName: 'Apify Slash Rag Web Browser',
      activeForm: 'Apify Slash Rag Web Browser...',
    });
  });
});
