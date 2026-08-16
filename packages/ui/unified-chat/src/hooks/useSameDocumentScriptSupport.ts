import { useEffect, useState } from 'react';
import {
  getSameDocumentScriptSupport,
  type ArtifactPreviewScriptSupport,
} from '../lib/artifact-preview-capability';

export function useSameDocumentScriptSupport(): ArtifactPreviewScriptSupport {
  const [support, setSupport] = useState<ArtifactPreviewScriptSupport>('unknown');

  useEffect(() => {
    let cancelled = false;
    void getSameDocumentScriptSupport().then((result) => {
      if (!cancelled) setSupport(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return support;
}
