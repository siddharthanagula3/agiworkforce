import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type MermaidDiagramModule = typeof import('./MermaidDiagram');

vi.mock('./MermaidDiagram', async (importOriginal) => ({
  ...(await importOriginal<MermaidDiagramModule>()),
  MermaidDiagram: ({ source }: { source: string }) => <pre>{source}</pre>,
}));

vi.mock('./HighlightedCode', () => ({
  HighlightedCode: ({ code }: { code: string }) => <>{code}</>,
}));

const { MarkdownContent } = await import('./MarkdownContent');

afterEach(cleanup);

describe('MarkdownContent on a finished answer', () => {
  it('shows only the label of a link whose address was cut off', () => {
    const { container } = render(
      <MarkdownContent content="Read [the guide](https://exa" finishedAnswer="complete" />,
    );
    expect(container.textContent).toBe('Read the guide');
    expect(container.textContent).not.toContain('https://exa');
  });

  it('closes a dangling bold marker on an answer the person stopped', () => {
    const { container } = render(
      <MarkdownContent content="The answer is **forty" finishedAnswer="stopped" />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('forty');
    expect(container.textContent).not.toContain('**');
  });

  it('leaves the source as written without a finished answer', () => {
    const { container } = render(<MarkdownContent content="Read [the guide](https://exa" />);
    expect(container.textContent).toContain('(https://exa');
  });
});
