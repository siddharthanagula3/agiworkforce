import 'server-only';

import { z } from 'zod';
import {
  PLUGIN_DRAFT_RESULT_KEY,
  PLUGIN_DRAFT_TOOL_NAME,
  type PluginDraft,
} from '@agiworkforce/cloud-contracts';
import {
  SKILL_DRAFT_BODY_MAX_LENGTH,
  SKILL_DRAFT_DESCRIPTION_MAX_LENGTH,
  SKILL_DRAFT_NAME_MAX_LENGTH,
} from '@agiworkforce/skills';

import { authoredSkillIssues } from '@/features/plugins/server/directory/authored-plugin';
import { PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL } from '@/features/plugins/server/directory/constants';

const PLUGIN_NAME_MAX_CHARS = 200;
const PLUGIN_DESCRIPTION_MAX_CHARS = 2_000;
const PLUGIN_DRAFT_INTENT_RE =
  /\b(build|create|make|write|draft|design|turn|update|change|edit)\b[^.?!\n]{0,80}\b(plugins?|skills?)\b/i;

const PluginDraftArgs = z
  .object({
    name: z.string().trim().min(1).max(PLUGIN_NAME_MAX_CHARS),
    description: z.string().trim().min(1).max(PLUGIN_DESCRIPTION_MAX_CHARS),
    skills: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(SKILL_DRAFT_NAME_MAX_LENGTH),
            description: z.string().trim().min(1).max(SKILL_DRAFT_DESCRIPTION_MAX_LENGTH),
            instructions: z.string().trim().min(1).max(SKILL_DRAFT_BODY_MAX_LENGTH),
          })
          .strict(),
      )
      .min(1)
      .max(PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL),
  })
  .strict();

export function isPluginDraftTool(name: string): boolean {
  return name === PLUGIN_DRAFT_TOOL_NAME;
}

export function asksForPluginDraft(message: string): boolean {
  return PLUGIN_DRAFT_INTENT_RE.test(message);
}

export function pluginDraftToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: PLUGIN_DRAFT_TOOL_NAME,
      description:
        'Show the user a plugin you wrote with them, with a Save button. Use it when they ask you to build, write or change a plugin or skill. Each skill is a name in lowercase letters, numbers and hyphens, a one-sentence description of when to use it, and the instructions the model follows. Nothing is saved until the user presses Save, so call it again with the whole plugin after any change they ask for.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: PLUGIN_NAME_MAX_CHARS, description: 'Plugin name.' },
          description: {
            type: 'string',
            maxLength: PLUGIN_DESCRIPTION_MAX_CHARS,
            description: 'What the plugin is for.',
          },
          skills: {
            type: 'array',
            minItems: 1,
            maxItems: PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL,
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  maxLength: SKILL_DRAFT_NAME_MAX_LENGTH,
                  description: 'Lowercase letters, numbers and hyphens.',
                },
                description: {
                  type: 'string',
                  maxLength: SKILL_DRAFT_DESCRIPTION_MAX_LENGTH,
                  description: 'When the model should use this skill.',
                },
                instructions: {
                  type: 'string',
                  maxLength: SKILL_DRAFT_BODY_MAX_LENGTH,
                  description: 'The SKILL.md instructions, in Markdown.',
                },
              },
              required: ['name', 'description', 'instructions'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'description', 'skills'],
        additionalProperties: false,
      },
    },
  };
}

export function executePluginDraftTool(args: Record<string, unknown>): {
  content: string;
  isError: boolean;
} {
  const parsed = PluginDraftArgs.safeParse(args);
  if (!parsed.success) {
    return {
      content: `${PLUGIN_DRAFT_TOOL_NAME} was called with invalid arguments: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`)
        .join('; ')}.`,
      isError: true,
    };
  }
  const draft: PluginDraft = {
    name: parsed.data.name,
    description: parsed.data.description,
    skills: parsed.data.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      body: skill.instructions,
    })),
  };
  const issues = authoredSkillIssues(draft.skills);
  if (issues.length > 0) {
    return {
      content: `The draft cannot be saved yet: ${issues.join(' ')} Fix these and call ${PLUGIN_DRAFT_TOOL_NAME} again.`,
      isError: true,
    };
  }
  return {
    content: JSON.stringify({
      [PLUGIN_DRAFT_RESULT_KEY]: draft,
      shown: 'The user sees this plugin with a Save button. It is not saved until they press it.',
    }),
    isError: false,
  };
}
