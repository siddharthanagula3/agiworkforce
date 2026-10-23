import { buildMetadata } from '@/lib/seo/metadata';
import {
  billingPlanCapabilityPlanLabels,
  billingPlanCapabilityWireTiers,
  getBillingPlanPricing,
  getTierPolicy,
  interactionMode,
} from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { VideoWindow } from '@/features/marketing/components/scenes/VideoScene';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';

const VIDEO_PLANS = billingPlanCapabilityPlanLabels('video_generation');
const CREATE_VIDEO = interactionMode('video').label;
const VIDEO_ALLOWANCES = billingPlanCapabilityWireTiers('video_generation').flatMap((tier) => {
  const seconds = getTierPolicy(tier).videoSecondsPerMonth;
  return seconds == null
    ? []
    : [
        `${getBillingPlanPricing(tier).label} includes ${seconds} seconds of video per calendar month; a request that would exceed it is refused.`,
      ];
});

export const metadata = buildMetadata({
  title: 'Video generation: prompts, progress, and playback',
  description:
    'Describe a short video in chat, choose the options the model offers, follow progress while it renders, then play or download the result.',
  path: '/features/video',
});

const IDS = {
  hero: 'agi-features-video-title',
  wait: 'agi-features-video-wait-title',
  turn: 'agi-features-video-turn-title',
  bounds: 'agi-features-video-bounds-title',
  close: 'agi-features-video-close-title',
} as const;

const VIDEO_BOUNDS = [
  'Video generation works from your prompt only; attached files are not sent.',
  'Prompts pass a safety check before a job is admitted.',
  'Video requests are rate limited per minute.',
  ...VIDEO_ALLOWANCES,
  'A workspace owner or admin can turn off AGI-managed cloud compute, which includes video, for its members.',
] as const;

export default function VideoFeaturePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Features &middot; Video generation</p>
              <h1 className="sr-only" id={IDS.hero}>
                Video generation
              </h1>
              <ButtonRow>
                <Button href="/login?redirectTo=%2Fchat">Open chat</Button>
                <Button href="/pricing#pricing-compare-title" variant="secondary">
                  See plans
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <VideoWindow />
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby={IDS.wait}>
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <p className="agi-lp-eyebrow">While it renders</p>
              <h2 className="agi-lp-h2" id={IDS.wait}>
                Start a video, <em className="agi-lp-accent">then leave the&nbsp;chat.</em>
              </h2>
            </div>
            <div className="agi-lp-moments">
              <article className="agi-lp-moment">
                <div className="agi-lp-moment-copy">
                  <h3 className="agi-lp-moment-title">The job keeps running on the&nbsp;server</h3>
                  <p className="agi-lp-moment-body">
                    For video your plan includes, a server workflow drives each job to its end
                    state, so it finishes whether or not the tab that started it stays open. The
                    chat checks the job every few seconds. If the browser stops checking, the
                    message says the video is still being generated and offers Resume checking. When
                    the job ends, AGI records a notification and sends a push notice to devices
                    registered for push.
                  </p>
                </div>
                <VideoWindow view="ready" />
              </article>
            </div>
          </div>
        </section>

        <Section id="inside-a-video-turn" labelledBy={IDS.turn} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Inside a video turn</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.turn}>
                From the prompt to the&nbsp;player.
              </h2>
              <Prose>
                Set the video up in the composer. The chat message that holds it then shows progress
                and plays the result. These are the stages for video your plan includes.
              </Prose>
            </div>
            <Ledger
              caption="Stages of a video generation turn"
              rows={[
                {
                  label: 'Start',
                  value: `Open the composer’s + menu and choose ${CREATE_VIDEO}. The composer switches to video mode and asks you to describe the video you want.`,
                },
                {
                  label: 'Shape',
                  value:
                    'Aspect ratio, quality and length menus list what the selected video model publishes in the catalog. A menu with a single option is not shown.',
                },
                {
                  label: 'Estimate',
                  value:
                    'When the model has a published price, the composer shows an estimate in credits before you send. The final cost settles when the video is delivered.',
                },
                {
                  label: 'Wait',
                  value:
                    'The message shows Creating your video with an elapsed clock, plus a percentage when the provider reports progress.',
                },
                {
                  label: 'Stop',
                  value:
                    'Stop generating asks the server to cancel the job. A video cancelled before it finishes is not delivered or charged.',
                },
                {
                  label: 'Watch',
                  value:
                    'A finished video plays in the message with the browser’s player controls and a download button.',
                },
              ]}
            />
          </Stack>
        </Section>

        <div className="agi-lp-factline">
          <div className="agi-ds-container">
            <p className="agi-lp-eyebrow" style={{ marginBottom: '0.75rem' }}>
              Request limits
            </p>
            <h2 className="agi-ds-h3" id={IDS.bounds} style={{ marginBottom: '1rem' }}>
              What bounds a video&nbsp;request.
            </h2>
            <ul className="agi-lp-factline-list">
              {VIDEO_BOUNDS.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </div>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Choose a plan <em className="agi-lp-accent">with video&nbsp;generation.</em>
              </h2>
              <p className="agi-lp-lede">
                Video generation is included on {VIDEO_PLANS} plans, up to any monthly allowance the
                plan sets. On other plans the {CREATE_VIDEO} row shows Upgrade. Model choices also
                depend on what the deployment has available.
              </p>
              <ButtonRow>
                <Button href="/pricing#pricing-compare-title">See which plans include it</Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
