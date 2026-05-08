import type { Metadata } from 'next';
import './instrument.css';

export const metadata: Metadata = {
  title: 'Redesign Preview · AGI Workforce',
  description: 'Internal preview of the new design language.',
  robots: { index: false, follow: false },
};

export default function RedesignPreviewLayout({ children }: { children: React.ReactNode }) {
  // Geist Sans + Geist Mono are already loaded globally by the root layout
  // (apps/web/app/layout.tsx) and exposed via --font-geist-sans / --font-geist-mono.
  // The preview's instrument.css references those CSS variables directly.
  return <div data-design="preview">{children}</div>;
}
