import { useCallback, useState } from 'react';
import { libraryThumbnailPath } from '@agiworkforce/cloud-contracts';

interface LibraryThumbnailAsset {
  id: string;
  uri: string;
  thumbnailUri?: string | undefined;
}

export function useLibraryThumbnail(asset: LibraryThumbnailAsset): {
  uri: string;
  fallBackToFullFile: () => void;
} {
  const [refusedUri, setRefusedUri] = useState<string | null>(null);
  const thumbnailUri =
    asset.thumbnailUri === libraryThumbnailPath(asset.id) ? asset.thumbnailUri : undefined;
  const drawingThumbnail = thumbnailUri !== undefined && thumbnailUri !== refusedUri;
  const fallBackToFullFile = useCallback(() => {
    if (drawingThumbnail) setRefusedUri(thumbnailUri);
  }, [drawingThumbnail, thumbnailUri]);
  return { uri: drawingThumbnail ? thumbnailUri : asset.uri, fallBackToFullFile };
}
