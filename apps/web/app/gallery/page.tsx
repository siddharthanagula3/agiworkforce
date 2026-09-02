import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { GalleryClient } from './GalleryClient';

export const metadata = buildMetadata({
  title: 'Gallery: artifacts built with AGI',
  description:
    'Browse artifacts you have built with AGI, or explore curated examples to spark your next idea.',
  path: '/gallery',
});

export default function GalleryPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <GalleryClient />
      </main>
      <MarketingFooter />
    </div>
  );
}
