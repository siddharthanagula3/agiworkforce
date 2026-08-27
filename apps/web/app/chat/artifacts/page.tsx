import { redirect } from 'next/navigation';

/**
 * /chat/artifacts · retired destination, kept as a redirect.
 *
 * Artifacts and Library listed the same material. The server already classifies
 * every `media_assets` row as `surface: 'artifact' | 'file'`
 * (`classifyGeneratedFile`), and `GET /api/library` has always accepted
 * `?surface=` — so the split is a filter inside Library, not a second rail
 * destination. One generated file used to appear in both, under `<assetId>` in
 * Library and `genfile-<assetId>` in the gallery: two ids that can never
 * dedupe, so deleting it in Library left a card behind here.
 *
 * The public gallery is unaffected. `/gallery` keeps the marketing chrome, the
 * SEO metadata, the sitemap entry and the Inspiration tab for signed-out
 * visitors; only this in-app mirror is gone.
 *
 * Kept rather than deleted because the route was linked from the rail for
 * several releases, so live bookmarks and pasted URLs exist.
 */
export default function ChatArtifactsRoute(): never {
  redirect('/chat/library?surface=artifact');
}
