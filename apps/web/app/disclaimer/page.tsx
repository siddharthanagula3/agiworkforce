import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { CONTACT_EMAIL, LEGAL_ENTITY, PRODUCT_NAME, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Disclaimer',
  description: `What ${PRODUCT_NAME} output is and is not: accuracy limits, professional advice, and third-party models.`,
  path: '/disclaimer',
});

export default function DisclaimerPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Legal</p>
          <h1 className="agi-page-h1">Disclaimer.</h1>
          <p className="agi-page-lede">
            {PRODUCT_NAME} generates text, code, and files with language models. Model output can be
            wrong, out of date, or confidently invented. Check anything you intend to rely on.
          </p>
        </section>

        <section className="agi-page-section">
          <h2 className="agi-section-h2">Output is not verified</h2>
          <p className="agi-page-p">
            Responses are produced statistically, not retrieved from a checked record. A model can
            state a false fact in the same tone it states a true one, cite a source that does not
            say what it is claimed to say, or produce code that runs and is still wrong. Where a
            response includes citations or search results, the underlying pages are third-party
            content we do not control or endorse.
          </p>
          <p className="agi-page-p">
            You are responsible for reviewing output before acting on it, publishing it, or putting
            it into production.
          </p>
        </section>

        <section className="agi-page-section">
          <h2 className="agi-section-h2">Not professional advice</h2>
          <p className="agi-page-p">
            Nothing {PRODUCT_NAME} produces is legal, medical, financial, tax, or other regulated
            professional advice, and using it does not create a professional relationship of any
            kind. For a decision with legal, health, or financial consequences, consult someone
            qualified and licensed in the relevant jurisdiction.
          </p>
        </section>

        <section className="agi-page-section">
          <h2 className="agi-section-h2">Third-party models and providers</h2>
          <p className="agi-page-p">
            {PRODUCT_NAME} routes requests to models operated by third parties. Their availability,
            behaviour, and results can change without notice, and a model named in the interface may
            be updated or retired by its provider. Provider names and marks belong to their
            respective owners and their appearance here does not imply endorsement.
          </p>
          <p className="agi-page-p">
            When you connect a tool or bring your own key, that provider&rsquo;s own terms govern
            what it does with your data. See the{' '}
            <Link className="agi-link" href="/privacy">
              Privacy Policy
            </Link>{' '}
            for how the trust boundaries differ.
          </p>
        </section>

        <section className="agi-page-section">
          <h2 className="agi-section-h2">Availability</h2>
          <p className="agi-page-p">
            Features marked alpha or beta are unfinished, may fail or stall, and can change or be
            withdrawn. Current service state is published on{' '}
            <Link className="agi-link" href="/status">
              the status page
            </Link>
            .
          </p>
        </section>

        <section className="agi-page-section">
          <h2 className="agi-section-h2">How this fits the rest</h2>
          <p className="agi-page-p">
            This page explains the limits of the output. The warranty disclaimers and limitation of
            liability that govern your use of the service are in the{' '}
            <Link className="agi-link" href="/terms">
              Terms of Service
            </Link>
            , and what you may do with {PRODUCT_NAME} is in the{' '}
            <Link className="agi-link" href="/acceptable-use">
              Acceptable Use Policy
            </Link>
            . Where this page and the Terms differ, the Terms control.
          </p>
          <p className="agi-page-p">
            Questions about anything here go to{' '}
            <a className="agi-link" href={contactMailto('Disclaimer question')}>
              {CONTACT_EMAIL}
            </a>
            . {LEGAL_ENTITY} publishes this page as guidance, not as a substitute for the Terms.
          </p>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
