import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Prose, Section, Stack } from '@/features/marketing/components/system';
import { DesktopRouteMessage } from '@/features/desktop-host/components/DesktopRouteMessage';
import { DesktopRouteSurface } from '@/features/desktop-host/components/DesktopRouteSurface';
import { NotFoundActions } from './not-found-client';

const TITLE_ID = 'agi-not-found-title';

const DESKTOP_TITLE = "This page doesn't exist.";
const DESKTOP_DESCRIPTION = 'The address does not match anything in the app.';

export default function NotFound() {
  return (
    <DesktopRouteSurface
      desktop={<DesktopRouteMessage title={DESKTOP_TITLE} description={DESKTOP_DESCRIPTION} />}
    >
      <div
        data-design="agi"
        data-route-state="not-found"
        data-surface="web"
        className="agi-ds-page"
      >
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
    </DesktopRouteSurface>
  );
}
