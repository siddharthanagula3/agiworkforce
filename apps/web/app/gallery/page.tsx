import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { GalleryClient } from './GalleryClient';

export const metadata: Metadata = {
  title: 'Gallery',
  description:
    'Browse artifacts you have built with AGI, or explore curated examples to spark your next idea.',
  alternates: { canonical: 'https://agiworkforce.com/gallery' },
};

export default function GalleryPage() {
  return (
    <div data-design="agi">
      <main>
        <div className="agi-shell">
          <Header />
        </div>
        <GalleryClient />
      </main>
      <div className="agi-shell">
        <MarketingFooter />
      </div>
    </div>
  );
}
