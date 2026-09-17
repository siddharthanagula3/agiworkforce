import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelBadge } from '../ModelBadge';

describe('ModelBadge', () => {
  it('shows the model label and exposes the full name when truncated', () => {
    const { container } = render(<ModelBadge label="Fixture Model Large" />);

    expect(screen.getByText('Fixture Model Large')).toBeTruthy();
    expect(container.querySelector('[data-model-badge]')?.getAttribute('title')).toBe(
      'Fixture Model Large',
    );
  });
});
