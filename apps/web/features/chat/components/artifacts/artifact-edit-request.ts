import type { ArtifactPickerSelection } from '@/lib/artifact-sandbox';

const MAX_INSTRUCTION_CHARS = 2_000;

export function normalizeEditInstruction(value: string): string {
  return value.trim().slice(0, MAX_INSTRUCTION_CHARS);
}

/**
 * The chat turn "Request edits" sends: which artifact, which element (its
 * CSS path, text and markup as the sandbox reported them), the change, and
 * the reply shape that makes the answer a new version of the same artifact.
 * Keeping the title is what links the reply to this artifact's versions.
 */
export function buildArtifactEditRequest(input: {
  title: string;
  selection: ArtifactPickerSelection;
  instruction: string;
}): string {
  const lines = [
    `Edit the artifact "${input.title}". Change only the selected element as described and keep everything else as it is, including the title.`,
    '',
    'Selected element:',
    `- CSS path: ${input.selection.selector}`,
  ];
  if (input.selection.text) lines.push(`- Text: "${input.selection.text}"`);
  if (input.selection.html) {
    lines.push('- Markup:', '```html', input.selection.html.replace(/`{3,}/g, '``'), '```');
  }
  lines.push(
    '',
    `Requested change: ${normalizeEditInstruction(input.instruction)}`,
    '',
    'Reply with the complete updated artifact in one fenced block with the artifact marker on its first line.',
  );
  return lines.join('\n');
}

export const MARKDOWN_ARTIFACT_MARKER = '<!-- @artifact -->';

export function artifactReplyFormat(type: string | undefined): string {
  if (type === 'document') {
    return `Reply with the complete updated document in one \`\`\`markdown fenced block whose first line is ${MARKDOWN_ARTIFACT_MARKER}.`;
  }
  if (type === 'presentation') {
    return `Reply with the complete updated presentation in one \`\`\`markdown fenced block whose first line is ${MARKDOWN_ARTIFACT_MARKER}, keeping its <!-- deck --> line, with slides separated by --- lines.`;
  }
  return 'Reply with the complete updated artifact in one fenced block with the artifact marker on its first line.';
}
