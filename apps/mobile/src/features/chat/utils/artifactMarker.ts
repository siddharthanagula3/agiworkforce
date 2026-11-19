import { EXPLICIT_ARTIFACT_MARKERS } from '@agiworkforce/artifacts';

const MARKERS: ReadonlySet<string> = new Set(EXPLICIT_ARTIFACT_MARKERS);

export function withoutArtifactMarker(content: string): string {
  const newline = content.indexOf('\n');
  const firstLine = newline === -1 ? content : content.slice(0, newline);
  if (!MARKERS.has(firstLine.trim())) return content;
  return newline === -1 ? '' : content.slice(newline + 1);
}
