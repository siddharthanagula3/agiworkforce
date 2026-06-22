import { useEffect, useState } from 'react';

/**
 * Returns false during SSR and the first client render, then true after mount.
 *
 * Use this to gate browser-only render output (e.g. a sandboxed artifact iframe
 * whose `srcDoc` is produced by DOMPurify, which needs a real DOM) so the server
 * renders an inert placeholder and the real content is applied via a genuine,
 * post-mount React re-render — not via hydration attribute reconciliation, which
 * React does not reliably perform for attributes like iframe `srcDoc`.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
