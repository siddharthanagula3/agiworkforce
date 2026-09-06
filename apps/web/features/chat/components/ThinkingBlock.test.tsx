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
