import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { ArtifactPanel } from '../ArtifactPanel';
import { ReactPreview } from '../artifact-components/ReactPreview';
import { configureArtifactSandboxOrigin } from '../../lib/artifact-sandbox';
import type { Artifact } from '../../lib/types';

const SANDBOX_ORIGIN = 'https://sandbox.agiworkforce.test';

const INTERACTIVE_HTML: Artifact = {
  id: 'html-1',
  type: 'html',
  title: 'Live counter',
  content:
    '<p id="target">not-yet-run</p>' +
    '<script>document.getElementById("target").textContent = "script-ran-in-preview";</script>',
};

const REACT_CODE = 'function App() { return <div>hi</div>; }';

async function forceBlockedProbe(): Promise<void> {
  const capability = await import('../../lib/artifact-preview-capability');
  vi.spyOn(capability, 'getSameDocumentScriptSupport').mockResolvedValue('blocked');
}

afterEach(() => {
  cleanup();
  configureArtifactSandboxOrigin(undefined);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ArtifactPanel HTML preview on a dedicated artifact origin', () => {
  it('frames the sandbox origin and ships the artifact instead of a srcdoc', async () => {
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);
    await forceBlockedProbe();

    render(
      <ArtifactPanel
        artifact={INTERACTIVE_HTML}
        viewMode="preview"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const wrapper = screen.getByTestId('artifact-panel-html-preview');
    const frame = wrapper.querySelector('iframe');
    expect(frame).not.toBeNull();
    if (!frame) return;

    expect(frame.getAttribute('src')).toBe(`${SANDBOX_ORIGIN}/`);
    expect(frame.getAttribute('srcdoc')).toBeNull();
  });

  it('drops the same-document warning, which does not apply cross-origin', async () => {
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);
    await forceBlockedProbe();

    render(
      <ArtifactPanel
        artifact={INTERACTIVE_HTML}
        viewMode="preview"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('artifact-preview-scripts-blocked')).toBeNull();
  });

  it('still warns when there is no artifact origin', async () => {
    await forceBlockedProbe();

    render(
      <ArtifactPanel
        artifact={INTERACTIVE_HTML}
        viewMode="preview"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByTestId('artifact-preview-scripts-blocked')).toBeTruthy();
  });

  it('restores the warning when the artifact origin fails its handshake', async () => {
    vi.useFakeTimers();
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);
    const capability = await import('../../lib/artifact-preview-capability');
    vi.spyOn(capability, 'getSameDocumentScriptSupport').mockResolvedValue('blocked');

    render(
      <ArtifactPanel
        artifact={INTERACTIVE_HTML}
        viewMode="preview"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100);
    });

    expect(screen.getByTestId('artifact-preview-scripts-blocked')).toBeTruthy();
    const frame = screen.getByTestId('artifact-panel-html-preview').querySelector('iframe');
    expect(frame?.getAttribute('srcdoc')).toContain('script-ran-in-preview');
  });
});

describe('ReactPreview on a dedicated artifact origin', () => {
  it('mounts the sandbox frame instead of the "cannot run here" panel', () => {
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);

    render(<ReactPreview code={REACT_CODE} scriptSupport="blocked" />);

    expect(screen.queryByTestId('react-preview-scripts-blocked')).toBeNull();
    const frame = screen.getByTitle('React Component Preview');
    expect(frame.getAttribute('src')).toBe(`${SANDBOX_ORIGIN}/`);
  });

  it('shows the blocked panel again once the sandbox degrades', async () => {
    vi.useFakeTimers();
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);

    render(<ReactPreview code={REACT_CODE} scriptSupport="blocked" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100);
    });

    expect(screen.getByTestId('react-preview-scripts-blocked')).toBeTruthy();
    expect(screen.queryByTitle('React Component Preview')).toBeNull();
  });

  it('keeps the same-document fallback when there is no artifact origin', () => {
    render(<ReactPreview code={REACT_CODE} scriptSupport="allowed" />);

    const frame = screen.getByTitle('React Component Preview');
    expect(frame.getAttribute('src')).toBeNull();
    expect(frame.getAttribute('srcdoc')).toContain('@babel/standalone');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  });
});
