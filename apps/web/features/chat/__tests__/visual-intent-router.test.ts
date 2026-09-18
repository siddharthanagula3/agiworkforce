import { describe, expect, it } from 'vitest';
import { detectArtifactType, isRenderableArtifact } from '@agiworkforce/artifacts';

import { classifyVisualIntent } from '../lib/visual-intent';
import {
  routeVisualRequest,
  structuredVisualArtifactTarget,
} from '../components/artifacts/structuredVisualArtifact';

const STRUCTURED_PROMPTS: ReadonlyArray<[string, string]> = [
  ['a flowchart of the signup funnel', 'diagram'],
  ['draw a sequence diagram for the payment webhook', 'diagram'],
  ['make a mind map of the launch workstreams', 'diagram'],
  ['an org chart for a 30 person company', 'diagram'],
  ['a bar chart of revenue by quarter', 'chart'],
  ['plot the data below as a line graph', 'chart'],
  ['pie chart of traffic sources', 'chart'],
  ['an svg icon of a paper plane', 'vector'],
  ['an interactive chart I can hover', 'interactive'],
  ['a wireframe of the settings page', 'interactive'],
];

const PHOTOGRAPHIC_PROMPTS: readonly string[] = [
  'a photo of a golden retriever on a beach',
  'photorealistic render of a mountain cabin at dusk',
  'an oil painting of a harbour at sunrise',
  'anime portrait of a swordsman',
  'a product shot of a ceramic mug on linen',
  'movie poster for a heist film',
];

describe('classifyVisualIntent', () => {
  it.each(STRUCTURED_PROMPTS)('routes %j to the artifacts system', (prompt, kind) => {
    const decision = classifyVisualIntent({ prompt });
    expect(decision.destination).toBe('artifact');
    expect(decision.structuredKind).toBe(kind);
    expect(decision.reason).toBe('structured-signal');
    expect(decision.signals.length).toBeGreaterThan(0);
  });

  it.each(PHOTOGRAPHIC_PROMPTS)('routes %j to media generation', (prompt) => {
    const decision = classifyVisualIntent({ prompt });
    expect(decision.destination).toBe('image-generation');
    expect(decision.structuredKind).toBeNull();
  });

  it('keeps a photo of a diagram on the raster route', () => {
    const decision = classifyVisualIntent({
      prompt: 'a photo of a whiteboard covered in a flowchart',
    });
    expect(decision.destination).toBe('image-generation');
    expect(decision.reason).toBe('photographic-medium');
  });

  it('sends an edit of an uploaded image to the raster route whatever the words say', () => {
    const decision = classifyVisualIntent({
      prompt: 'turn this into a flowchart',
      hasSourceImage: true,
    });
    expect(decision.destination).toBe('image-generation');
    expect(decision.reason).toBe('source-image');
  });

  it('obeys an explicit destination over the prompt text', () => {
    expect(
      classifyVisualIntent({
        prompt: 'a photorealistic cabin',
        requestedDestination: 'artifact',
      }).destination,
    ).toBe('artifact');
    expect(
      classifyVisualIntent({
        prompt: 'a flowchart of the signup funnel',
        requestedDestination: 'image-generation',
      }).destination,
    ).toBe('image-generation');
  });

  it('leaves a prompt with no visual signal on the raster route', () => {
    const decision = classifyVisualIntent({ prompt: 'a cat wearing a tiny hat' });
    expect(decision.destination).toBe('image-generation');
    expect(decision.reason).toBe('no-signal');
  });
});

describe('routeVisualRequest', () => {
  it('carries the artifact target and appends its directive to the prompt', () => {
    const route = routeVisualRequest({ prompt: 'a flowchart of the signup funnel' });
    expect(route.destination).toBe('artifact');
    if (route.destination !== 'artifact') throw new Error('expected an artifact route');
    expect(route.target.artifactType).toBe('mermaid');
    expect(route.prompt).toContain('a flowchart of the signup funnel');
    expect(route.prompt).toContain(route.target.directive);
  });

  it('returns no artifact target for a photorealistic request', () => {
    const route = routeVisualRequest({ prompt: 'a photo of a golden retriever' });
    expect(route.destination).toBe('image-generation');
    expect(route).not.toHaveProperty('target');
  });

  it.each(['diagram', 'chart', 'vector', 'interactive'] as const)(
    'gives %s a fence language the artifact deriver renders',
    (kind) => {
      const target = structuredVisualArtifactTarget(kind);
      const samples: Record<string, string> = {
        mermaid: 'graph TD; a-->b;',
        svg: '<svg></svg>',
        html: '<!DOCTYPE html><html><body></body></html>',
      };
      const sample = samples[target.fenceLanguage] ?? '';
      expect(detectArtifactType(target.fenceLanguage, sample)).toBe(target.artifactType);
      expect(isRenderableArtifact(target.fenceLanguage, sample)).toBe(true);
    },
  );
});
