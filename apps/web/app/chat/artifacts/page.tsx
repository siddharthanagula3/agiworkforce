import { redirect } from 'next/navigation';

/**
 * Artifacts are a `surface` filter inside Library, not a second destination.
 * The route stays as a redirect because bookmarks and pasted URLs to it exist.
 */
export default function ChatArtifactsRoute(): never {
  redirect('/chat/library?surface=artifact');
}
