import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ProductNoticeStack } from '../ProductNotice';
import { ProductNoticeHost } from '../ProductNoticeHost';

function Shell({ children }: { children?: ReactNode }) {
  return (
    <div data-testid="shell" className="fixed inset-x-0 top-0 bottom-0 flex overflow-hidden">
      <ProductNoticeHost />
      {children}
    </div>
  );
}

const notice = (
  <ProductNoticeStack>
    <p>Incident</p>
  </ProductNoticeStack>
);

describe('ProductNoticeStack', () => {
  it('paints inside the open shell, beside the mobile panel that has to cover it', () => {
    render(
      <>
        {notice}
        <Shell>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Artifacts"
            className="fixed inset-y-0 end-0 z-[var(--z-panel)] w-full"
          />
        </Shell>
      </>,
    );

    const shell = screen.getByTestId('shell');
    const stack = screen.getByText('Incident').parentElement!;
    expect(shell).toContainElement(stack);
    expect(stack.className).toContain('z-[var(--z-banner)]');
    expect(shell).toContainElement(screen.getByRole('dialog', { name: 'Artifacts' }));
  });

  it('stays on the page where no shell is open, and returns there when the shell closes', () => {
    const view = render(
      <>
        {notice}
        <Shell />
      </>,
    );
    expect(screen.getByTestId('shell')).toContainElement(screen.getByText('Incident'));

    view.rerender(<>{notice}</>);

    expect(screen.queryByTestId('shell')).toBeNull();
    expect(view.container).toContainElement(screen.getByText('Incident'));
  });
});
