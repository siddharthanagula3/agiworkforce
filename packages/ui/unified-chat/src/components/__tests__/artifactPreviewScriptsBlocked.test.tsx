/**
 * artifactPreviewScriptsBlocked.test.tsx, DES-C15.
 *
 * Inside the packaged desktop app a srcdoc preview inherits
 * `script-src 'self' 'wasm-unsafe-eval'` from the embedder, so an interactive
 * HTML artifact renders inert and a React artifact renders nothing at all while
 * its toolbar claims "Loading..." forever. Neither told the user anything. These
 * tests pin the honest states, and, just as importantly, that they stay hidden
 * everywhere the restriction does not apply.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReactPreview } from '../artifact-components/ReactPreview';
import { ArtifactPanel } from '../ArtifactPanel';
import type { Artifact } from '../../lib/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const REACT_CODE = 'function App() { return <div>hi</div>; }';

describe('ReactPreview under a blocking embedder CSP', () => {
  it('explains why the component cannot run instead of spinning forever', () => {
    render(<ReactPreview code={REACT_CODE} scriptSupport="blocked" />);

    expect(screen.getByTestId('react-preview-scripts-blocked')).toBeTruthy();
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.queryByTitle('React Component Preview')).toBeNull();
  });

  it('offers a route to the source when the host can show one', () => {
    const onViewSource = vi.fn();
    render(<ReactPreview code={REACT_CODE} scriptSupport="blocked" onViewSource={onViewSource} />);

    screen.getByText('View source').click();
    expect(onViewSource).toHaveBeenCalledTimes(1);
  });

  it('hides the affordance when the host wired no source view', () => {
    render(<ReactPreview code={REACT_CODE} scriptSupport="blocked" />);
    expect(screen.queryByText('View source')).toBeNull();
  });

  it('mounts the real preview when scripts are allowed', () => {
    render(<ReactPreview code={REACT_CODE} scriptSupport="allowed" />);

    expect(screen.queryByTestId('react-preview-scripts-blocked')).toBeNull();
    expect(screen.getByTitle('React Component Preview')).toBeTruthy();
  });

  it('says nothing while the capability is still unknown', () => {
    render(<ReactPreview code={REACT_CODE} />);

    expect(screen.queryByTestId('react-preview-scripts-blocked')).toBeNull();
    expect(screen.getByTitle('React Component Preview')).toBeTruthy();
  });
});

const htmlArtifact: Artifact = {
  id: 'a1',
  type: 'html',
  title: 'Counter',
  content: '<button id="b">0</button><script>document.getElementById("b").onclick=()=>{}</script>',
};

describe('ArtifactPanel HTML preview under a blocking embedder CSP', () => {
  it('keeps rendering the markup but flags that behaviour will not run', async () => {
    const capability = await import('../../lib/artifact-preview-capability');
    vi.spyOn(capability, 'getSameDocumentScriptSupport').mockResolvedValue('blocked');

    render(
      <ArtifactPanel
        artifact={htmlArtifact}
        viewMode="preview"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByTestId('artifact-preview-scripts-blocked')).toBeTruthy();
    expect(screen.getByTestId('artifact-panel-html-preview')).toBeTruthy();
  });

  it('shows no warning when scripts are allowed', async () => {
    const capability = await import('../../lib/artifact-preview-capability');
    vi.spyOn(capability, 'getSameDocumentScriptSupport').mockResolvedValue('allowed');

    render(
      <ArtifactPanel
        artifact={htmlArtifact}
        viewMode="preview"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('artifact-panel-html-preview')).toBeTruthy();
    expect(screen.queryByTestId('artifact-preview-scripts-blocked')).toBeNull();
  });
});
