import { buildMetadata } from '@/lib/seo/metadata';
import { MANAGED_MEDIA_MAX_IMAGE_REFERENCES } from '@agiworkforce/cloud-contracts';
import { billingPlanCapabilityPlanLabels, interactionMode } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import { IMAGE_STYLE_PRESETS } from '@/features/chat/lib/imageGenerationOptions';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ImageScene } from '@/features/marketing/components/scenes/ImageScene';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FREE_MEDIA_LIMITED_LABEL } from '@/features/models/lib/free-media-offer';

const IMAGE_PLANS = billingPlanCapabilityPlanLabels('image_generation');
const CREATE_IMAGE = interactionMode('image').label;
const STYLE_SAMPLE = IMAGE_STYLE_PRESETS.slice(0, 3)
  .map((preset) => preset.label)
  .join(', ');

export const metadata = buildMetadata({
  title: 'Image generation: create and revise images in chat',
  description:
    'Create an image from a description in chat, choose its shape and style, revise or edit the result, and find it again in the Library.',
  path: '/features/images',
});

const IDS = {
  hero: 'agi-features-images-title',
  create: 'agi-features-images-create-title',
  bounds: 'agi-features-images-bounds-title',
  revise: 'agi-features-images-revise-title',
  close: 'agi-features-images-close-title',
} as const;

export default function ImageGenerationPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Features &middot; Image generation</p>
              <h1 className="sr-only" id={IDS.hero}>
                Image generation
              </h1>
              <ButtonRow>
                <Button href="/login?redirectTo=%2Fchat">Open chat</Button>
                <Button href="/pricing#pricing-compare-title" variant="secondary">
                  See plans
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <ImageScene />
            </div>
          </div>
        </section>

        <Section id="create" labelledBy={IDS.create} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Create</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.create}>
                Start from the composer, or ask in&nbsp;a&nbsp;chat.
              </h2>
              <Prose>
                Image generation runs in Managed Cloud chats. Describe the picture and the result
                appears in the&nbsp;conversation.
              </Prose>
            </div>
            <Ledger
              caption="Ways to create an image"
              rows={[
                {
                  label: 'Composer',
                  value: `Open the composer menu and choose ${CREATE_IMAGE}. Close the Image pill to leave image\u00a0mode.`,
                },
                {
                  label: 'Command',
                  value:
                    'Type /image followed by a description to switch the composer to image\u00a0mode.',
                },
                {
                  label: 'In a chat',
                  value:
                    'On Web, when your plan includes image generation, AGI can call an image tool in an ordinary chat when you ask for a\u00a0picture.',
                },
                {
                  label: 'Shape',
                  value:
                    'Choose an aspect ratio from the ones the selected image model supports, or leave it on\u00a0Auto.',
                },
                {
                  label: 'Style',
                  value: `Style adds one of ${IMAGE_STYLE_PRESETS.length} preset phrases to your prompt, such as ${STYLE_SAMPLE}.`,
                },
                {
                  label: 'Your image',
                  value:
                    'Attach an image in image mode to edit it, make a variation or redraw a masked area, when the selected model supports\u00a0edits.',
                },
              ]}
            />
          </Stack>
        </Section>

        <div className="agi-lp-factline">
          <div className="agi-ds-container">
            <Stack gap="loose">
              <Eyebrow>Checks and limits</Eyebrow>
              <h2 className="agi-ds-h3" id={IDS.bounds}>
                Each request is checked before an image is&nbsp;made.
              </h2>
              <Prose>
                Prompts pass moderation before a request reaches an image provider, and images you
                attach are checked before an edit runs. An edit can be guided by up to{' '}
                {MANAGED_MEDIA_MAX_IMAGE_REFERENCES} more images. Generated images count toward your
                plan&nbsp;usage.
              </Prose>
            </Stack>
          </div>
        </div>

        <Section id="revise" labelledBy={IDS.revise} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Revise</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.revise}>
                Change the result without starting&nbsp;over.
              </h2>
              <Prose>
                On an image made in image mode, New version opens a revision panel. What it offers
                depends on whether the image model can edit an existing&nbsp;image.
              </Prose>
            </div>
            <Ledger
              caption="Ways to revise and keep an image"
              rows={[
                {
                  label: 'Describe',
                  value:
                    'With an editing model, describing a change edits the image. Other models generate a new image and leave the original\u00a0unchanged.',
                },
                {
                  label: 'Select area',
                  value:
                    'With an editing model, paint over the part to change, or add a mask image, then describe the change. Only that part is\u00a0redrawn.',
                },
                {
                  label: 'Shape',
                  value:
                    'Pick another aspect ratio to generate the image in a new shape. An editing model extends the picture to\u00a0fit.',
                },
                {
                  label: 'Variation',
                  value: 'Variation asks an editing model for a new take on the\u00a0image.',
                },
                {
                  label: 'Versions',
                  value:
                    'A revised image keeps its earlier versions on the card. Previous and Next move between\u00a0them.',
                },
                {
                  label: 'Keep',
                  value:
                    'Copy or download the image, or copy a link that opens for people signed in to your workspace. Generated images are listed under Images in the Library; in a temporary chat, Save to Library keeps\u00a0one.',
                },
              ]}
            />
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Choose a plan <em className="agi-lp-accent">with image&nbsp;generation.</em>
              </h2>
              <p className="agi-lp-lede">
                Image generation is included on {IMAGE_PLANS} plans. When a limited free image offer
                is running, {CREATE_IMAGE} carries a {FREE_MEDIA_LIMITED_LABEL} badge on plans
                without it, with a daily limit and text-only prompts. Availability also depends on
                account and workspace&nbsp;access.
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
