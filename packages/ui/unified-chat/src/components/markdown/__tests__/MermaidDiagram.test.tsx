import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const renderMock = vi.fn();
const initializeMock = vi.fn();

vi.mock('mermaid', () => ({
  default: {
    initialize: (...args: unknown[]) => initializeMock(...args),
    render: (...args: unknown[]) => renderMock(...args),
  },
}));

import { MermaidDiagram } from '../MermaidDiagram';

const FLOWCHART = 'flowchart TD\n  A[Start] --> B[End]';

describe('MermaidDiagram', () => {
  beforeEach(() => {
    renderMock.mockReset();
    initializeMock.mockReset();
  });

  it('draws a diagram when the source parses', async () => {
    renderMock.mockResolvedValue({ svg: '<svg><g><text>Start</text></g></svg>' });
    const { container } = render(<MermaidDiagram source={FLOWCHART} />);

    await waitFor(() => {
      expect(container.querySelector('[data-mermaid="ready"] svg')).toBeTruthy();
    });
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

  it('keeps the source and states the reason when the source does not parse', async () => {
    renderMock.mockRejectedValue(new Error('Parse error on line 2:\nunexpected token'));
    const { container } = render(<MermaidDiagram source={'flowchart TD\n  A[Broken'} />);

    await waitFor(() => {
      expect(container.querySelector('[data-mermaid="failed"]')).toBeTruthy();
    });
    expect(screen.getByRole('status').textContent).toContain('Parse error on line 2:');
    // The block must never disappear - its source is the fallback.
    expect(container.querySelector('.mermaid-source')?.textContent).toContain('A[Broken');
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
