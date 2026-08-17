import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArtifactPanel } from '../ArtifactPanel';
import type { Artifact } from '../../lib/types';

vi.mock('../artifact-components/ReactPreview', () => ({
  ReactPreview: () => <div data-testid="stub-react-preview" />,
  buildReactPreviewDocument: vi.fn(),
}));

const panelSource = readFileSync(
  join(process.cwd(), 'src', 'components', 'ArtifactPanel.tsx'),
  'utf8',
);

function makeArtifact(overrides: Partial<Artifact> & { type: Artifact['type'] }): Artifact {
  return {
    id: overrides.id ?? 'a1',
    type: overrides.type,
    title: overrides.title ?? 'Test Artifact',
    content: overrides.content ?? '',
    language: overrides.language,
  };
}

describe('ArtifactPanel HTML rendering paths', () => {
  it('never feeds raw artifact content into an iframe', () => {
    expect(panelSource).not.toMatch(/srcDoc=\{\s*artifact\.content\s*\}/);
  });

  it('routes every srcDoc it hands to a frame through buildSandboxedHtml', () => {
    const srcDocExpressions = [
      ...panelSource.matchAll(/(?:fallbackSrcDoc|srcDoc)=\{([^}]*)\}/g),
    ].map((m) => m[1]!.trim());
    expect(srcDocExpressions).toEqual(['htmlPreview.srcDoc']);
    expect(panelSource).toContain('buildSandboxedHtml(artifact.content)');
  });

  it('falls back to the code view for types it cannot preview', () => {
    const { container } = render(
      <ArtifactPanel
        artifact={makeArtifact({ type: 'json', content: '{"a":1}' })}
        viewMode="preview"
        onViewModeChange={() => {}}
        onClose={() => {}}
      />,
    );

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('{"a":1}');
  });

  it('gives each previewable type its own renderer instead of a generic iframe', () => {
    const cases: Array<{ type: Artifact['type']; content: string; testId?: string }> = [
      { type: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>' },
      { type: 'mermaid', content: 'graph TD; A-->B;', testId: 'artifact-panel-mermaid-preview' },
      { type: 'image', content: 'data:image/png;base64,AAA' },
      { type: 'markdown', content: '# md' },
      { type: 'document', content: 'doc body' },
      { type: 'react', content: 'export default () => null;', testId: 'stub-react-preview' },
    ];

    for (const { type, content, testId } of cases) {
      const { container, unmount } = render(
        <ArtifactPanel
          artifact={makeArtifact({ id: type, type, content })}
          viewMode="preview"
          onViewModeChange={() => {}}
          onClose={() => {}}
        />,
      );
      expect(container.querySelector('iframe'), `${type} must not use a raw iframe`).toBeNull();
      if (testId) expect(screen.getByTestId(testId)).toBeDefined();
      unmount();
    }
  });
});
