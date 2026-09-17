import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PRODUCT_LINK_TARGETS, PRODUCT_LINK_UNAVAILABLE_STATES } from '@agiworkforce/types';
import { ProductLinkUnavailable, productLinkUnavailableCopy } from '../ProductLinkUnavailable';

describe('ProductLinkUnavailable', () => {
  it('gives every target and state its own headline instead of a generic error', () => {
    for (const target of PRODUCT_LINK_TARGETS) {
      const titles = PRODUCT_LINK_UNAVAILABLE_STATES.map(
        (state) => productLinkUnavailableCopy(target, state).title,
      );
      expect(new Set(titles).size).toBe(PRODUCT_LINK_UNAVAILABLE_STATES.length);
    }
  });

  it('says an expired schedule ended and offers the way back to Schedules', () => {
    render(<ProductLinkUnavailable target="schedule" state="expired" />);

    expect(screen.getByRole('heading', { name: 'This schedule has ended' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Schedules' })).toHaveAttribute(
      'href',
      '/chat/schedules',
    );
  });

  it('points a deleted file at Recently deleted, where it can still be restored', () => {
    render(<ProductLinkUnavailable target="file" state="deleted" />);
    expect(screen.getByText(/Recently deleted in Library/)).toBeInTheDocument();
  });

  it('never says an unauthorized item does not exist', () => {
    render(<ProductLinkUnavailable target="work" state="unauthorized" />);
    expect(screen.getByTestId('product-link-unavailable')).toHaveAttribute(
      'data-state',
      'unauthorized',
    );
    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
  });
});
