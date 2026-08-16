import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';
import { CONTACT_EMAIL, contactMailto } from '../../lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Partners',
  description:
    'There is no formal partner program yet. What does exist today: AGI speaks MCP, so connectors built against the open protocol work with it now. Here is what we are looking for.',
  path: '/partners',
});

const OPPORTUNITIES: {
  meta: string;
  title: string;
  body: string;
  status: string;
}[] = [
  {
    meta: 'Available today',
    title: 'Build on MCP',
    body: 'AGI implements the Model Context Protocol, so a connector or tool server you build against the open spec works with AGI Desktop now — behind the same explicit tool-approval prompts as anything else. You do not need an agreement with us, or our permission, to build one.',
    status: 'No agreement required',
  },
  {
    meta: 'Looking for',
    title: 'Implementation and delivery partners',
    body: 'Consultancies and IT service providers who deploy AGI inside a client engagement — usually Local or BYOK, where the client’s data never reaches our infrastructure. We want to learn what the deployment actually requires before we design a program around it.',
    status: 'No formal program yet',
  },
  {
    meta: 'Looking for',
    title: 'Local runtime and model ecosystems',
    body: 'AGI already routes to Ollama, LM Studio, llama.cpp, and vLLM as first-class local runtimes. If you build a local runtime or distribute open models and want AGI to work well with yours, that is a conversation we want.',
    status: 'Case by case',
  },
];

export default function PartnersPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="Partners"
          titleLines={['No program yet.', 'One open door.']}
          em="One open door."
          lede="We are not going to describe a partner program we have not built — there is no application form, no directory, and no reseller agreement behind this page. What is real today is that AGI speaks MCP, so anything you build against that open protocol already works with it. Beyond that, here is what we are actively looking for."
          ctas={[
            { href: contactMailto('Partnership enquiry'), label: 'Email Partnerships' },
            { href: '/apps', label: 'See Tools & Connectors' },
          ]}
          modeRibbon={['Local · on-device', 'BYOK · your keys', 'Cloud · public alpha']}
        />

        <section className="agi-fl-section" aria-labelledby="agi-partners-opps-title">
          <p className="agi-fl-eyebrow">Where we are</p>
          <h2 id="agi-partners-opps-title" className="agi-fl-h2">
            One thing that works now, two we are exploring.
          </h2>
          <p className="agi-fl-section-lede">
            Each of these says plainly whether it is available today or still a conversation, so you
            can tell which is which before you spend time on it.
          </p>
          <div className="agi-scenarios">
            {OPPORTUNITIES.map((o) => (
              <article key={o.title} className="agi-scenario">
                <p className="agi-scenario-meta">{o.meta}</p>
                <h3 className="agi-scenario-title">{o.title}</h3>
                <p className="agi-scenario-problem">{o.body}</p>
                <p className="agi-scenario-caveat">
                  <span className="agi-scenario-caveat-tag">Status</span>
                  {o.status}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-partners-honest-title">
          <p className="agi-fl-eyebrow">What we are not offering</p>
          <h2 id="agi-partners-honest-title" className="agi-fl-h2">
            So you do not waste a call.
          </h2>
          <ul className="agi-press-notclaimed">
            <li>
              No reseller or volume pricing program. Nothing of the kind exists yet. For a
              commercial conversation about a specific deal, talk to sales directly.
            </li>
            <li>
              No OEM or white-label licence, and no embeddable gateway SDK. AGI is proprietary and
              is not currently licensed for embedding in another product.
            </li>
            <li>
              No partner directory, tiers, badges, or certification. If we build one, this page will
              say so.
            </li>
          </ul>
        </section>

        <FinalCta
          eyebrow="Talk to us"
          title="Tell us what you are trying to build."
          body={`Email ${CONTACT_EMAIL} with what you have in mind. Concrete proposals get a real answer; we would rather say no clearly than leave you waiting on a program that does not exist.`}
          ctas={[
            { href: contactMailto('Partnership enquiry'), label: 'Email Partnerships' },
            { href: '/contact-sales', label: 'Talk to Sales' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
