
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactPanel } from '../ArtifactPanel';
import { buildSandboxedHtml, ARTIFACT_SANDBOX_ATTR } from '../../lib/artifact-sandbox';
import type { Artifact } from '../../lib/types';

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

describe('ArtifactPanel edit-in-place', () => {
  it('hides the Edit button when no onSaveEdit callback is provided', () => {
    const artifact = makeArtifact({ type: 'code', content: 'const x = 1;' });
    render(
      <ArtifactPanel
        artifact={artifact}
        viewMode="code"
        onViewModeChange={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByLabelText('Edit artifact')).toBeNull();
  });

  it('shows Save and Discard once Edit is clicked', () => {
    const artifact = makeArtifact({ type: 'code', content: 'const x = 1;' });
    render(
      <ArtifactPanel
        artifact={artifact}
        viewMode="code"
        onViewModeChange={() => {}}
        onClose={() => {}}
        onSaveEdit={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText('Edit artifact'));
    expect(screen.getByTestId('artifact-panel-edit-mode')).toBeDefined();
    expect(screen.getByLabelText('Save edit')).toBeDefined();
    expect(screen.getByLabelText('Discard edit')).toBeDefined();
  });

  it('fires onSaveEdit with the edited content when Save is clicked', () => {
    const artifact = makeArtifact({ id: 'art-1', type: 'code', content: 'const x = 1;' });
    let captured: { id?: string; content?: string } = {};
    render(
      <ArtifactPanel
        artifact={artifact}
        viewMode="code"
        onViewModeChange={() => {}}
        onClose={() => {}}
        onSaveEdit={(id, content) => {
          captured = { id, content };
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText('Edit artifact'));
    const textarea = screen.getByLabelText('Edit artifact content') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'const x = 2;' } });
    fireEvent.click(screen.getByLabelText('Save edit'));

    expect(captured.id).toBe('art-1');
    expect(captured.content).toBe('const x = 2;');
  });

  it('discards the draft when Discard is clicked', () => {
    const artifact = makeArtifact({ type: 'code', content: 'const x = 1;' });
    let saved = false;
    render(
      <ArtifactPanel
        artifact={artifact}
        viewMode="code"
        onViewModeChange={() => {}}
        onClose={() => {}}
        onSaveEdit={() => {
          saved = true;
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText('Edit artifact'));
    const textarea = screen.getByLabelText('Edit artifact content') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'mutated' } });
    fireEvent.click(screen.getByLabelText('Discard edit'));

    expect(saved).toBe(false);
    expect(screen.queryByTestId('artifact-panel-edit-mode')).toBeNull();
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

  it('replaces any document-supplied CSP with the AGI sandbox CSP', () => {
    const supplied =
      '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="connect-src https://example.com"><title>t</title></head><body /></html>';
    const doc = buildSandboxedHtml(supplied);
    const matches = doc.match(/Content-Security-Policy/g) ?? [];
    expect(matches.length).toBe(1);
    expect(doc).toContain("connect-src 'none'");
    expect(doc).not.toContain('https://example.com');
  });
});
