/**
 * Desktop adapter for the shared Library surface.
 *
 * The view lives in `@agiworkforce/unified-chat` and is shared with web, so
 * Desktop shows the same Library rather than a second implementation that
 * would drift. This file supplies only what differs here: absolute Cloud URLs,
 * the bearer-token `cloudFetch` (which also invalidates the session on 401),
 * and opening a preview in the OS browser instead of a tab.
 *
 * Library is a Managed Cloud surface — the files live in cloud storage — so it
 * asks for sign-in rather than pretending to be empty when signed out.
 */
import { useMemo } from 'react';
import { LibraryView, type LibraryTransport } from '@agiworkforce/unified-chat';
import { CLOUD_API_BASE_URL, cloudFetch } from '@/api/cloudApi';
import { selectHasCloudAccountSession, useAuthStore } from '@/stores/auth';
import { openExternalUrl } from '@/utils/navigation';

/** Resolve a server-supplied uri, which may be relative, against Cloud. */
function absoluteCloudUrl(uri: string): string {
  return uri.startsWith('http://') || uri.startsWith('https://')
    ? uri
    : `${CLOUD_API_BASE_URL}${uri}`;
}

export function DesktopLibrary() {
  const isSignedIn = useAuthStore(selectHasCloudAccountSession);

  const transport = useMemo<LibraryTransport>(
    () => ({
      isSignedIn,
      listPage: (params) => cloudFetch(`${CLOUD_API_BASE_URL}/api/library?${params.toString()}`),
      fetchAsset: (uri) => cloudFetch(absoluteCloudUrl(uri)),
      // cloudFetch attaches the bearer token; the endpoint is owner-scoped
      // server-side, so no CSRF header is involved on this transport.
      restoreItem: (id) =>
        cloudFetch(`${CLOUD_API_BASE_URL}/api/media?id=${encodeURIComponent(id)}`, {
          method: 'POST',
        }),
      // No tabs here — hand the authed URL to the OS browser.
      openPreview: (uri) => {
        void openExternalUrl(absoluteCloudUrl(uri));
      },
    }),
    [isSignedIn],
  );

  if (!isSignedIn) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 py-20 text-center">
        <p className="text-base font-semibold text-[var(--chat-text-primary)]">
          Sign in to see your Library
        </p>
        <p className="mx-auto max-w-md text-sm text-[var(--chat-text-muted)]">
          Files generated in your conversations are stored in AGI Cloud. Local-only sessions keep
          their files on this device and are not cataloged here.
        </p>
      </div>
    );
  }

  return <LibraryView transport={transport} />;
}

export default DesktopLibrary;
