import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UnavailableArtifact } from './UnavailableArtifact';

describe('UnavailableArtifact', () => {
  it('places the unavailable-artifact heading, explanation and recovery link in one native main', () => {
    render(<UnavailableArtifact />);

    const main = screen.getByRole('main');
    expect(main.tagName).toBe('MAIN');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(
      within(main).getByRole('heading', { level: 1, name: 'Shared artifact unavailable' }),
    ).toBeVisible();
    expect(
      within(main).getByText(/expired, been unpublished, or been entered incorrectly/i),
    ).toBeVisible();
    expect(within(main).getByRole('link', { name: 'Open AGI' })).toHaveAttribute('href', '/');
  });
});
