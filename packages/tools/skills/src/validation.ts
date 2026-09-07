import { FrontmatterError, parseFrontmatter } from './frontmatter';

export const SKILL_DRAFT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const SKILL_DRAFT_NAME_MAX_LENGTH = 64;
export const SKILL_DRAFT_DESCRIPTION_MAX_LENGTH = 1000;
export const SKILL_DRAFT_BODY_MAX_LENGTH = 60000;

export interface SkillDraft {
  name: string;
  description: string;
  body: string;
}

export interface SkillDraftValidationResult {
  ok: boolean;
  errors: string[];
}

export function buildSkillMarkdown(draft: SkillDraft): string {
  const name = draft.name.trim();
  const description = draft.description.trim();
  const body = draft.body.trim();
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;
}

export type SkillDraftParseResult =
  | { ok: true; draft: SkillDraft }
  | { ok: false; errors: string[] };

function frontmatterString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function parseSkillDraftFromMarkdown(source: string): SkillDraftParseResult {
  let parsed: { data: Record<string, unknown>; body: string };
  try {
    parsed = parseFrontmatter(source);
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof FrontmatterError ? error.message : 'Invalid SKILL.md content.'],
    };
  }

  const name = frontmatterString(parsed.data, 'name');
  const description = frontmatterString(parsed.data, 'description');
  if (name === null && description === null) {
    return {
      ok: false,
      errors: [
        'This file has no SKILL.md frontmatter. It needs a --- block with a name and a description.',
      ],
    };
  }

  const draft: SkillDraft = {
    name: name ?? '',
    description: description ?? '',
    body: parsed.body.trim(),
  };
  const validation = validateSkillDraft(draft);
  return validation.ok ? { ok: true, draft } : { ok: false, errors: validation.errors };
}

export function validateSkillDraft(draft: SkillDraft): SkillDraftValidationResult {
  const errors: string[] = [];
  const name = draft.name.trim();
  const description = draft.description.trim();
  const body = draft.body.trim();

  if (name.length === 0) {
    errors.push('Name is required.');
  } else if (name.length > SKILL_DRAFT_NAME_MAX_LENGTH) {
    errors.push(`Name must be ${SKILL_DRAFT_NAME_MAX_LENGTH} characters or fewer.`);
  } else if (!SKILL_DRAFT_NAME_PATTERN.test(name)) {
    errors.push(
      'Name must be lowercase letters, numbers and hyphens, starting with a letter or number.',
    );
  }

  if (description.length === 0) {
    errors.push('Description is required.');
  } else if (description.length > SKILL_DRAFT_DESCRIPTION_MAX_LENGTH) {
    errors.push(`Description must be ${SKILL_DRAFT_DESCRIPTION_MAX_LENGTH} characters or fewer.`);
  }

  if (body.length === 0) {
    errors.push('Skill instructions are required.');
  } else if (body.length > SKILL_DRAFT_BODY_MAX_LENGTH) {
    errors.push(`Skill instructions must be ${SKILL_DRAFT_BODY_MAX_LENGTH} characters or fewer.`);
  }

  if (errors.length > 0) return { ok: false, errors };

  try {
    const { data } = parseFrontmatter(buildSkillMarkdown({ name, description, body }));
    if (data['name'] !== name || data['description'] !== description) {
      errors.push('Name or description could not be represented in SKILL.md frontmatter.');
    }
  } catch (error) {
    errors.push(error instanceof FrontmatterError ? error.message : 'Invalid SKILL.md content.');
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}
