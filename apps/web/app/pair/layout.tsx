import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pair your phone',
  description: 'Finish pairing AGI Desktop with the AGI mobile app.',
  // A pairing URL can carry a live credential in its path or query string, and
  // the page has nothing a search result should point at. Never index it.
  //
  // No `alternates.canonical`: this layout covers `/pair` and every `/pair/*`
  // URL, so a single canonical here would make each of them advertise `/pair`.
  robots: { index: false, follow: false },
};

export default function PairLayout({ children }: { children: React.ReactNode }) {
  return children;
}
