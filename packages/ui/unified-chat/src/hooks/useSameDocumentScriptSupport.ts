import { useEffect, useState } from 'react';
import {
  getSameDocumentScriptSupport,
  type ArtifactPreviewScriptSupport,
} from '../lib/artifact-preview-capability';

/**
 * Whether a same-document (`srcdoc`) artifact preview may execute scripts here.
 *
 * Starts at `'unknown'` and settles once the one-shot capability probe resolves
 * (see `lib/artifact-preview-capability.ts` for why this is measured rather than
 * inferred). Callers must treat `'unknown'` as "show no warning" — an
 * inconclusive probe must never manufacture a scary state.
 */
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
