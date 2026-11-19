import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { PlacesCardPlace } from '@agiworkforce/types';
import { PlaceDetailPopup } from './PlaceDetailPopup';

const BASE_PLACE: PlacesCardPlace = {
  placeId: 'place-a',
  name: 'Cafe A',
  latitude: 41.88,
  longitude: -87.63,
};

function renderPopup(place: PlacesCardPlace) {
  render(
    <PlaceDetailPopup
      place={place}
      index={0}
      total={1}
      note={null}
      attribution="Powered by a places provider"
      termsUrl={undefined}
      onClose={vi.fn()}
      onStep={vi.fn()}
    />,
  );
  return within(screen.getByRole('dialog', { name: 'Cafe A' }));
}

describe('PlaceDetailPopup open status', () => {
  it('shows Closed for an unrated place', () => {
    const dialog = renderPopup({ ...BASE_PLACE, openNow: false });

    expect(dialog.getByText('Closed')).toBeTruthy();
  });

  it('shows Open for an unrated place', () => {
    const dialog = renderPopup({ ...BASE_PLACE, openNow: true });

    expect(dialog.getByText('Open')).toBeTruthy();
  });

  it('shows the status beside a zero rating', () => {
    const dialog = renderPopup({ ...BASE_PLACE, rating: 0, openNow: false });

    expect(dialog.getByText('0.0')).toBeTruthy();
    expect(dialog.getByText('Closed')).toBeTruthy();
  });

  it('shows the status beside a rating', () => {
    const dialog = renderPopup({ ...BASE_PLACE, rating: 4.5, openNow: true });

    expect(dialog.getByText('4.5')).toBeTruthy();
    expect(dialog.getByText('Open')).toBeTruthy();
  });

  it('omits the status when openNow is not supplied', () => {
    const dialog = renderPopup({ ...BASE_PLACE, rating: 4.5 });

    expect(dialog.queryByText('Open')).toBeNull();
    expect(dialog.queryByText('Closed')).toBeNull();
  });
});
