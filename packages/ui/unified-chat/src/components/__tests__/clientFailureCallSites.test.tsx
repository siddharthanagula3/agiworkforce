import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mermaidRender = vi.fn();
const highlightToLines = vi.fn();

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: (...args: unknown[]) => mermaidRender(...args) },
}));
vi.mock('../markdown/shikiHighlighter', () => ({
  readHighlightCache: () => null,
  highlightToLines: (...args: unknown[]) => highlightToLines(...args),
}));

import { ActionBar } from '../ActionBar';
import { ArtifactSandboxFrame } from '../artifact-components/ArtifactSandboxFrame';
import { configureArtifactSandboxOrigin } from '../../lib/artifact-sandbox';
import { HighlightedCode } from '../markdown/HighlightedCode';
import { clearMermaidSvgCache, MermaidDiagram } from '../markdown/MermaidDiagram';
import {
  reportClientFailure,
  setClientFailureSink,
  type ClientFailureReport,
} from '../../lib/client-failures';

let reported: ClientFailureReport[];

beforeEach(() => {
  reported = [];
  setClientFailureSink((report) => reported.push(report));
  mermaidRender.mockReset();
  highlightToLines.mockReset();
  clearMermaidSvgCache();
});

afterEach(() => {
  setClientFailureSink(null);
  vi.useRealTimers();
});

describe('a failure the user sees is a failure the platform hears about', () => {
  it('reports a diagram the renderer could not compile', async () => {
    mermaidRender.mockRejectedValue(new Error('Parse error on line 2'));

    render(<MermaidDiagram source={'flowchart TD\n  A[[[Start'} />);

    await waitFor(() => {
      expect(reported).toContainEqual({ failure: 'mermaid_render', detail: 'parse' });
    });
  });

  it('reports a diagram that renders to nothing displayable', async () => {
    mermaidRender.mockResolvedValue({ svg: '<div>not a diagram</div>' });

    render(<MermaidDiagram source={'flowchart TD\n  A --> B'} />);

    await waitFor(() => {
      expect(reported).toContainEqual({ failure: 'mermaid_render', detail: 'render' });
    });
  });

  it('reports a code block the highlighter could not colour', async () => {
    highlightToLines.mockRejectedValue(new Error('language not loaded'));

    render(<HighlightedCode code="const a = 1;" language="ts" enabled />);

    await waitFor(() => {
      expect(reported).toContainEqual({ failure: 'markdown_render', detail: 'render' });
    });
  });

  it('reports a copy the browser refused', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<ActionBar messageId="m1" content="hello" />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    await waitFor(() => {
      expect(reported).toContainEqual({ failure: 'code_copy', detail: 'permission_denied' });
    });
  });

  it('reports an artifact preview that never completed its handshake', () => {
    vi.useFakeTimers();
    configureArtifactSandboxOrigin('https://sandbox.agiworkforce.test');

    render(
      <ArtifactSandboxFrame
        payload={{ type: 'render', kind: 'html', html: '<p>hi</p>', runScripts: true }}
        fallbackSrcDoc="<p>hi</p>"
        fallbackSandbox="allow-scripts"
        title="Preview"
      />,
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(reported).toContainEqual({ failure: 'artifact_load', detail: 'timeout' });
    configureArtifactSandboxOrigin(undefined);
  });

  it('costs nothing and throws nothing when no host installed a sink', () => {
    setClientFailureSink(null);
    expect(() => reportClientFailure({ failure: 'stream_stall' })).not.toThrow();

    setClientFailureSink(() => {
      throw new Error('the sink is broken');
    });
    expect(() => reportClientFailure({ failure: 'stream_stall' })).not.toThrow();
  });
});
