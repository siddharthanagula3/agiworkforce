import { describe, expect, it } from 'vitest';
import {
  PLACE_PHOTO_DETAIL_WIDTH_PX,
  PLACE_PHOTO_ENDPOINT,
  PLACE_PHOTO_REFERENCE_PARAM,
  PLACE_PHOTO_THUMBNAIL_WIDTH_PX,
  PLACE_PHOTO_WIDTH_PARAM,
  isAllowedPlaceDirectionsUrl,
  placePhotoUrl,
} from '../index';

describe('place photo proxy url', () => {
  it('points at the first-party proxy with the reference and width the route reads', () => {
    const reference = 'places/abc/photos/def';
    const url = placePhotoUrl(reference, PLACE_PHOTO_THUMBNAIL_WIDTH_PX);
    const [path, query] = url.split('?');
    const params = new URLSearchParams(query);

    expect(path).toBe(PLACE_PHOTO_ENDPOINT);
    expect(params.get(PLACE_PHOTO_REFERENCE_PARAM)).toBe(reference);
    expect(params.get(PLACE_PHOTO_WIDTH_PARAM)).toBe(String(PLACE_PHOTO_THUMBNAIL_WIDTH_PX));
    expect(url).toBe('/api/maps/place-photo?ref=places%2Fabc%2Fphotos%2Fdef&w=160');
  });

  it('keeps the detail width wider than the row thumbnail', () => {
    expect(PLACE_PHOTO_DETAIL_WIDTH_PX).toBeGreaterThan(PLACE_PHOTO_THUMBNAIL_WIDTH_PX);
  });
});

describe('place directions url', () => {
  it('accepts the Google Maps place links the places provider stores', () => {
    expect(isAllowedPlaceDirectionsUrl('https://maps.google.com/?cid=3545450935484072529')).toBe(
      true,
    );
    expect(
      isAllowedPlaceDirectionsUrl(
        'https://www.google.com/maps/dir/?api=1&destination=30.2,-97.7&travelmode=walking',
      ),
    ).toBe(true);
    expect(isAllowedPlaceDirectionsUrl('https://www.google.com/maps/place/?q=place_id:abc')).toBe(
      true,
    );
  });

  it('rejects any other origin, scheme, port, credential or path', () => {
    expect(isAllowedPlaceDirectionsUrl('http://maps.google.com/?cid=1')).toBe(false);
    expect(isAllowedPlaceDirectionsUrl('https://maps.google.com.evil.example/?cid=1')).toBe(false);
    expect(isAllowedPlaceDirectionsUrl('https://maps.google.com:444/?cid=1')).toBe(false);
    expect(isAllowedPlaceDirectionsUrl('https://user:pass@maps.google.com/?cid=1')).toBe(false);
    expect(isAllowedPlaceDirectionsUrl('https://maps.google.com/')).toBe(false);
    expect(isAllowedPlaceDirectionsUrl('https://www.google.com/search?q=maps')).toBe(false);
    expect(isAllowedPlaceDirectionsUrl('https://www.google.com/mapsevil')).toBe(false);
    expect(isAllowedPlaceDirectionsUrl('https://maps.example.com/blue-bottle')).toBe(false);
    expect(isAllowedPlaceDirectionsUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedPlaceDirectionsUrl('not a url')).toBe(false);
  });
});
