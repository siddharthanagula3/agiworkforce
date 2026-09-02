import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Partners',
  description:
    'There is no formal partner program yet. What does exist today: AGI speaks MCP, so connectors built against the open protocol work with it now. Here is what we are looking for.',
  path: '/partners',
});

const OPPORTUNITIES = [
  {
    meta: 'Available today',
    title: 'Build on MCP',
    body: 'AGI implements the Model Context Protocol, so a connector or tool server you build against the open spec works with AGI Desktop now, behind the same explicit tool-approval prompts as anything else. You do not need an agreement with us, or our permission, to build one.',
  },
  {
    meta: 'Looking for',
    title: 'Implementation and delivery partners',
    body: 'Consultancies and IT service providers who deploy AGI inside a client engagement, usually Local or BYOK, where the client’s data never reaches our infrastructure. We want to learn what the deployment actually requires before we design a program around it.',
  },
  {
    meta: 'Looking for',
    title: 'Local runtime and model ecosystems',
    body: 'AGI already routes to Ollama, LM Studio, llama.cpp, and vLLM as first-class local runtimes. If you build a local runtime or distribute open models and want AGI to work well with yours, that is a conversation we want.',
  },
] as const;

export default function PartnersPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-partners-title"
          eyebrow="Partners"
          title="No program yet. One open door."
          lede="We are not going to describe a partner program we have not built. There is no application form, no directory, and no reseller agreement behind this page. What is real today is that AGI speaks MCP, so anything you build against that open protocol already works with it. Beyond that, here is what we are actively looking for."
          ctas={[
            { href: contactMailto('Partnership enquiry'), label: 'Email partnerships' },
            { href: '/apps', label: 'See tools & connectors', variant: 'secondary' },
          ]}
        />

        <Section id="opportunities" labelledBy="agi-partners-opps-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Where we are</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-partners-opps-title">
                One thing that works now, two we are exploring.
              </h2>
              <Prose>
                Each of these says plainly whether it is available today or still a conversation, so
                you can tell which is which before you spend time on it.
              </Prose>
            </div>
            <FactGrid items={OPPORTUNITIES} />
          </Stack>
        </Section>

        <Section id="not-offering" labelledBy="agi-partners-honest-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>What we are not offering</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-partners-honest-title">
                So you do not waste a call.
              </h2>
            </div>
            <Ledger
              caption="What we are not offering"
              rows={[
                {
                  label: 'Reseller pricing',
                  value:
                    'No reseller or volume pricing program. Nothing of the kind exists yet. For a commercial conversation about a specific deal, talk to sales directly.',
                },
                {
                  label: 'OEM / white label',
                  value:
                    'No OEM or white-label licence, and no embeddable gateway SDK. AGI is proprietary and is not currently licensed for embedding in another product.',
                },
                {
                  label: 'Partner directory',
                  value:
                    'No partner directory, tiers, badges, or certification. If we build one, this page will say so.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="partners-close" labelledBy="agi-partners-close-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Talk to us</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-partners-close-title">
                Tell us what you are trying to build.
              </h2>
              <Prose>
                {`Email ${CONTACT_EMAIL} with what you have in mind. Concrete proposals get a real answer; we would rather say no clearly than leave you waiting on a program that does not exist.`}
              </Prose>
            </div>
            <ButtonRow>
              <Button href={contactMailto('Partnership enquiry')}>Email partnerships</Button>
              <Button href="/contact-sales" variant="secondary">
                Contact sales
              </Button>
            </ButtonRow>
          </Stack>
        </Section>

        <MarketingFooter />
      </main>
    </div>
  );
}
