import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { GalleryClient } from './GalleryClient';

export const metadata: Metadata = {
  title: 'Gallery | AGI',
  description:
    'Browse artifacts you have built with AGI, or explore curated examples to spark your next idea.',
  alternates: { canonical: 'https://agiworkforce.com/gallery' },
};

export default function GalleryPage() {
  return (
    <div data-design="agi">
      <Header />
      <GalleryClient />
    </div>
  );
}
