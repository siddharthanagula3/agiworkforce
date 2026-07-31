import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RenderedArtifact, WebRenderData } from '@/stores/artifactStore';
import { ArtifactRendererView } from '../ArtifactRendererView';

function makeRendered(data: WebRenderData): RenderedArtifact {
  return {
    id: 'web-artifact-1',
    title: 'Interactive preview',
    artifact_type: 'web',
    rendered_content: { type: 'Web', data },
    version_info: {
      current: 1,
      total: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    status: 'complete',
    available_actions: [],
  };
}

describe('ArtifactRendererView Web sandbox', () => {
  it('keeps only supported sandbox capabilities and never restores origin access', () => {
    render(
      <ArtifactRendererView
        rendered={makeRendered({
          html: '<button onclick="alert(1)">Run</button>',
          scripts_enabled: true,
          sandbox_permissions: [
            'allow-scripts',
            'allow-same-origin',
            'allow-modals',
            'allow-forms',
            'allow-popups',
            'allow-scripts',
          ],
        })}
      />,
    );

    const frame = screen.getByTitle('HTML Preview');
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-modals');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  it('disables script execution in both the iframe sandbox and CSP', () => {
    render(
      <ArtifactRendererView
        rendered={makeRendered({
          html: '<script>document.body.dataset.executed = "true"</script>',
          scripts_enabled: false,
          sandbox_permissions: ['allow-scripts', 'allow-modals'],
        })}
      />,
    );

    const frame = screen.getByTitle('HTML Preview');
    const srcDoc = frame.getAttribute('srcdoc') ?? '';

    expect(frame).toHaveAttribute('sandbox', 'allow-modals');
    expect(srcDoc).toContain("script-src 'none'");
    expect(srcDoc).toContain("connect-src 'none'");
    expect(srcDoc).toContain("form-action 'none'");
    expect(srcDoc).not.toContain('unsafe-eval');
  });

  it('injects the restrictive CSP into a full document without a head', () => {
    render(
      <ArtifactRendererView
        rendered={makeRendered({
          html: '<html><body>Preview</body></html>',
          scripts_enabled: true,
          sandbox_permissions: ['allow-scripts'],
        })}
      />,
    );

    const srcDoc = screen.getByTitle('HTML Preview').getAttribute('srcdoc') ?? '';
    expect(srcDoc.indexOf('<head>')).toBeGreaterThan(srcDoc.indexOf('<html>'));
    expect(srcDoc.indexOf('<head>')).toBeLessThan(srcDoc.indexOf('<body>'));
    expect(srcDoc).toContain("default-src 'none'");
    expect(srcDoc).toContain("script-src 'unsafe-inline'");
    expect(srcDoc).toContain('img-src data: blob:');
  });
});
