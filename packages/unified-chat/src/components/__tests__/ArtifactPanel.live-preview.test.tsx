/**
 * ArtifactPanel — live-preview regression coverage.
 *
 * Round-2 audit P0 #9 (Artifacts live preview, 2026-05-21). These tests pin
 * the sandbox attributes the live preview is allowed to use so a careless
 * refactor cannot widen the iframe's privileges without showing up here.
 *
 * Specifically asserts:
 *   - HTML preview iframe carries `allow-scripts` AND the injected CSP meta.
 *   - SVG preview stays an `<img>` (no script-enabled iframe).
 *   - React artifact type routes through ReactPreview.
 *   - Run/Stop control toggles the HTML iframe on/off.
 *   - Markdown/document fall back to plain article rendering.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactPanel } from '../ArtifactPanel';
import { buildSandboxedHtml, ARTIFACT_SANDBOX_ATTR } from '../../lib/artifact-sandbox';
import type { Artifact } from '../../lib/types';

// ReactPreview wires postMessage between an iframe and the host; jsdom can't
// load CDN React, so stub the component shape and assert routing.
vi.mock('../artifact-components/ReactPreview', () => ({
  ReactPreview: ({ code }: { code: string }) => (
    <div data-testid="stub-react-preview" data-code-length={code.length} />
  ),
  buildReactPreviewDocument: vi.fn(),
}));

function makeArtifact(overrides: Partial<Artifact> & { type: Artifact['type'] }): Artifact {
  return {
    id: overrides.id ?? 'a1',
    type: overrides.type,
    title: overrides.title ?? 'Test Artifact',
    content: overrides.content ?? '',
    language: overrides.language,
  };
}

describe('ArtifactPanel live preview', () => {
  it('renders an HTML artifact inside a sandboxed iframe with CSP injected', () => {
    const artifact = makeArtifact({
      type: 'html',
      content: '<p>hello world</p>',
    });

    render(
      <ArtifactPanel
        artifact={artifact}
        viewMode="preview"
        onViewModeChange={() => {}}
        onClose={() => {}}
      />,
    );

    const wrapper = screen.getByTestId('artifact-panel-html-preview');
    const iframe = wrapper.querySelector('iframe');
    expect(iframe).not.toBeNull();
    if (!iframe) return;

    const sandbox = iframe.getAttribute('sandbox') ?? '';
    expect(sandbox).toBe(ARTIFACT_SANDBOX_ATTR);
    expect(sandbox).toContain('allow-scripts');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');

    const srcDoc = iframe.getAttribute('srcdoc') ?? '';
    expect(srcDoc).toContain('Content-Security-Policy');
    expect(srcDoc).toContain('hello world');
  });

  it('Pause control tears the iframe down and Run brings it back', () => {
    const artifact = makeArtifact({ type: 'html', content: '<p>x</p>' });
    render(
      <ArtifactPanel
        artifact={artifact}
        viewMode="preview"
        onViewModeChange={() => {}}
        onClose={() => {}}
      />,
    );

    const wrapper = screen.getByTestId('artifact-panel-html-preview');
    expect(wrapper.querySelector('iframe')).not.toBeNull();

    const stopButton = screen.getByLabelText('Stop preview');
    fireEvent.click(stopButton);
    expect(wrapper.querySelector('iframe')).toBeNull();

    // After pause, both an icon toolbar button (aria-label="Run preview") and
    // an inline "Run preview" body button exist. Click the toolbar one — it's
    // the affordance the design lives on.
    const runButton = screen.getByLabelText('Run preview');
    fireEvent.click(runButton);
    expect(wrapper.querySelector('iframe')).not.toBeNull();
  });

  it('routes React artifacts to ReactPreview, never to a raw iframe', () => {
    const artifact = makeArtifact({
      type: 'react',
      content: 'export default () => <div />;',
    });

    const { container } = render(
      <ArtifactPanel
        artifact={artifact}
        viewMode="preview"
        onViewModeChange={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId('stub-react-preview')).toBeDefined();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('keeps SVG preview as an <img>, not a script-enabled iframe', () => {
    const artifact = makeArtifact({
      type: 'svg',
      content: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
    });

    const { container } = render(
      <ArtifactPanel
        artifact={artifact}
        viewMode="preview"
        onViewModeChange={() => {}}
        onClose={() => {}}
      />,
    );

    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('renders markdown/document content as plain article text, not in any iframe', () => {
    const artifact = makeArtifact({
      type: 'markdown',
      content: '# heading\n\nbody copy',
    });

    const { container } = render(
      <ArtifactPanel
        artifact={artifact}
        viewMode="preview"
        onViewModeChange={() => {}}
        onClose={() => {}}
      />,
    );

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('# heading');
  });
});

describe('buildSandboxedHtml', () => {
  it('wraps a fragment in a full document with the CSP meta tag', () => {
    const doc = buildSandboxedHtml('<p>x</p>');
    expect(doc).toMatch(/^<!DOCTYPE html>/i);
    expect(doc).toContain('Content-Security-Policy');
    expect(doc).toContain("script-src 'unsafe-inline' 'unsafe-eval'");
    expect(doc).toContain('<p>x</p>');
  });

  it('injects the CSP into a full document that does not already have one', () => {
    const doc = buildSandboxedHtml(
      '<!doctype html><html><head><title>t</title></head><body /></html>',
    );
    expect(doc).toContain('Content-Security-Policy');
  });

  it('leaves a document alone when it already declares its own CSP', () => {
    const supplied =
      '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"><title>t</title></head><body /></html>';
    const doc = buildSandboxedHtml(supplied);
    // The supplied CSP is preserved; we never inject a second one.
    const matches = doc.match(/Content-Security-Policy/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
