import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SlideView } from './SlideView';
import { DEFAULT_DECK_THEME } from './deck-themes';

const SLIDE = [
  '## Analysis',
  '',
  '```kpi',
  'Approval rate | 57.3% | of reviewed',
  'Reviewed | 1,200',
  '```',
  '',
  '```insights',
  '- 57.3% approval rate indicates strong curation',
  '- Reviews are steady',
  '```',
].join('\n');

describe('SlideView kpi and insights', () => {
  it('renders a tile per kpi line and a Key insights list', () => {
    render(<SlideView markdown={SLIDE} theme={DEFAULT_DECK_THEME} index={0} total={1} />);
    const grid = screen.getByTestId('deck-kpi-grid');
    expect(within(grid).getByText('57.3%')).toBeInTheDocument();
    expect(within(grid).getByText('Reviewed')).toBeInTheDocument();
    const insights = screen.getByTestId('deck-insights');
    expect(within(insights).getByText('Key insights')).toBeInTheDocument();
    expect(within(insights).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows neither block as content in a thumbnail', () => {
    render(<SlideView markdown={SLIDE} theme={DEFAULT_DECK_THEME} index={0} total={1} thumbnail />);
    expect(screen.queryByTestId('deck-kpi-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('deck-insights')).not.toBeInTheDocument();
  });
});
