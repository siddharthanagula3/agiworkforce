import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Badge } from '../components/ui/Badge';
import { HEADER_TEXT_SCALE_LIMIT } from '../src/ui/theme/tokens';

describe('Badge', () => {
  it('lets a two word label wrap between its words instead of being cut', () => {
    render(<Badge label="Needs permission" color="yellow" />);

    expect(screen.getByText('Needs permission').props.numberOfLines).toBe(2);
  });

  it('keeps the header text cap so the label cannot take the row', () => {
    render(<Badge label="Document" />);

    expect(screen.getByText('Document').props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
  });
});
