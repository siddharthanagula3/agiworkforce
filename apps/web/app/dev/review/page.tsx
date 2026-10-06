import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { MarketingHeader } from '@features/marketing/components/system';
import beforeDesktop from './assets/pricing-audit-desktop.jpg';
import beforeNarrow from './assets/pricing-audit-narrow.jpg';
import afterPhoneLight from './assets/pricing-reference-390-light.png';
import afterPhoneDark from './assets/pricing-reference-390-dark.png';
import afterDesktopLight from './assets/pricing-reference-1366-light.png';
import afterDesktopDark from './assets/pricing-reference-1920-dark.png';
import docsBeforeLight from './assets/docs-before-390-light.png';
import docsBeforeDark from './assets/docs-before-390-dark.png';
import docsAfterPhoneLight from './assets/docs-after-390-light.png';
import docsAfterPhoneDark from './assets/docs-after-390-dark.png';
import docsAfterDesktopLight from './assets/docs-after-1440-light.png';
import docsAfterDesktopDark from './assets/docs-after-1440-dark.png';
import './review.css';

export const metadata: Metadata = {
  title: 'Public page review | AGI Workforce',
  robots: { index: false, follow: false },
};

export default function PublicPageReview() {
  return (
    <div data-design="agi" data-public-reference="review">
      <MarketingHeader minimal />
      <main id="main-content" tabIndex={-1} className="agi-review">
        <h1>Public page review</h1>
        <p>Reference layouts are reviewed here before they are applied to other pages.</p>

        <section aria-labelledby="pricing-reference-title" className="agi-review-section">
          <div className="agi-review-title-row">
            <h2 id="pricing-reference-title">Pricing</h2>
            <span className="agi-review-status">Ready for visual review</span>
          </div>
          <p>
            A compact Geist title, readable plan cards, a neutral light and dark palette, and a
            phone comparison selector. Please review the layout and palette; full page verification
            remains in progress.
          </p>
          <Link href="/pricing" className="agi-review-open">
            Open the Pricing reference
          </Link>

          <h3>Reference captures</h3>
          <p>
            These October 5 snapshots were captured in fresh signed-out browser sessions, after
            choosing Necessary only in the cookie banner. Reduced motion was enabled. They may
            differ from the latest localhost page. The desktop widths are labelled below.
          </p>
          <div className="agi-review-captures">
            <figure>
              <Image
                src={afterDesktopLight}
                alt="Light Pricing reference snapshot with a compact Geist title and four readable plan cards"
                sizes="(max-width: 767px) 100vw, 50vw"
              />
              <figcaption>After: light, 1366 × 900 px</figcaption>
            </figure>
            <figure>
              <Image
                src={afterDesktopDark}
                alt="Dark Pricing reference snapshot with a compact title and four plan cards on a neutral black page"
                sizes="(max-width: 767px) 100vw, 50vw"
              />
              <figcaption>After: dark, 1920 × 900 px</figcaption>
            </figure>
            <figure>
              <Image
                src={afterPhoneLight}
                alt="Light phone Pricing reference snapshot with the Free plan in a full-width readable card"
                sizes="(max-width: 767px) 100vw, 50vw"
              />
              <figcaption>After: light phone, 390 × 844 px</figcaption>
            </figure>
            <figure>
              <Image
                src={afterPhoneDark}
                alt="Dark phone Pricing reference snapshot with the Free plan in a full-width readable card"
                sizes="(max-width: 767px) 100vw, 50vw"
              />
              <figcaption>After: dark phone, 390 × 844 px</figcaption>
            </figure>
          </div>
          <p>
            These images support visual review. The complete width matrix, desktop cookie-banner
            accessibility check, and Free-plan disclosure review are still pending.
          </p>

          <h3>Earlier public audit captures</h3>
          <p>
            These October 4 captures predate the October 5 localhost baseline. They show the audited
            design; they are not same-viewport captures of the current baseline.
          </p>
          <div className="agi-review-captures">
            <figure>
              <Image
                src={beforeDesktop}
                alt="October 4 Pricing audit showing a large serif heading and dense desktop plan cards"
                sizes="(max-width: 767px) 100vw, 50vw"
              />
              <figcaption>Before: desktop public audit, October 4</figcaption>
            </figure>
            <figure>
              <Image
                src={beforeNarrow}
                alt="October 4 narrow Pricing audit showing the serif heading and a stacked plan card"
                sizes="(max-width: 767px) 100vw, 50vw"
              />
              <figcaption>Before: narrow public audit, October 4</figcaption>
            </figure>
          </div>
        </section>

        <section aria-labelledby="docs-reference-title" className="agi-review-section">
          <div className="agi-review-title-row">
            <h2 id="docs-reference-title">Documentation article</h2>
            <span className="agi-review-status">Ready for visual review</span>
          </div>
          <p>
            A reading layout with grouped navigation, article search, copy page, section links and
            previous/next guides. On a phone, navigation opens in a drawer and the section list
            opens above the article. Please review the layout; article truth, update dates and full
            page verification are still in progress.
          </p>
          <Link href="/help/local-mode" className="agi-review-open">
            Open the Docs article reference
          </Link>{' '}
          <Link href="/docs" className="agi-review-open">
            Open the documentation home
          </Link>
          <h3>Reference captures</h3>
          <p>
            October 5 snapshots from fresh signed-out sessions, after the real Necessary only
            choice, with reduced motion. They may differ from the latest localhost page. These
            viewport captures do not show the complete article or prove that every article has been
            checked.
          </p>
          <div className="agi-review-captures">
            <figure>
              <Image
                src={docsAfterDesktopLight}
                alt="Docs article with left page navigation, a reading column and a right section list in light mode"
                sizes="(max-width: 767px) 100vw, 50vw"
              />
              <figcaption>After: light, 1440 × 900 px</figcaption>
            </figure>
            <figure>
              <Image
                src={docsAfterDesktopDark}
                alt="Docs article with page navigation, a reading column and section links in dark mode"
                sizes="(max-width: 767px) 100vw, 50vw"
              />
              <figcaption>After: dark, 1440 × 900 px</figcaption>
            </figure>
            <figure>
              <Image
                src={docsAfterPhoneLight}
                alt="Phone Docs article with a section-list disclosure, readable metadata and copy-page action in light mode"
                sizes="(max-width: 767px) 100vw, 50vw"
              />
              <figcaption>After: light phone, 390 × 844 px</figcaption>
            </figure>
            <figure>
              <Image
                src={docsAfterPhoneDark}
                alt="Phone Docs article with section-list disclosure and a copy-page action in dark mode"
                sizes="(max-width: 767px) 100vw, 50vw"
              />
              <figcaption>After: dark phone, 390 × 844 px</figcaption>
            </figure>
          </div>
          <h3>Earlier article prototype</h3>
          <p>
            These same-width captures show the earlier localhost prototype with smaller labels and
            no phone section list. They are not captures of the original public audit deployment.
          </p>
          <div className="agi-review-captures">
            <figure>
              <Image
                src={docsBeforeLight}
                alt="Earlier phone Docs prototype with smaller metadata and no section-list control in light mode"
                sizes="(max-width: 767px) 100vw, 50vw"
              />
              <figcaption>Before: light phone, 390 × 844 px</figcaption>
            </figure>
            <figure>
              <Image
                src={docsBeforeDark}
                alt="Earlier phone Docs prototype with smaller metadata and no section-list control in dark mode"
                sizes="(max-width: 767px) 100vw, 50vw"
              />
              <figcaption>Before: dark phone, 390 × 844 px</figcaption>
            </figure>
          </div>
        </section>

        <section aria-labelledby="approved-types-title" className="agi-review-section">
          <h2 id="approved-types-title">Approved and rolled out</h2>
          <p>No new reference page type has been approved yet.</p>
        </section>
      </main>
    </div>
  );
}
