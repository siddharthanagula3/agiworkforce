import { describe, expect, it } from 'vitest';

import { chartHoverText } from '@agiworkforce/unified-chat';

import {
  editableDocumentFromReply,
  groupGeneratedImageOutputs,
  interactiveCardsForTurn,
  logoConceptArtifact,
} from './turn-artifacts';

const DOCUMENT_REQUEST =
  'Create an editable document titled AGIWorkforce QA Report with five sections: Executive Summary, Features Tested, Confirmed Bugs, Reproduction Steps, Recommended Fixes. Include one short sentence under each heading. Open it in the artifact panel if supported.';

const DOCUMENT_REPLY = [
  'I do not have a tool for the artifact panel, so here it is:',
  '',
  '# AGIWorkforce QA Report',
  '',
  '## Executive Summary',
  '',
  'The chat render was checked.',
  '',
  '## Features Tested',
  '',
  'Artifacts and copy were checked.',
  '',
  '## Confirmed Bugs',
  '',
  'Two charts appeared.',
  '',
  '## Reproduction Steps',
  '',
  'Send the prompt again.',
  '',
  '## Recommended Fixes',
  '',
  'Keep one chart.',
].join('\n');

describe('editable document promotion', () => {
  it('opens the five requested sections when the reply is ordinary markdown', () => {
    const document = editableDocumentFromReply(DOCUMENT_REQUEST, DOCUMENT_REPLY);
    expect(document?.title).toBe('AGIWorkforce QA Report');
    expect(document?.content).toContain('## Executive Summary');
    expect(document?.content).toContain('## Features Tested');
    expect(document?.content).toContain('## Confirmed Bugs');
    expect(document?.content).toContain('## Reproduction Steps');
    expect(document?.content).toContain('## Recommended Fixes');
  });

  it('does not promote a reply that is already a marked document artifact', () => {
    const marked = '```markdown\n<!-- @artifact -->\n# Plan\n\n## Scope\n\nDone.\n```';
    expect(editableDocumentFromReply(DOCUMENT_REQUEST, marked)).toBeNull();
  });
});

describe('logo concept fallback', () => {
  const request =
    'Show three separate visual design concepts for a simple blue square logo, as a browsable gallery or carousel if supported.';

  it('builds three blue-square slides when image generation failed', () => {
    const artifact = logoConceptArtifact({
      userText: request,
      assistant: 'The images could not be generated.',
      artifacts: [
        {
          id: 'empty',
          type: 'html',
          title: 'Blue square logo concepts',
          content: '<div class="carousel"><img alt="" /><button>Next</button></div>',
        },
      ],
    });
    expect(artifact?.id).toBe('empty');
    expect(artifact?.content).toContain('id="next"');
    expect(artifact?.content.match(/<svg\b/g)).toHaveLength(3);
  });

  it('leaves a reply that already contains svg fences to the gallery renderer', () => {
    expect(
      logoConceptArtifact({
        userText: request,
        assistant: '```svg\n<svg xmlns="http://www.w3.org/2000/svg"></svg>\n```',
        artifacts: [],
      }),
    ).toBeNull();
  });
});

describe('chart and map display', () => {
  it('names a bar by its month and value', () => {
    expect(chartHoverText('February', 25)).toBe('February: 25');
  });

  it('presents matching image bytes once while preserving aliases and distinct charts', () => {
    const image = (id: string, checksumSha256?: string) => ({
      id,
      uri: `/api/files/${id}`,
      kind: 'image',
      mimeType: 'image/png',
      checksumSha256,
    });
    const first = image('monthly-sales', 'a'.repeat(64));
    const alias = image('chart', 'a'.repeat(64));
    const distinct = image('chart-2', 'b'.repeat(64));
    expect(groupGeneratedImageOutputs([first, alias, distinct])).toEqual({
      images: [first, distinct],
      aliases: [alias],
    });
  });

  it('never deduplicates by filename, an absent hash or a malformed hash', () => {
    const image = (id: string, checksumSha256?: string) => ({
      id,
      fileName: 'chart.png',
      uri: `/api/files/${id}`,
      kind: 'image',
      mimeType: 'image/png',
      checksumSha256,
    });
    const files = [image('one'), image('two'), image('three', 'bad'), image('four', 'bad')];
    expect(groupGeneratedImageOutputs(files)).toEqual({ images: files, aliases: [] });
  });

  it('drops a map card when the turn failed', () => {
    const cards = [
      { recognized: true, kind: 'map-search.v1' },
      { recognized: true, kind: 'clarify.v1' },
    ];
    expect(interactiveCardsForTurn(cards, true).map((card) => card.kind)).toEqual(['clarify.v1']);
    expect(interactiveCardsForTurn(cards, false)).toHaveLength(2);
  });
});
