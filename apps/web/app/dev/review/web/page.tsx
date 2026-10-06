import type { Metadata } from 'next';
import WebSurfacePage from '@/app/web/page';
import './web-reference.css';

export const metadata: Metadata = {
  title: 'Web palette review | AGI Workforce',
  robots: { index: false, follow: false },
};

export default function WebPaletteReview() {
  return (
    <div data-design="agi" data-public-reference="web-neutral">
      <WebSurfacePage />
    </div>
  );
}
