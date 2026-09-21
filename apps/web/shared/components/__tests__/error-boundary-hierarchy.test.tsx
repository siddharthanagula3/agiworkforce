import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SectionErrorBoundary } from '@agiworkforce/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ErrorBoundary from '../ErrorBoundary';

function Exploding({ shouldThrow, message }: { shouldThrow: boolean; message: string }) {
  if (shouldThrow) throw new Error(message);
  return <p>panel content</p>;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('a failing panel does not take down the shell', () => {
  it('keeps every sibling region rendered when one panel throws', () => {
    render(
      <div>
        <nav aria-label="Primary">navigation</nav>
        <SectionErrorBoundary sectionName="Usage">
          <Exploding shouldThrow message="usage exploded" />
        </SectionErrorBoundary>
        <footer>account</footer>
      </div>,
    );

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByText('account')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Usage Error');
  });

  it('announces the failure rather than leaving the region empty', () => {
    render(
      <SectionErrorBoundary sectionName="Usage">
        <Exploding shouldThrow message="usage exploded" />
      </SectionErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).not.toHaveTextContent('usage exploded');
  });

  it('recovers in place when the child stops throwing, with no page reload', () => {
    function Host() {
      const [broken, setBroken] = React.useState(true);
      return (
        <>
          <button onClick={() => setBroken(false)}>fix</button>
          <SectionErrorBoundary sectionName="Usage">
            <Exploding shouldThrow={broken} message="usage exploded" />
          </SectionErrorBoundary>
        </>
      );
    }

    render(<Host />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'fix' }));
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('panel content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers no reload, because one panel failing is not a reason to lose the page', () => {
    render(
      <SectionErrorBoundary sectionName="Usage">
        <Exploding shouldThrow message="usage exploded" />
      </SectionErrorBoundary>,
    );

    expect(screen.queryByRole('button', { name: /reload/i })).not.toBeInTheDocument();
  });
});

describe('the whole-surface boundary', () => {
  it('offers retry before reload, so reload is the last resort rather than the first', () => {
    render(
      <ErrorBoundary>
        <Exploding shouldThrow message="shell exploded" />
      </ErrorBoundary>,
    );

    const actions = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.trim().toLowerCase() ?? '');
    expect(actions.findIndex((label) => label.includes('try again'))).toBeLessThan(
      actions.findIndex((label) => label.includes('reload')),
    );
  });

  it('reports the identifier it asks the user to quote', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <Exploding shouldThrow message="shell exploded" />
      </ErrorBoundary>,
    );

    const shown = screen.getByText(/Error ID:/i).textContent ?? '';
    const reported = onError.mock.calls[0]?.[2];

    expect(typeof reported).toBe('string');
    expect(reported).not.toBe('');
    expect(shown).toContain(reported);
  });

  it('shows the same identifier it hands the host, so support can find the report', () => {
    const ids: string[] = [];

    render(
      <ErrorBoundary onError={(_error, _info, errorId) => ids.push(errorId)}>
        <Exploding shouldThrow message="shell exploded" />
      </ErrorBoundary>,
    );

    expect(ids).toHaveLength(1);
    expect(screen.getByText(new RegExp(ids[0] ?? 'never'))).toBeInTheDocument();
  });

  it('renders a host fallback instead of its own panel when one is given', () => {
    render(
      <ErrorBoundary fallback={<p>search is unavailable</p>}>
        <Exploding shouldThrow message="search exploded" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('search is unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/Error ID:/i)).not.toBeInTheDocument();
  });

  it('never paints the raw failure into the page', () => {
    render(
      <ErrorBoundary>
        <Exploding shouldThrow message="postgres://user:hunter2@db/app timed out" />
      </ErrorBoundary>,
    );

    expect(document.body.textContent).not.toContain('hunter2');
  });
});
