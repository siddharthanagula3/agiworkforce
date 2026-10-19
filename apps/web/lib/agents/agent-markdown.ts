import {
  AGENT_DESCRIPTION_MAX_CHARS,
  AGENT_INSTRUCTIONS_MAX_CHARS,
  AGENT_NAME_MAX_CHARS,
  AGENT_OUTPUT_EXAMPLES_MAX_CHARS,
  type AgentConfig,
  type AgentCreateRequest,
} from '@agiworkforce/cloud-contracts';
import { parseFrontmatter } from '@agiworkforce/skills';
import { getModelMetadataById, isAutoModeModelId } from '@agiworkforce/types';

import { agentSlug } from './agent-slug';

export { agentSlug };

const OUTPUT_EXAMPLES_HEADING = '## Output examples';
const INHERIT_MODEL = 'inherit';

const ACCENT_TO_SUBAGENT_COLOR: Readonly<Record<string, string>> = {
  emerald: 'green',
  sky: 'blue',
  amber: 'yellow',
  rose: 'red',
  violet: 'purple',
};

const SUBAGENT_COLOR_TO_ACCENT: Readonly<Record<string, string>> = {
  green: 'emerald',
  blue: 'sky',
  cyan: 'sky',
  yellow: 'amber',
  orange: 'amber',
  red: 'rose',
  pink: 'rose',
  purple: 'violet',
};

export class AgentMarkdownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentMarkdownError';
  }
}

function yamlString(value: string): string {
  return JSON.stringify(value.replace(/\s+/g, ' ').trim());
}

export function agentToSubagentMarkdown(config: AgentConfig): string {
  const model = config.model && !isAutoModeModelId(config.model) ? config.model : INHERIT_MODEL;
  const lines = [
    '---',
    `name: ${agentSlug(config.name)}`,
    `description: ${yamlString(config.description || config.name)}`,
    `model: ${model}`,
  ];
  const color = ACCENT_TO_SUBAGENT_COLOR[config.accentColor];
  if (color) lines.push(`color: ${color}`);
  if (config.skillNames && config.skillNames.length > 0) {
    lines.push('skills:', ...config.skillNames.map((skill) => `  - ${skill}`));
  }
  lines.push('---', '');
  const body = [config.instructions.trim()];
  if (config.outputExamples.trim()) {
    body.push('', OUTPUT_EXAMPLES_HEADING, '', config.outputExamples.trim());
  }
  return `${lines.join('\n')}\n${body.join('\n')}\n`;
}

function displayName(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function importedModel(value: unknown): string | null {
  const model = stringField(value);
  if (!model || model === INHERIT_MODEL) return null;
  if (isAutoModeModelId(model)) return model;
  return getModelMetadataById(model)?.id ?? null;
}

function importedSkills(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const names = value.filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );
    return names.length > 0 ? names.map((name) => name.trim()) : null;
  }
  const list = stringField(value);
  return list
    ? list
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    : null;
}

export function agentFromSubagentMarkdown(markdown: string): AgentCreateRequest {
  let parsed: ReturnType<typeof parseFrontmatter>;
  try {
    parsed = parseFrontmatter(markdown);
  } catch {
    throw new AgentMarkdownError('The file’s frontmatter could not be read.');
  }
  const name = displayName(stringField(parsed.data['name']) ?? '');
  if (!name) {
    throw new AgentMarkdownError(
      'The file needs a name in its frontmatter, as a Claude Code agent has.',
    );
  }
  const [instructions = '', examples = ''] = parsed.body.split(OUTPUT_EXAMPLES_HEADING);
  const accent = SUBAGENT_COLOR_TO_ACCENT[stringField(parsed.data['color']) ?? ''];
  return {
    name: name.slice(0, AGENT_NAME_MAX_CHARS),
    description: (stringField(parsed.data['description']) ?? '').slice(
      0,
      AGENT_DESCRIPTION_MAX_CHARS,
    ),
    instructions: instructions.trim().slice(0, AGENT_INSTRUCTIONS_MAX_CHARS),
    outputExamples: examples.trim().slice(0, AGENT_OUTPUT_EXAMPLES_MAX_CHARS),
    model: importedModel(parsed.data['model']),
    skillNames: importedSkills(parsed.data['skills']),
    ...(accent ? { accentColor: accent } : {}),
  };
}
