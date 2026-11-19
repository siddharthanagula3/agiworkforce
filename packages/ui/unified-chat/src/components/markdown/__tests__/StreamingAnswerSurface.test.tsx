import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { StreamingMarkdownContent } from '../StreamingMarkdownContent';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(content: string, isStreaming: boolean): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<StreamingMarkdownContent content={content} isStreaming={isStreaming} />));
  return container;
}

describe('a structured fence while it streams', () => {
  it('draws the form from its whole lines instead of showing its source', () => {
    const container = mount('```form\ntitle: Booking\ntext: Name*\nsel', true);
    expect(container.querySelector('[data-answer-fallback]')).toBeNull();
    expect(container.querySelector('[data-answer-surface="form"]')).not.toBeNull();
    expect(container.textContent).not.toContain('sel');
  });

  it('holds a place for a form whose first line is still arriving', () => {
    const container = mount('```form\ntitl', true);
    expect(container.querySelector('[data-answer-fallback]')).toBeNull();
    expect(container.querySelector('[data-answer-pending]')).not.toBeNull();
  });

  it('holds a place for a chart that has no rows yet', () => {
    const container = mount('```chart\ntitle: Requests\nx: Mon', true);
    expect(container.querySelector('[data-answer-fallback]')).toBeNull();
    expect(container.querySelector('[data-answer-pending]')).not.toBeNull();
  });

  it('shows an invalid fence as text once the answer is complete', () => {
    const container = mount('```form\ntitl\n```', false);
    expect(container.querySelector('[data-answer-fallback="invalid"]')).not.toBeNull();
  });
});
