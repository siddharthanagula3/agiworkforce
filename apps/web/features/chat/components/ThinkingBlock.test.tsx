import { Suspense, lazy, type ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThinkingBlock } from './ThinkingBlock';

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<ComponentType<Record<string, unknown>>>) => {
    const Loaded = lazy(() => loader().then((component) => ({ default: component })));
    return (props: Record<string, unknown>) => (
      <Suspense fallback={null}>
        <Loaded {...props} />
      </Suspense>
    );
  },
}));

describe('ThinkingBlock', () => {
  it(
    'renders the reasoning body as markdown instead of raw markers',
    { timeout: 30000 },
    async () => {
      render(
        <ThinkingBlock
          content={
            'Checking the lineup first.\n\n**Exploring the release**\n\nThe price is $2,499 today.'
          }
          isStreaming={false}
          durationSeconds={4}
          defaultExpanded
        />,
      );

      const heading = await screen.findByText('Exploring the release', undefined, {
        timeout: 20000,
      });
      expect(heading.tagName).toBe('STRONG');
      expect(screen.queryByText(/\*\*/u)).toBeNull();
      expect(screen.getByText(/\$2,499 today/u)).toBeInTheDocument();
      expect(screen.getByText('Thought for 4s')).toBeInTheDocument();
    },
  );
});

describe('ThinkingBlock header ids', () => {
  it('gives two blocks with the same opening words distinct ids so labels never collide', async () => {
    const content = 'Considering the request carefully before answering.';
    const { container } = render(
      <>
        <ThinkingBlock content={content} isStreaming={false} durationSeconds={3} />
        <ThinkingBlock content={content} isStreaming={false} durationSeconds={5} />
      </>,
    );

    const headers = Array.from(container.querySelectorAll('button[id^="thinking-header-"]'));
    expect(headers).toHaveLength(2);
    const ids = headers.map((header) => header.getAttribute('id'));
    expect(new Set(ids).size).toBe(2);
    for (const header of headers) {
      const region = container.querySelector(`[aria-labelledby="${header.getAttribute('id')}"]`);
      expect(region).not.toBeNull();
    }
  });
});
