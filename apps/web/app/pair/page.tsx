import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PairBody } from './pair-body';

export default function PairPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PairBody />
      </main>
      <MarketingFooter />
    </div>
  );
}
