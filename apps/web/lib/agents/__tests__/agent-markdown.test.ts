import { describe, expect, it } from 'vitest';
import { getModelsForTierAndSurface } from '@agiworkforce/types';

import {
  AgentMarkdownError,
  agentFromSubagentMarkdown,
  agentSlug,
  agentToSubagentMarkdown,
} from '../agent-markdown';
import { agentConfig } from './agent-fixtures';

describe('Claude Code subagent markdown', () => {
  it('exports the name, description, colour, skills and body in the subagent format', () => {
    const markdown = agentToSubagentMarkdown(agentConfig({ skillNames: ['pdf', 'docx'] }));
    expect(markdown).toMatch(/^---\nname: release-notes-writer\n/);
    expect(markdown).toContain('description: "Turns merged pull requests into release notes"');
    expect(markdown).toContain('model: inherit');
    expect(markdown).toContain('color: blue');
    expect(markdown).toContain('skills:\n  - pdf\n  - docx');
    expect(markdown).toContain('Group changes by area');
    expect(markdown).toContain('## Output examples');
  });

  it('round-trips an exported agent back into an equivalent draft', () => {
    const config = agentConfig({ skillNames: ['pdf'] });
    const imported = agentFromSubagentMarkdown(agentToSubagentMarkdown(config));
    expect(imported).toMatchObject({
      name: 'Release notes writer',
      description: config.description,
      instructions: config.instructions,
      outputExamples: config.outputExamples,
      accentColor: 'sky',
      skillNames: ['pdf'],
      model: null,
    });
  });

  it('imports a hand-written Claude Code agent and drops what it cannot honour', () => {
    const imported = agentFromSubagentMarkdown(
      [
        '---',
        'name: code-reviewer',
        'description: Reviews code for quality',
        'tools: Read, Glob, Grep, Bash',
        'model: sonnet',
        'mcpServers:',
        '  github:',
        '    url: https://example.invalid',
        'color: purple',
        '---',
        '',
        'You are a code reviewer.',
      ].join('\n'),
    );
    expect(imported).toEqual({
      name: 'Code reviewer',
      description: 'Reviews code for quality',
      instructions: 'You are a code reviewer.',
      outputExamples: '',
      model: null,
      skillNames: null,
      accentColor: 'violet',
    });
    expect(imported).not.toHaveProperty('connectorIds');
  });

  it('keeps a full catalog model id and refuses a file without a name', () => {
    const model = getModelsForTierAndSurface('max_15x', 'web/cloud-chat')[0];
    expect(model).toBeDefined();
    const imported = agentFromSubagentMarkdown(
      `---\nname: helper\ndescription: Helps\nmodel: ${model!.id}\n---\nHelp.`,
    );
    expect(imported.model).toBe(model!.id);
    expect(() => agentFromSubagentMarkdown('Just text')).toThrow(AgentMarkdownError);
  });

  it('carries the reasoning effort both ways and ignores a level it does not know', () => {
    const markdown = agentToSubagentMarkdown(agentConfig({ effort: 'xhigh' }));
    expect(markdown).toContain('model: inherit\neffort: xhigh\n');
    expect(agentFromSubagentMarkdown(markdown).effort).toBe('xhigh');
    expect(agentToSubagentMarkdown(agentConfig())).not.toContain('effort:');
    const unknown = agentFromSubagentMarkdown('---\nname: helper\neffort: turbo\n---\nHelp.');
    expect(unknown).not.toHaveProperty('effort');
  });

  it('builds a filesystem-safe slug', () => {
    expect(agentSlug('Café: Ops / Finance!')).toBe('cafe-ops-finance');
    expect(agentSlug('***')).toBe('agent');
  });
});
