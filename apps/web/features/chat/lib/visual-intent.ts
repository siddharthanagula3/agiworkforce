export type VisualIntentDestination = 'artifact' | 'image-generation';

export type StructuredVisualKind = 'diagram' | 'chart' | 'vector' | 'interactive';

export type VisualIntentReason =
  | 'explicit-destination'
  | 'source-image'
  | 'structured-signal'
  | 'photographic-medium'
  | 'no-signal';

export interface VisualIntentInput {
  readonly prompt: string;
  /** An edit always needs the raster pipeline: no artifact can consume the source bytes. */
  readonly hasSourceImage?: boolean;
  readonly requestedDestination?: VisualIntentDestination;
}

export interface VisualIntentDecision {
  readonly destination: VisualIntentDestination;
  readonly structuredKind: StructuredVisualKind | null;
  readonly reason: VisualIntentReason;
  readonly signals: readonly string[];
}

const DIAGRAM_SIGNALS = [
  'flowchart',
  'flow chart',
  'sequence diagram',
  'class diagram',
  'er diagram',
  'entity relationship diagram',
  'entity relationship model',
  'state diagram',
  'state machine',
  'architecture diagram',
  'system diagram',
  'network diagram',
  'block diagram',
  'process diagram',
  'swimlane',
  'uml',
  'mind map',
  'mindmap',
  'org chart',
  'organisation chart',
  'organization chart',
  'organizational chart',
  'gantt chart',
  'venn diagram',
  'tree diagram',
  'decision tree',
  'dependency graph',
  'call graph',
  'mermaid',
  'diagram',
] as const;

const CHART_SIGNALS = [
  'bar chart',
  'bar graph',
  'line chart',
  'line graph',
  'pie chart',
  'donut chart',
  'doughnut chart',
  'area chart',
  'stacked chart',
  'scatter plot',
  'scatterplot',
  'bubble chart',
  'histogram',
  'box plot',
  'candlestick chart',
  'time series chart',
  'trend chart',
  'data visualisation',
  'data visualization',
  'plot the data',
  'plot this data',
  'graph the data',
  'graph this data',
  'chart the data',
  'chart this data',
  'chart',
] as const;

const VECTOR_SIGNALS = ['svg', 'vector graphic', 'vector illustration', 'vector icon'] as const;

const INTERACTIVE_SIGNALS = [
  'html page',
  'html mockup',
  'html prototype',
  'interactive chart',
  'interactive diagram',
  'interactive visualisation',
  'interactive visualization',
  'clickable prototype',
  'wireframe',
] as const;

/**
 * These name the output medium, so they beat a structured noun: a photo of a
 * whiteboard flowchart is still a photo.
 */
const PHOTOGRAPHIC_MEDIUM_SIGNALS = [
  'photo',
  'photograph',
  'photorealistic',
  'photo realistic',
  'hyperrealistic',
  'hyper realistic',
  'dslr',
  'bokeh',
  'studio lighting',
  'product shot',
  'cinematic',
  'film still',
  'oil painting',
  'watercolour',
  'watercolor',
  'acrylic painting',
  'concept art',
  'digital painting',
  '3d render',
  'octane render',
  'unreal engine',
  'anime',
  'manga',
  'pixel art',
  'album cover',
  'movie poster',
  'wallpaper',
  'sticker',
  'headshot',
  'portrait of',
  'selfie',
] as const;

const NORMALIZE_RE = /[^a-z0-9]+/g;

function normalize(prompt: string): string {
  return ` ${prompt.toLowerCase().replace(NORMALIZE_RE, ' ').trim()} `;
}

function matches(haystack: string, phrases: readonly string[]): string[] {
  return phrases.filter(
    (phrase) => haystack.includes(` ${phrase} `) || haystack.includes(` ${phrase}s `),
  );
}

interface StructuredMatch {
  readonly kind: StructuredVisualKind;
  readonly signals: readonly string[];
}

function structuredMatch(text: string): StructuredMatch | null {
  const interactive = matches(text, INTERACTIVE_SIGNALS);
  if (interactive.length > 0) return { kind: 'interactive', signals: interactive };
  const diagram = matches(text, DIAGRAM_SIGNALS);
  if (diagram.length > 0) return { kind: 'diagram', signals: diagram };
  const chart = matches(text, CHART_SIGNALS);
  if (chart.length > 0) return { kind: 'chart', signals: chart };
  const vector = matches(text, VECTOR_SIGNALS);
  if (vector.length > 0) return { kind: 'vector', signals: vector };
  return null;
}

function decision(
  destination: VisualIntentDestination,
  structuredKind: StructuredVisualKind | null,
  reason: VisualIntentReason,
  signals: readonly string[],
): VisualIntentDecision {
  return { destination, structuredKind, reason, signals };
}

/**
 * Decides whether a visual request belongs to the Artifacts system or to the
 * raster media-generation route. Without this the image composer sends every
 * request, diagram or not, to a photorealistic model.
 */
export function classifyVisualIntent(input: VisualIntentInput): VisualIntentDecision {
  const text = normalize(input.prompt);
  const structured = structuredMatch(text);

  if (input.requestedDestination === 'artifact') {
    return decision(
      'artifact',
      structured?.kind ?? 'diagram',
      'explicit-destination',
      structured?.signals ?? [],
    );
  }
  if (input.requestedDestination === 'image-generation') {
    return decision('image-generation', null, 'explicit-destination', []);
  }

  if (input.hasSourceImage === true) {
    return decision('image-generation', null, 'source-image', []);
  }

  const photographic = matches(text, PHOTOGRAPHIC_MEDIUM_SIGNALS);
  if (photographic.length > 0) {
    return decision('image-generation', null, 'photographic-medium', photographic);
  }

  if (structured) {
    return decision('artifact', structured.kind, 'structured-signal', structured.signals);
  }

  return decision('image-generation', null, 'no-signal', []);
}
