import { EXPLICIT_ARTIFACT_MARKERS } from '@agiworkforce/artifacts';
import { withoutArtifactMarker } from '../artifactMarker';

describe('withoutArtifactMarker', () => {
  it.each(EXPLICIT_ARTIFACT_MARKERS)('drops a first line that is only %s', (marker) => {
    expect(withoutArtifactMarker(`${marker}\nbody line`)).toBe('body line');
    expect(withoutArtifactMarker(`  ${marker}  \nbody line`)).toBe('body line');
  });

  it('keeps content whose first line is not a marker', () => {
    expect(withoutArtifactMarker('<main>\n<!-- @artifact -->\n</main>')).toBe(
      '<main>\n<!-- @artifact -->\n</main>',
    );
    expect(withoutArtifactMarker('# Plan')).toBe('# Plan');
  });

  it('gives empty text for content that is only the marker', () => {
    expect(withoutArtifactMarker('<!-- @artifact -->')).toBe('');
  });
});
