import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PairBody } from '../pair-body';

/**
 * `/pair/<segment>` — the wildcard the AASA claims as `/pair/*`.
 *
 * The `[code]` segment is deliberately not read. Nothing in the product mints a
 * code-bearing pairing URL (see the note in `../pair-body.tsx`), and echoing an
 * unvalidated path segment back into the page would be the only reason to touch
 * it. The route exists so the claimed pattern resolves instead of 404ing.
 */
export default function PairCodePage() {
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
