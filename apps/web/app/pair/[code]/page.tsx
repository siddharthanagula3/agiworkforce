import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PairBody } from '../PairBody';

export default function PairCodePage() {
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
