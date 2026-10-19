import { SUPPORTED_LANGUAGES } from '@agiworkforce/i18n/languages';
import { normalizeEditInstruction } from './artifact-edit-request';

const MAX_SELECTION_CHARS = 4_000;
const CONTEXT_CHARS = 400;
export const MAX_INLINE_DOCUMENT_CHARS = 24_000;

export interface SelectionAction {
  id: string;
  label: string;
  group: string;
  instruction: string;
}

const TONES = ['Professional', 'Friendly', 'Confident', 'Casual', 'Empathetic'] as const;
const AUDIENCES = [
  { id: 'beginners', label: 'Beginners', text: 'a reader new to the subject' },
  { id: 'experts', label: 'Experts', text: 'a subject-matter expert' },
  { id: 'executives', label: 'Executives', text: 'a busy executive who wants the point first' },
  { id: 'students', label: 'Students', text: 'a high-school student' },
  { id: 'children', label: 'Children', text: 'a ten-year-old' },
] as const;

export const SELECTION_ACTIONS: readonly SelectionAction[] = [
  {
    id: 'rewrite',
    label: 'Rewrite',
    group: 'Edit',
    instruction: 'Rewrite it so it reads better, keeping the meaning.',
  },
  {
    id: 'shorten',
    label: 'Make shorter',
    group: 'Edit',
    instruction: 'Make it noticeably shorter, keeping the key points.',
  },
  {
    id: 'expand',
    label: 'Make longer',
    group: 'Edit',
    instruction: 'Expand it with more detail and explanation, in the same style.',
  },
  ...TONES.map((tone) => ({
    id: `tone-${tone.toLowerCase()}`,
    label: tone,
    group: 'Change tone',
    instruction: `Change the tone to ${tone.toLowerCase()}, keeping the meaning.`,
  })),
  ...AUDIENCES.map((audience) => ({
    id: `audience-${audience.id}`,
    label: audience.label,
    group: 'Adjust for',
    instruction: `Adapt it for ${audience.text}: adjust vocabulary, reading level and the detail explained.`,
  })),
  ...SUPPORTED_LANGUAGES.map((language) => ({
    id: `translate-${language.code}`,
    label: language.name,
    group: 'Translate to',
    instruction: `Translate it into ${language.name}.`,
  })),
];

export function selectionActionById(id: string): SelectionAction | undefined {
  return SELECTION_ACTIONS.find((action) => action.id === id);
}

export interface ArtifactSelection {
  text: string;
  before: string;
  after: string;
}

export function captureSelectionContext(source: string, selectedText: string): ArtifactSelection {
  const text = selectedText.trim().slice(0, MAX_SELECTION_CHARS);
  const index = text ? source.indexOf(text) : -1;
  if (index < 0) return { text, before: '', after: '' };
  return {
    text,
    before: source.slice(Math.max(0, index - CONTEXT_CHARS), index),
    after: source.slice(index + text.length, index + text.length + CONTEXT_CHARS),
  };
}

function fence(value: string, language = ''): string[] {
  return ['```' + language, value.replace(/`{3,}/g, '``'), '```'];
}

export function buildArtifactSelectionRequest(input: {
  title: string;
  selection: ArtifactSelection;
  instruction: string;
  scope?: string;
  currentContent?: string;
  language?: string;
}): string {
  const scope = input.scope ? ` in ${input.scope}` : '';
  const lines = [
    `Edit the artifact "${input.title}". Change only the selected passage${scope} as described and keep everything else exactly as it is, including the title.`,
    '',
    'Selected passage:',
    ...fence(input.selection.text),
  ];
  if (input.selection.before || input.selection.after) {
    lines.push(
      '',
      'It sits between:',
      ...fence(
        `${input.selection.before.trimStart()}[selection]${input.selection.after.trimEnd()}`,
      ),
    );
  }
  if (input.currentContent && input.currentContent.length <= MAX_INLINE_DOCUMENT_CHARS) {
    lines.push(
      '',
      'The artifact was edited since you last wrote it. Start from this current version:',
      ...fence(input.currentContent, input.language ?? ''),
    );
  }
  lines.push(
    '',
    `Requested change: ${normalizeEditInstruction(input.instruction)}`,
    '',
    'Reply with the complete updated artifact in one fenced block with the artifact marker on its first line.',
  );
  return lines.join('\n');
}
