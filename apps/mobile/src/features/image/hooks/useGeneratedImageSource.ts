import { useEffect, useMemo, useState } from 'react';
import { getAuthHeaders } from '@/services/authSession';
import { resolveGeneratedImageUri } from '@/src/features/image/services/imagegen';

export type GeneratedImageSourceStatus =
  | 'authorizing'
  | 'ready'
  | 'signed-out'
  | 'invalid'
  | 'error';

export interface GeneratedImageRequestSource {
  uri: string;
  headers?: Record<string, string>;
}

function ephemeralImageUri(value: string): string | null {
  const candidate = value.trim();
  if (/^https:\/\//i.test(candidate)) return candidate;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(candidate)) return candidate;
  return null;
}

/**
 * Resolve generated-image bytes without widening the Cloud trust boundary.
 *
 * Durable transcript images must be owner-scoped `/api/files/<uuid>` paths;
 * those resolve only through API_URL and receive a fresh Clerk bearer header
 * in memory. Explicitly-marked unsaved responses may display a provider/data
 * URI for this render only, without requesting or attaching an auth token.
 */
export function useGeneratedImageSource(
  imageUrl: string,
  allowEphemeral: boolean,
): {
  source: GeneratedImageRequestSource | null;
  status: GeneratedImageSourceStatus;
} {
  const durableUrl = useMemo(() => resolveGeneratedImageUri(imageUrl), [imageUrl]);
  const ephemeralUrl = useMemo(
    () => (allowEphemeral ? ephemeralImageUri(imageUrl) : null),
    [allowEphemeral, imageUrl],
  );
  const [source, setSource] = useState<GeneratedImageRequestSource | null>(() =>
    ephemeralUrl ? { uri: ephemeralUrl } : null,
  );
  const [status, setStatus] = useState<GeneratedImageSourceStatus>(() =>
    ephemeralUrl ? 'ready' : durableUrl ? 'authorizing' : 'invalid',
  );

  useEffect(() => {
    let active = true;
    if (ephemeralUrl) {
      setSource({ uri: ephemeralUrl });
      setStatus('ready');
      return () => {
        active = false;
      };
    }
    if (!durableUrl) {
      setSource(null);
      setStatus('invalid');
      return () => {
        active = false;
      };
    }

    setSource(null);
    setStatus('authorizing');
    void getAuthHeaders()
      .then((headers) => {
        if (!active) return;
        const authorization = headers.Authorization;
        if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
          setStatus('signed-out');
          return;
        }
        setSource({ uri: durableUrl, headers: { Authorization: authorization } });
        setStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [durableUrl, ephemeralUrl]);

  return { source, status };
}
