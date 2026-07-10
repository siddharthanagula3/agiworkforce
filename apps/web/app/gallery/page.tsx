import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { GalleryClient } from './GalleryClient';

export const metadata = buildMetadata({
  title: 'Gallery',
  description:
    'Browse artifacts you have built with AGI, or explore curated examples to spark your next idea.',
  path: '/gallery',
});

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
