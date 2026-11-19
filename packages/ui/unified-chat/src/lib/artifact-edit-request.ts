import { MAX_INSIGHTS, MAX_KPI_TILES } from './deck-insights';

export interface ArtifactEditSelection {
  selector: string;
  text: string;
  html: string;
}

const MAX_INSTRUCTION_CHARS = 2_000;
export const MAX_INLINE_DOCUMENT_CHARS = 24_000;

export function normalizeEditInstruction(value: string): string {
  return value.trim().slice(0, MAX_INSTRUCTION_CHARS);
}

// The reply keeps the title because the title links it to this artifact's versions.
export function buildArtifactEditRequest(input: {
  title: string;
  selection: ArtifactEditSelection;
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

const DECK_BLOCK_FORMAT =
  `A slide shows headline numbers as tiles in a \`\`\`kpi fence with one "Label | Value | optional note" line per tile, at most ${MAX_KPI_TILES}, ` +
  `and its takeaways in an \`\`\`insights fence with one bullet per line, at most ${MAX_INSIGHTS}.`;

export function artifactReplyFormat(type: string | undefined): string {
  if (type === 'document') {
    return `Reply with the complete updated document in one \`\`\`markdown fenced block whose first line is ${MARKDOWN_ARTIFACT_MARKER}.`;
  }
  if (type === 'presentation') {
    return `Reply with the complete updated presentation in one \`\`\`markdown fenced block whose first line is ${MARKDOWN_ARTIFACT_MARKER}, keeping its <!-- deck --> line, with slides separated by --- lines. ${DECK_BLOCK_FORMAT}`;
  }
  return 'Reply with the complete updated artifact in one fenced block with the artifact marker on its first line.';
}
