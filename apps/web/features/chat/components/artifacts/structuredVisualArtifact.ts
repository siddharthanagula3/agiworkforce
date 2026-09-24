import type { ArtifactType } from '@agiworkforce/types';

import {
  classifyVisualIntent,
  type StructuredVisualKind,
  type VisualIntentDecision,
  type VisualIntentInput,
} from '../../lib/visual-intent';

export type StructuredVisualArtifactType = Extract<ArtifactType, 'mermaid' | 'svg' | 'html'>;

export interface StructuredVisualArtifactTarget {
  readonly artifactType: StructuredVisualArtifactType;
  /**
   * The fence language `deriveArtifacts` reads. A language it does not map is
   * rendered as code, so these must stay inside `detectArtifactType`.
   */
  readonly fenceLanguage: string;
  readonly directive: string;
}

const TARGETS: Readonly<Record<StructuredVisualKind, StructuredVisualArtifactTarget>> = {
  diagram: {
    artifactType: 'mermaid',
    fenceLanguage: 'mermaid',
    directive:
      'Answer with a Mermaid diagram in a single ```mermaid code block. Put %% @artifact on the first line, and keep the labels short enough to read at panel width.',
  },
  chart: {
    artifactType: 'svg',
    fenceLanguage: 'svg',
    directive:
      'Answer with one self-contained ```svg code block plotting the data. Put <!-- @artifact --> on the first line, include axis labels, tick values and a legend, and use currentColor for text and strokes so it reads in both themes.',
  },
  vector: {
    artifactType: 'svg',
    fenceLanguage: 'svg',
    directive:
      'Answer with one self-contained ```svg code block. Put <!-- @artifact --> on the first line, and use currentColor for text and strokes so it reads in both themes.',
  },
  interactive: {
    artifactType: 'html',
    fenceLanguage: 'html',
    directive:
      'Answer with one self-contained ```html code block. Put <!-- @artifact --> on the first line, inline every style and script, and load nothing from the network.',
  },
};

export function structuredVisualArtifactTarget(
  kind: StructuredVisualKind,
): StructuredVisualArtifactTarget {
  return TARGETS[kind];
}

export type VisualRoute =
  | { readonly destination: 'image-generation'; readonly decision: VisualIntentDecision }
  | {
      readonly destination: 'artifact';
      readonly decision: VisualIntentDecision;
      readonly target: StructuredVisualArtifactTarget;
      readonly prompt: string;
    };

/**
 * The one decision between the Artifacts system and the raster media route.
 * A diagram or chart request never reaches a photorealistic image model.
 */
export function routeVisualRequest(input: VisualIntentInput): VisualRoute {
  const decision = classifyVisualIntent(input);
  if (decision.destination === 'image-generation' || decision.structuredKind === null) {
    return { destination: 'image-generation', decision };
  }
  const target = structuredVisualArtifactTarget(decision.structuredKind);
  return {
    destination: 'artifact',
    decision,
    target,
    prompt: `${input.prompt.trim()}\n\n${target.directive}`,
  };
}
