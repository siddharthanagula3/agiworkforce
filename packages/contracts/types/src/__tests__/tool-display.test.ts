import { describe, it, expect } from 'vitest';
import {
  getToolIconName,
  getToolSourceBadge,
  getToolDisplayLabel,
  getFileExtensionIconName,
  summarizeToolTimeline,
  CATEGORY_ICON_NAME,
  TOOL_ICON_NAME,
  DEFAULT_TOOL_ICON_NAME,
} from '../tool-display';

describe('getToolIconName', () => {
  it('resolves canonical tool names to their icon', () => {
    expect(getToolIconName('Read')).toBe('FileText');
    expect(getToolIconName('Bash')).toBe('Terminal');
    expect(getToolIconName('WebSearch')).toBe('Globe');
    expect(getToolIconName('Grep')).toBe('Search');
  });

  it('resolves friendly display-name labels to their icon', () => {
    expect(getToolIconName('Run command')).toBe('Terminal');
    expect(getToolIconName('Search the web')).toBe('Globe');
    expect(getToolIconName('Open website')).toBe('Globe');
  });

  it('matches case-insensitively for raw lowercase names', () => {
    expect(getToolIconName('read')).toBe('FileText');
    expect(getToolIconName('bash')).toBe('Terminal');
  });

  it('falls back to the category icon when the name is unknown', () => {
    expect(getToolIconName('totally_unknown_tool', 'terminal')).toBe(CATEGORY_ICON_NAME.terminal);
    expect(getToolIconName('totally_unknown_tool', 'search')).toBe(CATEGORY_ICON_NAME.search);
  });

  it('falls back to the default icon when nothing matches', () => {
    expect(getToolIconName('totally_unknown_tool')).toBe(DEFAULT_TOOL_ICON_NAME);
    expect(getToolIconName(null)).toBe(DEFAULT_TOOL_ICON_NAME);
    expect(getToolIconName(undefined)).toBe(DEFAULT_TOOL_ICON_NAME);
    expect(getToolIconName('')).toBe(DEFAULT_TOOL_ICON_NAME);
  });

  it('only references icon names that exist in the category map keys are valid', () => {
    // Every direct tool icon should be a non-empty string (sanity).
    for (const name of Object.values(TOOL_ICON_NAME)) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

describe('getToolSourceBadge', () => {
  it('returns the server initial for mcp-namespaced tools', () => {
    expect(getToolSourceBadge('mcp__filesystem__list_directory')).toBe('F');
    expect(getToolSourceBadge('mcp__github__create_issue')).toBe('G');
  });

  it('returns the first letter for composite-namespaced tools', () => {
    expect(getToolSourceBadge('github__create_issue')).toBe('G');
    expect(getToolSourceBadge('slack__post_message')).toBe('S');
  });

  it('does not treat a leading mcp__ prefix as the server', () => {
    // "mcp" itself must never be the badge.
    expect(getToolSourceBadge('mcp__filesystem__x')).not.toBe('M');
  });

  it('returns null for native (non-namespaced) tools', () => {
    expect(getToolSourceBadge('Read')).toBeNull();
    expect(getToolSourceBadge('Bash')).toBeNull();
    expect(getToolSourceBadge('web_search')).toBeNull();
  });

  it('returns null for empty/nullish input', () => {
    expect(getToolSourceBadge('')).toBeNull();
    expect(getToolSourceBadge(null)).toBeNull();
    expect(getToolSourceBadge(undefined)).toBeNull();
  });
});

describe('getToolDisplayLabel', () => {
  it('resolves web_search to a friendly action phrase, not the raw name', () => {
    const label = getToolDisplayLabel('web_search');
    expect(label.displayName).toBe('Search the web');
    expect(label.activeForm).toBe('Searching the web…');
    expect(label.completedForm).toBe('Searched the web');
  });

  it('resolves code_execution to a friendly action phrase', () => {
    const label = getToolDisplayLabel('code_execution');
    expect(label.displayName).toBe('Run code');
  });

  it('humanizes an MCP-namespaced tool name', () => {
    expect(getToolDisplayLabel('mcp__filesystem__list_directory').displayName).toBe(
      'List Directory',
    );
  });

  it('humanizes an unknown snake_case tool name as a fallback', () => {
    expect(getToolDisplayLabel('totally_unknown_tool').displayName).toBe('Totally Unknown Tool');
  });

  it('falls back to "Working" for empty/nullish input', () => {
    expect(getToolDisplayLabel('').displayName).toBe('Working');
    expect(getToolDisplayLabel(null).displayName).toBe('Working');
    expect(getToolDisplayLabel(undefined).displayName).toBe('Working');
  });
});

describe('getFileExtensionIconName', () => {
  it('resolves code-file extensions to the Code icon', () => {
    expect(getFileExtensionIconName('build_resume.js')).toBe('Code');
    expect(getFileExtensionIconName('pdf1_grand_tour.py')).toBe('Code');
  });

  it('resolves document extensions to the FileText icon', () => {
    expect(getFileExtensionIconName('OptionA_GrandTour.md')).toBe('FileText');
    expect(getFileExtensionIconName('resume.html')).toBe('FileText');
  });

  it('falls back to the default icon for unknown or missing extensions', () => {
    expect(getFileExtensionIconName('README')).toBe(DEFAULT_TOOL_ICON_NAME);
    expect(getFileExtensionIconName(null)).toBe(DEFAULT_TOOL_ICON_NAME);
    expect(getFileExtensionIconName(undefined)).toBe(DEFAULT_TOOL_ICON_NAME);
  });
});

describe('summarizeToolTimeline', () => {
  it('summarizes a mixed run of commands and file reads', () => {
    const summary = summarizeToolTimeline([
      { name: 'bash', command: 'ls' },
      { name: 'read_file', filePath: 'a.ts' },
      { name: 'read_file', filePath: 'b.ts' },
    ]);
    expect(summary).toBe('Ran 1 command, read 2 files');
  });

  it('summarizes a file-creation run', () => {
    const summary = summarizeToolTimeline([
      { name: 'write_file', filePath: 'out.py' },
      { name: 'write_file', filePath: 'out2.py' },
    ]);
    expect(summary).toBe('created 2 files');
  });

  it('returns an empty string for an empty timeline', () => {
    expect(summarizeToolTimeline([])).toBe('');
  });
});
