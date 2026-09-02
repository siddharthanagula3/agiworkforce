import {
  Button,
  ButtonRow,
  Eyebrow,
  HeroHeadline,
  LaneLabel,
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

function HeroLedger() {
  return (
    <div className="agi-ds-thread">
      <div className="agi-ds-turn">
        <span className="agi-ds-turn-role">You</span>
        <p className="agi-ds-turn-body">{HERO_QUESTION}</p>
      </div>
      <div className="agi-ds-route-rail">
        <span className="agi-ds-turn-role">Where this can run</span>
        {HERO_ROUTES.map((route) => (
          <div className="agi-ds-route-row" data-active="true" key={route.lane}>
            <LaneLabel lane={route.lane} detail={route.detail} />
            <span className="agi-ds-route-note">{route.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <MarketingHeader />
      <main id="main-content">
        <section className="agi-ds-section agi-ds-hero" aria-labelledby={HERO_TITLE_ID}>
          <div className="agi-ds-container">
            <div className="agi-ds-grid-2">
              <Stack gap="loose">
                <div>
                  <Eyebrow>Routing</Eyebrow>
                  <HeroHeadline id={HERO_TITLE_ID} text="Pick where the request runs." />
                </div>
                <Prose size="lg">
                  Ask something and AGI can answer it three ways: on hardware you run, through your
                  own provider key that never touches ours, or on AGI&rsquo;s metered capacity.
                  Every answer carries the label of where it ran.
                </Prose>
                <ButtonRow>
                  <Button href={WEB_ENTRY_HREF}>Try AGI Web</Button>
                  <Button href={CLI_HREF} variant="secondary">
                    Get the CLI
                  </Button>
                </ButtonRow>
              </Stack>
              <HeroLedger />
            </div>
          </div>
        </section>

        <Section id="where-it-runs" labelledBy="agi-landing-lanes-title" rule size="lg">
          <StickyLedger
            heading={
              <div>
                <Eyebrow>Three lanes</Eyebrow>
                <h2 className="agi-ds-h2" id="agi-landing-lanes-title">
                  One account. Three places the work can run.
                </h2>
              </div>
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
              <div>
                <Eyebrow>Availability</Eyebrow>
                <h2 className="agi-ds-h2" id="agi-landing-surfaces-title">
                  What you can install today.
                </h2>
              </div>
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
            <div>
              <Eyebrow>Proof</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-landing-capabilities-title">
                Screens from the running product.
              </h2>
            </div>
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
            <div>
              <Eyebrow>Hosted capacity</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-landing-pricing-title">
                Pay only for the cloud lane.
              </h2>
            </div>
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
                    <Eyebrow>{tier.name}</Eyebrow>
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
              <div>
                <Eyebrow>Enterprise</Eyebrow>
                <h2 className="agi-ds-h2" id="agi-landing-enterprise-title">
                  What we hold, and what we do not.
                </h2>
              </div>
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
