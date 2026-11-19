import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PlacesCardPhoto } from '@agiworkforce/types';
import { PlacePhotoCarousel } from './PlacePhotoCarousel';

const PHOTOS: PlacesCardPhoto[] = [
  { reference: 'places/p1/photos/a' },
  { reference: 'places/p1/photos/b' },
];

describe('PlacePhotoCarousel', () => {
  it('keeps the selectors when the current photo fails so the next photo is reachable', () => {
    render(<PlacePhotoCarousel photos={PHOTOS} placeName="Cafe A" />);

    fireEvent.error(screen.getByRole('img', { name: 'Photo of Cafe A' }));

    expect(screen.getByText('Photo unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show photo 2 of 2' }));

    const image = screen.getByRole('img', { name: 'Photo of Cafe A' });
    expect(image.getAttribute('src')).toContain(encodeURIComponent(PHOTOS[1]!.reference));
    expect(screen.queryByText('Photo unavailable')).toBeNull();
  });

  it('renders nothing once every photo has failed', () => {
    const { container } = render(<PlacePhotoCarousel photos={PHOTOS} placeName="Cafe A" />);

    fireEvent.error(screen.getByRole('img', { name: 'Photo of Cafe A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show photo 2 of 2' }));
    fireEvent.error(screen.getByRole('img', { name: 'Photo of Cafe A' }));

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a single photo that fails', () => {
    const { container } = render(
      <PlacePhotoCarousel photos={PHOTOS.slice(0, 1)} placeName="Cafe A" />,
    );

    fireEvent.error(screen.getByRole('img', { name: 'Photo of Cafe A' }));

    expect(container.firstChild).toBeNull();
  });
});
