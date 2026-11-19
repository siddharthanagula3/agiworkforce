import { act, renderHook } from '@testing-library/react-native';
import { useLibraryThumbnail } from '@/src/features/library/useLibraryThumbnail';

const ASSET_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ASSET_ID = '33333333-3333-4333-8333-333333333333';
const FULL_FILE = `/api/files/${ASSET_ID}`;
const THUMBNAIL = `/api/files/${ASSET_ID}/thumbnail`;

describe('useLibraryThumbnail', () => {
  it('draws the thumbnail the server offers for this file', () => {
    const { result } = renderHook(() =>
      useLibraryThumbnail({ id: ASSET_ID, uri: FULL_FILE, thumbnailUri: THUMBNAIL }),
    );
    expect(result.current.uri).toBe(THUMBNAIL);
  });

  it.each([
    ['the thumbnail of another file', `/api/files/${OTHER_ASSET_ID}/thumbnail`],
    ['the full file of this file', FULL_FILE],
    ['an outside address', 'https://cdn.example.com/picture.webp'],
    ['the thumbnail with a query', `${THUMBNAIL}?size=large`],
  ])('draws the full file when the server offers %s as the thumbnail', (_label, offered) => {
    const { result } = renderHook(() =>
      useLibraryThumbnail({ id: ASSET_ID, uri: FULL_FILE, thumbnailUri: offered }),
    );
    expect(result.current.uri).toBe(FULL_FILE);
  });

  it('draws the full file once the thumbnail fails to load', () => {
    const { result } = renderHook(() =>
      useLibraryThumbnail({ id: ASSET_ID, uri: FULL_FILE, thumbnailUri: THUMBNAIL }),
    );
    act(() => result.current.fallBackToFullFile());
    expect(result.current.uri).toBe(FULL_FILE);
  });
});
