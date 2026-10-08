import { redirect } from 'next/navigation';

/**
 * /chat/images · retired destination, kept as a redirect.
 *
 * Images was a rail entry over the same pictures the Library's Images tab
 * lists, and new images are made in chat. Kept rather than deleted because the
 * route was linked from the rail, so live bookmarks and pasted URLs exist.
 */
export default function ChatImagesRoute(): never {
  redirect('/chat/library?tab=images');
}
