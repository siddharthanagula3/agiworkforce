import { describe, expect, it } from 'vitest';
import {
  AGENT_DESCRIPTION_MAX_CHARS,
  AGENT_INSTRUCTIONS_MAX_CHARS,
  AGENT_OUTPUT_EXAMPLES_MAX_CHARS,
  AGENT_SELECTION_MAX,
  AgentImportRequestSchema,
} from '@agiworkforce/cloud-contracts';
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

  it('keeps an instruction line that looks like the examples heading', () => {
    const config = agentConfig({
      instructions: 'Review the document.\n## Output examples\nKeep this instruction paragraph.',
      outputExamples: 'Return a concise summary.',
    });
    const imported = agentFromSubagentMarkdown(agentToSubagentMarkdown(config));
    expect(imported.instructions).toBe(config.instructions);
    expect(imported.outputExamples).toBe(config.outputExamples);
  });

  it('keeps a heading-shaped line in the instructions when there are no examples', () => {
    const config = agentConfig({
      instructions: 'Intro\n## Output examples\nBody',
      outputExamples: '',
    });
    const imported = agentFromSubagentMarkdown(agentToSubagentMarkdown(config));
    expect(imported.instructions).toBe(config.instructions);
    expect(imported.outputExamples).toBe('');
  });

  it('keeps heading-shaped lines in the examples and in fenced code, escaped or not', () => {
    const config = agentConfig({
      instructions: '```md\n## Output examples\n```\n\\## Output examples\nafter',
      outputExamples: 'First\n## Output examples\n\\\\## Output examples\nLast',
    });
    const imported = agentFromSubagentMarkdown(agentToSubagentMarkdown(config));
    expect(imported.instructions).toBe(config.instructions);
    expect(imported.outputExamples).toBe(config.outputExamples);
  });

  it('does not split on the heading text inside a line', () => {
    const config = agentConfig({
      instructions: 'Write a section titled ## Output examples when asked.',
      outputExamples: '',
    });
    const imported = agentFromSubagentMarkdown(agentToSubagentMarkdown(config));
    expect(imported.instructions).toBe(config.instructions);
    expect(imported.outputExamples).toBe('');
  });

  it('refuses a hand-written file with two examples headings instead of dropping text', () => {
    expect(() =>
      agentFromSubagentMarkdown(
        '---\nname: helper\n---\nDo it.\n\n## Output examples\n\nOne\n\n## Output examples\n\nTwo',
      ),
    ).toThrow(AgentMarkdownError);
  });

  it('admits the largest export the agent contract allows through the import envelope', () => {
    const marker = '## Output examples\n';
    const config = agentConfig({
      description: 'd'.repeat(AGENT_DESCRIPTION_MAX_CHARS),
      instructions: marker.repeat(Math.floor(AGENT_INSTRUCTIONS_MAX_CHARS / marker.length)),
      outputExamples: marker.repeat(Math.floor(AGENT_OUTPUT_EXAMPLES_MAX_CHARS / marker.length)),
      skillNames: Array.from({ length: AGENT_SELECTION_MAX }, (_, index) =>
        `${index}`.padEnd(200, 's'),
      ),
    });
    const markdown = agentToSubagentMarkdown(config);
    expect(AgentImportRequestSchema.safeParse({ markdown }).success).toBe(true);
    expect(agentFromSubagentMarkdown(markdown).instructions).toBe(config.instructions.trim());
  });

  it('builds a filesystem-safe slug', () => {
    expect(agentSlug('Café: Ops / Finance!')).toBe('cafe-ops-finance');
    expect(agentSlug('***')).toBe('agent');
  });
});
