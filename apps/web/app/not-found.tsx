import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Prose, Section, Stack } from '@/features/marketing/components/system';
import { NotFoundActions } from './not-found-client';

const TITLE_ID = 'agi-not-found-title';

export default function NotFound() {
  return (
    <div data-design="agi" data-route-state="not-found" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Section labelledBy={TITLE_ID} size="lg">
          <Stack gap="loose">
            <div>
              <h1 className="agi-ds-h1" id={TITLE_ID}>
                That page is not here.
              </h1>
            </div>
            <Prose>
              The address does not match a page on this site. It may have moved, or the link may
              have been mistyped. The home page lists every surface, and we answer email if you
              cannot find what you came for.
            </Prose>
            <NotFoundActions />
          </Stack>
        </Section>
      </main>
      <MarketingFooter condensed />
    </div>
  );
}
