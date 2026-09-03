import {
  Button,
  ButtonRow,
  HeroHeadline,
  Ledger,
  MarketingFooter,
  MarketingHeader,
  MotionReveal,
  ProductFrame,
  Prose,
  Section,
  Stack,
  StickyLedger,
  SurfaceStatus,
  WEB_ENTRY_HREF,
} from '../system';
import { RouteReceipt } from './RouteReceipt';
import {
  CAPABILITIES,
  ENTERPRISE_ROWS,
  HERO_QUESTION,
  HERO_ROUTES,
  LANE_PANELS,
  SURFACES,
  TIERS,
} from './landing-content';

const HERO_TITLE_ID = 'agi-landing-hero-title';
const CLI_HREF = '/download';
const PRICING_HREF = '/pricing';
const ENTERPRISE_HREF = '/enterprise';

export function LandingPage() {
  return (
    <div data-design="agi" className="agi-ds-page agi-landing">
      <MarketingHeader />
      <main id="main-content">
        <section className="agi-ds-section agi-ds-hero" aria-labelledby={HERO_TITLE_ID}>
          <div className="agi-ds-container">
            <Stack gap="loose" className="agi-ds-hero-stack">
              <HeroHeadline id={HERO_TITLE_ID} text={HERO_QUESTION} />
              <Prose size="lg">
                Ask something and AGI can answer it three ways: on hardware you run, through your
                own provider key that never touches ours, or on AGI&rsquo;s metered capacity. Every
                answer carries the label of where it ran.
              </Prose>
              <div className="agi-ds-receipt-row">
                {HERO_ROUTES.map((route) => (
                  <RouteReceipt
                    lane={route.lane}
                    detail={route.detail}
                    note={route.note}
                    key={route.lane}
                  />
                ))}
              </div>
              <ButtonRow>
                <Button href={WEB_ENTRY_HREF}>Try AGI Web</Button>
                <Button href={CLI_HREF} variant="secondary">
                  Get the CLI
                </Button>
              </ButtonRow>
            </Stack>
          </div>
        </section>

        <Section id="where-it-runs" labelledBy="agi-landing-lanes-title" rule size="lg">
          <StickyLedger
            heading={
              <h2 className="agi-ds-h2" id="agi-landing-lanes-title">
                One account. Three places the work can run.
              </h2>
            }
            panels={LANE_PANELS.map((panel) => ({
              lane: panel.lane,
              title: panel.title,
              body: (
                <Stack>
                  <h3 className="agi-ds-h3">{panel.title}</h3>
                  <Prose size="sm">{panel.summary}</Prose>
                  <Ledger rows={panel.rows} caption={panel.title} />
                </Stack>
              ),
            }))}
          />
        </Section>

        <Section id="surfaces" labelledBy="agi-landing-surfaces-title" rule ground="2">
          <div className="agi-ds-split">
            <Stack>
              <h2 className="agi-ds-h2" id="agi-landing-surfaces-title">
                What you can install today.
              </h2>
              <Prose size="sm">
                Every line states its own release state. The download page is the source, and it
                reads the published release rather than a claim typed on this page.
              </Prose>
            </Stack>
            <div className="agi-ds-full">
              {SURFACES.map((surface) => (
                <SurfaceStatus key={surface.name} {...surface} />
              ))}
            </div>
          </div>
        </Section>

        <Section id="capabilities" labelledBy="agi-landing-capabilities-title" rule size="lg">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-landing-capabilities-title">
              Screens from the running product.
            </h2>
            <div className="agi-ds-grid-2">
              {CAPABILITIES.map((capability, index) => (
                <MotionReveal key={capability.title} delay={index % 2 === 0 ? 0 : 0.08}>
                  <Stack>
                    <h3 className="agi-ds-h3">{capability.title}</h3>
                    <Prose size="sm">{capability.body}</Prose>
                    <ProductFrame
                      light={capability.image.light}
                      dark={capability.image.dark}
                      alt={capability.image.alt}
                      width={capability.image.width}
                      height={capability.image.height}
                      caption={capability.caption}
                    />
                  </Stack>
                </MotionReveal>
              ))}
            </div>
          </Stack>
        </Section>

        <Section id="pricing" labelledBy="agi-landing-pricing-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-landing-pricing-title">
              Pay only for the cloud lane.
            </h2>
            <Prose>
              Local costs nothing and your own key is billed by your own provider. These plans buy
              capacity on ours.
            </Prose>
            <div className="agi-ds-tier-grid">
              {TIERS.map((tier) => (
                <div
                  className="agi-ds-tier"
                  data-recommended={tier.recommended ? 'true' : 'false'}
                  key={tier.name}
                >
                  <div className="agi-ds-tier-head">
                    <span className="agi-ds-tier-name">{tier.name}</span>
                    {tier.recommended ? (
                      <span className="agi-ds-tier-mark">Recommended</span>
                    ) : null}
                  </div>
                  <span className="agi-ds-tier-price">{tier.price}</span>
                  <Prose size="sm">{tier.cadence}</Prose>
                  <Prose size="sm" tone="ink">
                    {tier.detail}
                  </Prose>
                </div>
              ))}
            </div>
            <Button href={PRICING_HREF} variant="secondary">
              See the full matrix
            </Button>
          </Stack>
        </Section>

        <Section id="enterprise" labelledBy="agi-landing-enterprise-title" rule>
          <div className="agi-ds-split">
            <Stack>
              <h2 className="agi-ds-h2" id="agi-landing-enterprise-title">
                What we hold, and what we do not.
              </h2>
              <Button href={ENTERPRISE_HREF} variant="secondary">
                Read the enterprise page
              </Button>
            </Stack>
            <Ledger rows={ENTERPRISE_ROWS} caption="Enterprise posture" />
          </div>
        </Section>

        <Section id="start" labelledBy="agi-landing-cta-title" rule size="lg" ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-landing-cta-title">
              Start on the web, then move a session anywhere.
            </h2>
            <Prose>
              AGI Web needs no install. The CLI is signed and downloadable now. Whichever you open,
              the answer says which computer produced it.
            </Prose>
            <ButtonRow>
              <Button href={WEB_ENTRY_HREF}>Try AGI Web</Button>
              <Button href={CLI_HREF} variant="secondary">
                Get the CLI
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
