import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PairBody } from './pair-body';

/** `/pair` — one of the two pairing patterns the AASA and the Android intent filter claim. */
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
