import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';

const renderMock = vi.fn();
const initializeMock = vi.fn();

vi.mock('mermaid', () => ({
  default: {
    initialize: (...args: unknown[]) => initializeMock(...args),
    render: (...args: unknown[]) => renderMock(...args),
    mermaidAPI: { getDiagramFromText: async () => ({ db: {} }) },
  },
}));

import { clearMermaidSvgCache, MermaidDiagram } from '../MermaidDiagram';

const FLOWCHART = 'flowchart TD\n  A[Start] --> B[End]';

describe('MermaidDiagram', () => {
  beforeEach(() => {
    renderMock.mockReset();
    initializeMock.mockReset();
    clearMermaidSvgCache();
  });

  it('expands the same sanitized SVG in one dialog mount and returns focus without rerendering the diagram', async () => {
    renderMock.mockResolvedValue({
      svg: '<svg id="expanded-diagram" viewBox="0 0 240 100"><g><text>Start</text></g></svg>',
    });
    const view = render(<MermaidDiagram source={FLOWCHART} />);
    await waitFor(() =>
      expect(view.container.querySelector('[data-mermaid="ready"] svg')).toBeTruthy(),
    );
    const trigger = screen.getByRole('button', { name: 'Expand diagram' });
    const user = userEvent.setup();
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Diagram' });
    expect(dialog.querySelector('svg#expanded-diagram')).toBeTruthy();
    expect(view.container.querySelector('[data-mermaid="ready"] svg')).toBeNull();
    expect(document.querySelectorAll('#expanded-diagram')).toHaveLength(1);
    expect(renderMock).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(view.container.querySelector('[data-mermaid="ready"] svg')).toBeTruthy();
    expect(document.querySelectorAll('#expanded-diagram')).toHaveLength(1);
    expect(document.activeElement).toBe(trigger);
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('draws a diagram when the source parses', async () => {
    renderMock.mockResolvedValue({ svg: '<svg><g><text>Start</text></g></svg>' });
    const { container } = render(<MermaidDiagram source={FLOWCHART} />);

    await waitFor(() => {
      expect(container.querySelector('[data-mermaid="ready"] svg')).toBeTruthy();
    });
    expect(renderMock.mock.calls[0]?.[2]).toBeInstanceOf(HTMLElement);
    expect((renderMock.mock.calls[0]?.[2] as HTMLElement).isConnected).toBe(false);
  });

  it('retains a trusted label size and natural canvas while removing Mermaid styles', async () => {
    renderMock.mockResolvedValue({
      svg: '<svg width="100%" viewBox="0 0 1200 320" style="max-width:1200px;font-size:2px"><style>.timeline-node .node-bkg { fill: black; }</style><g class="timeline-node section--1"><path class="node-bkg node-default" d="M0 0h200v50H0Z"/><text>Build</text></g></svg>',
    });
    const { container } = render(<MermaidDiagram source="timeline\nBuild : Compile" />);
    await waitFor(() => expect(container.querySelector('[data-mermaid="ready"]')).toBeTruthy());
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('font-size')).toBe('14px');
    expect(svg?.getAttribute('width')).toBe('1200');
    expect(svg?.getAttribute('height')).toBe('320');
    expect(svg?.querySelector('.timeline-node .node-bkg')).toBeTruthy();
    expect(svg?.querySelector('style')).toBeNull();
    expect(svg?.hasAttribute('style')).toBe(false);
    expect(screen.getByRole('region', { name: 'Diagram' })).toHaveProperty('tabIndex', 0);
  });

  it('renders a Markdown diagram outside code preformatted semantics', async () => {
    renderMock.mockResolvedValue({ svg: '<svg viewBox="0 0 640 120"><text>User</text></svg>' });
    const { MarkdownContent } = await import('../MarkdownContent');
    const { container } = render(
      <MarkdownContent content={`\`\`\`mermaid\n${FLOWCHART}\n\`\`\``} />,
    );
    await waitFor(() => expect(container.querySelector('[data-mermaid="ready"]')).toBeTruthy());
    expect(container.querySelector('[data-mermaid="ready"]')?.closest('pre')).toBeNull();
    expect(container.querySelector('.code-block-container')).toBeNull();
  });

  it('passes the drawn markup through the package sanitizer', async () => {
    renderMock.mockResolvedValue({
      svg: '<svg><g /><script>globalThis.pwned = true;</script></svg>',
    });
    const { container } = render(<MermaidDiagram source={FLOWCHART} />);

    await waitFor(() => {
      expect(container.querySelector('[data-mermaid="ready"]')).toBeTruthy();
    });
    // Diagram source is model output, so the renderer must not be the only
    // thing standing between it and the DOM.
    expect(container.querySelector('script')).toBeNull();
  });

  it('keeps a comment in the drawn markup from breaking out as live HTML', async () => {
    renderMock.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><!--><img src="x" onerror="globalThis.pwned = true">--><g><text>Start</text></g></svg>',
    });
    const { container } = render(<MermaidDiagram source={FLOWCHART} />);

    await waitFor(() => {
      expect(container.querySelector('[data-mermaid="ready"] text')?.textContent).toBe('Start');
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
  });

  it('keeps centered node labels when Mermaid defines the anchor in its stylesheet', async () => {
    renderMock.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><style>.node .label text { fill: black; text-anchor: middle; }</style><g class="node"><g class="label"><text>Start</text></g></g></svg>',
    });
    const { container } = render(<MermaidDiagram source={FLOWCHART} />);

    await waitFor(() => {
      expect(
        container.querySelector('[data-mermaid="ready"] g.label text')?.getAttribute('text-anchor'),
      ).toBe('middle');
    });
  });

  it('handles repeated incomplete selectors without backtracking over the SVG', async () => {
    const incompleteSelectors = '.node .label text'.repeat(3000);
    renderMock.mockResolvedValue({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"><style>${incompleteSelectors}</style><g class="node"><g class="label"><text>Start</text></g></g></svg>`,
    });
    const { container } = render(<MermaidDiagram source={FLOWCHART} />);

    await waitFor(() => {
      expect(container.querySelector('[data-mermaid="ready"] g.label text')).toBeTruthy();
    });
    expect(container.querySelector('g.label text')?.hasAttribute('text-anchor')).toBe(false);
  });

  it('keeps the source and states the reason when the source does not parse', async () => {
    renderMock.mockImplementation((_id: string, _source: string, host: HTMLElement) => {
      const errorNode = document.createElement('div');
      errorNode.textContent = 'Syntax error in text Mermaid 11.17.2';
      host.append(errorNode);
      return Promise.reject(new Error('Parse error on line 2:\nunexpected token'));
    });
    const { container } = render(<MermaidDiagram source={'flowchart TD\n  A[Broken'} />);

    await waitFor(() => {
      expect(container.querySelector('[data-mermaid="failed"]')).toBeTruthy();
    });
    expect(screen.getByRole('status').textContent).toContain('Parse error on line 2:');
    // The block must never disappear - its source is the fallback.
    expect(container.querySelector('.mermaid-source')?.textContent).toContain('A[Broken');
    expect(document.body.textContent).not.toContain('Syntax error in text');
  });

  it('removes each renderer-owned error node across rerender and unmount', async () => {
    renderMock.mockImplementation((_id: string, _source: string, host: HTMLElement) => {
      const errorNode = document.createElement('div');
      errorNode.textContent = 'Syntax error in text Mermaid 11.17.2';
      host.append(errorNode);
      return Promise.reject(new Error('Parse error'));
    });
    const view = render(<MermaidDiagram source={'flowchart TD\n  A[First'} />);
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.body.textContent).not.toContain('Syntax error in text'));

    view.rerender(<MermaidDiagram source={'flowchart TD\n  B[Second'} />);
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.body.textContent).not.toContain('Syntax error in text'));

    view.unmount();
    expect(document.body.textContent).not.toContain('Syntax error in text');
  });

  it('does not compile an unfinished source while the turn is still streaming', async () => {
    render(<MermaidDiagram source={'flowchart TD\n  A[Sta'} isStreaming />);
    await new Promise((r) => setTimeout(r, 20));

    expect(renderMock).not.toHaveBeenCalled();
    // and the partial source is still shown rather than a blank space
    expect(screen.getByText(/A\[Sta/)).toBeTruthy();
  });

  it('compiles once the streaming source closes its brackets', async () => {
    renderMock.mockResolvedValue({ svg: '<svg data-testid="late"><g /></svg>' });
    render(<MermaidDiagram source={FLOWCHART} isStreaming />);

    await waitFor(() => {
      expect(renderMock).toHaveBeenCalledOnce();
    });
  });

  it('recompiles only when the source changes, not on every render', async () => {
    renderMock.mockResolvedValue({ svg: '<svg><g /></svg>' });
    const { rerender } = render(<MermaidDiagram source={FLOWCHART} />);
    await waitFor(() => expect(renderMock).toHaveBeenCalledOnce());

    rerender(<MermaidDiagram source={FLOWCHART} className="changed" />);
    await new Promise((r) => setTimeout(r, 20));

    expect(renderMock).toHaveBeenCalledOnce();
  });
});
