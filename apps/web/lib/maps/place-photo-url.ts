export const PLACE_PHOTO_ENDPOINT = '/api/maps/place-photo';
export const PLACE_PHOTO_REFERENCE_PARAM = 'ref';
export const PLACE_PHOTO_WIDTH_PARAM = 'w';

export const PLACE_PHOTO_MIN_WIDTH_PX = 96;
export const PLACE_PHOTO_MAX_WIDTH_PX = 1200;
export const PLACE_PHOTO_DEFAULT_WIDTH_PX = 400;
export const PLACE_PHOTO_THUMBNAIL_WIDTH_PX = 160;
export const PLACE_PHOTO_DETAIL_WIDTH_PX = 640;

export function placePhotoUrl(reference: string, widthPx: number): string {
  const params = new URLSearchParams({
    [PLACE_PHOTO_REFERENCE_PARAM]: reference,
    [PLACE_PHOTO_WIDTH_PARAM]: String(widthPx),
  });
  return `${PLACE_PHOTO_ENDPOINT}?${params.toString()}`;
}
