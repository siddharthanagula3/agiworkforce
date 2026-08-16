import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PairBody } from './pair-body';

export default function PairPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <PairBody />
        <MarketingFooter />
      </main>
    </div>
  );
}
