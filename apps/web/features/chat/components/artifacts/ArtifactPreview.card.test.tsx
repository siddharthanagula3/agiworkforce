import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtifactPreview, type ArtifactData } from './ArtifactPreview';

const SQL_SOURCE = `CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE
);`;

const TEXT_SOURCE = `Release checklist
1. Freeze the branch
2. Tag the build`;

const HTML_SOURCE = '<button class="cta">Reserve a seat</button>';

function artifact(overrides: Partial<ArtifactData>): ArtifactData {
  return {
    id: 'card-artifact',
    type: 'code',
    language: 'sql',
    title: 'Card artifact',
    content: SQL_SOURCE,
    ...overrides,
  };
}

function sourceRegion() {
  return screen.getByRole('region', { name: 'Artifact source' });
}

describe('ArtifactPreview card variant', () => {
  it('shows the source of a code artifact on first paint, with no tab strip to find it behind', () => {
    render(<ArtifactPreview artifact={artifact({ type: 'code', language: 'sql' })} />);

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(sourceRegion().textContent).toBe(SQL_SOURCE);
    expect(sourceRegion()).toBeVisible();
  });

  it('shows the source of a document that has no rendered preview', () => {
    render(
      <ArtifactPreview
        artifact={artifact({ type: 'document', language: 'txt', content: TEXT_SOURCE })}
      />,
    );

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(sourceRegion().textContent).toBe(TEXT_SOURCE);
  });

  it('makes the source scroll region reachable from the keyboard', () => {
    render(<ArtifactPreview artifact={artifact({ type: 'code', language: 'sql' })} />);

    expect(sourceRegion()).toHaveAttribute('tabindex', '0');
  });

  it('still opens a previewable artifact on Preview and reveals its source from the Code tab', async () => {
    const user = userEvent.setup();
    render(
      <ArtifactPreview
        artifact={artifact({ type: 'html', language: 'html', content: HTML_SOURCE })}
      />,
    );

    const tabs = within(screen.getByRole('tablist'));
    expect(tabs.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'Artifact source' })).toBeNull();

    await user.click(tabs.getByRole('tab', { name: 'Code' }));

    expect(tabs.getByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'true');
    expect(sourceRegion().textContent).toBe(HTML_SOURCE);
  });

  it('fills the column it is placed in instead of shrinking to its own content', () => {
    render(<ArtifactPreview artifact={artifact({ type: 'code', language: 'sql' })} />);

    const card = screen.getByTestId('artifact-preview-card');
    expect(card).toHaveClass('w-full', 'min-w-0');
    expect(within(card).getByRole('region', { name: 'Artifact source' })).toBeInTheDocument();
  });
});
