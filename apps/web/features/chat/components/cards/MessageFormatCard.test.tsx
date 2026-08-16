import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { detectCardType } from './index';
import { MessageFormatCard } from './MessageFormatCard';
import { RecipeCard } from './RecipeCard';

const RECIPE_WITH_NOTES = `# Banana Bread

Prep time: 15 min
Servings: 8

## Ingredients
- 3 ripe bananas
- 2 cups flour

## Instructions
1. Mash the bananas.
2. Bake at 350F for 50 minutes.

## Notes
- Overripe bananas give the best flavour.
- Freezes for up to three months.
`;

describe('detectCardType', () => {
  it('recognises a structured recipe', () => {
    expect(detectCardType(RECIPE_WITH_NOTES)).toBe('recipe');
  });

  it('leaves ordinary prose alone', () => {
    expect(
      detectCardType(
        'Sure — I can help with that. There are a few approaches worth considering here, ' +
          'and the right one depends on how much traffic you expect.',
      ),
    ).toBeNull();
  });

  it('ignores content too short to have structure', () => {
    expect(detectCardType('## Ingredients')).toBeNull();
  });
});

describe('RecipeCard content preservation', () => {
  it('renders trailing sections instead of dropping them', () => {
    render(<RecipeCard content={RECIPE_WITH_NOTES} />);

    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText(/Overripe bananas give the best flavour/)).toBeInTheDocument();
    expect(screen.getByText(/Freezes for up to three months/)).toBeInTheDocument();
  });

  it('still renders the recognised sections', () => {
    render(<RecipeCard content={RECIPE_WITH_NOTES} />);
    expect(screen.getByText('3 ripe bananas')).toBeInTheDocument();
    expect(screen.getByText(/Mash the bananas/)).toBeInTheDocument();
  });
});

describe('MessageFormatCard', () => {
  it('shows the card by default and the exact original on demand', () => {
    render(
      <MessageFormatCard content={RECIPE_WITH_NOTES} cardType="recipe">
        <pre data-testid="original">{RECIPE_WITH_NOTES}</pre>
      </MessageFormatCard>,
    );

    expect(screen.queryByTestId('original')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Original response' }));
    expect(screen.getByTestId('original')).toHaveTextContent('Overripe bananas');

    fireEvent.click(screen.getByRole('button', { name: 'Formatted view' }));
    expect(screen.queryByTestId('original')).toBeNull();
  });
});
