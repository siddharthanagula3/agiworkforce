/**
 * Starter templates for new projects.
 *
 * ON SCOPE — these are BUILT-IN and read-only. There is deliberately no
 * user-defined template CRUD, because the product already has that feature
 * under another name: `POST /api/projects/[id]/duplicate` copies a project's
 * instructions, settings, and knowledge files while leaving conversations
 * behind, which is exactly what "save this project as a template" would do. A
 * second subsystem storing name + instructions would be a parallel
 * implementation of the same behaviour, with its own table and its own drift.
 *
 * What duplicate CANNOT do is help someone with no project yet — the empty
 * state, where a user faces a blank "Instructions" box and no idea what belongs
 * in it. That is the gap these fill.
 *
 * Every template only pre-fills fields the create form already sends. Applying
 * one is not special-cased anywhere: it writes the same `name`, `description`,
 * and `instructions` a user could have typed, so a template can never produce a
 * project the user could not have made by hand.
 */

export interface ProjectTemplate {
  id: string;
  /** Shown on the template chip. */
  label: string;
  /** One line explaining who it is for. */
  summary: string;
  /** Pre-filled project name. The user can still edit it before creating. */
  name: string;
  description: string;
  instructions: string;
}

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    id: 'blank',
    label: 'Blank',
    summary: 'Start with nothing pre-filled.',
    name: '',
    description: '',
    instructions: '',
  },
  {
    id: 'research',
    label: 'Research',
    summary: 'Gather sources and build up findings on a topic.',
    name: 'Research',
    description: 'Ongoing research with sources and notes.',
    instructions: [
      'You are helping with ongoing research.',
      '',
      '- Cite a source for every factual claim, and link it.',
      '- When sources disagree, say so explicitly rather than picking one silently.',
      '- Distinguish what the sources establish from what you are inferring.',
      '- If the uploaded files already answer the question, use them before searching.',
    ].join('\n'),
  },
  {
    id: 'writing',
    label: 'Writing',
    summary: 'Drafting and editing with a consistent voice.',
    name: 'Writing',
    description: 'Drafts, edits, and a consistent voice.',
    instructions: [
      'You are helping write and edit prose.',
      '',
      '- Match the voice of the samples in this project rather than a generic house style.',
      '- Prefer concrete detail over adjectives.',
      '- When editing, show what changed and why; do not silently rewrite.',
      '- Keep the structure the draft already has unless asked to restructure.',
    ].join('\n'),
  },
  {
    id: 'engineering',
    label: 'Engineering',
    summary: 'Work on a codebase with its conventions in context.',
    name: 'Engineering',
    description: 'A codebase, its conventions, and its constraints.',
    instructions: [
      'You are helping work on a codebase.',
      '',
      '- Follow the conventions in the uploaded files rather than defaults.',
      '- Show the smallest change that solves the problem.',
      '- State assumptions about behaviour you cannot verify from the files here.',
      '- Flag anything that would need a migration, a config change, or a new dependency.',
    ].join('\n'),
  },
  {
    id: 'meetings',
    label: 'Meeting notes',
    summary: 'Summarise discussions and track what was decided.',
    name: 'Meeting notes',
    description: 'Summaries, decisions, and follow-ups.',
    instructions: [
      'You are helping with meeting notes.',
      '',
      '- Separate decisions from discussion, and name the owner of each action.',
      '- Record open questions as open, rather than resolving them yourself.',
      '- Keep attributions to what the notes actually say.',
    ].join('\n'),
  },
];

/** Lookup by id; `undefined` for an unknown id rather than a silent fallback. */
export function getProjectTemplate(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((template) => template.id === id);
}
