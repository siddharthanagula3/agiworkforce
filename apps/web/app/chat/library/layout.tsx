import type { Metadata } from 'next';

/** See the sibling projects layout: a client page cannot carry its own title. */
export const metadata: Metadata = {
  title: 'Library',
  description: 'Everything this account has generated or uploaded.',
  robots: { index: false, follow: false },
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
