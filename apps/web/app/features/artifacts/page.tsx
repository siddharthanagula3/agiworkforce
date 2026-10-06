import { buildMetadata } from '@/lib/seo/metadata';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { Header } from '@shared/components/layout/Header';
import { ArtifactsWindow } from '@/features/marketing/components/FeatureScenes';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

export const metadata = buildMetadata({
  title: 'Artifacts: previews, source, versions, and downloads',
  description:
    'Preview supported artifacts beside the chat, inspect their source, browse saved versions, and copy or download supported formats.',
  path: '/features/artifacts',
});

const IDS = {
  hero: 'agi-features-artifacts-title',
  renderers: 'agi-features-artifacts-renderers-title',
  isolation: 'agi-features-artifacts-isolation-title',
  versions: 'agi-features-artifacts-versions-title',
  exports: 'agi-features-artifacts-exports-title',
  gallery: 'agi-features-artifacts-gallery-title',
  close: 'agi-features-artifacts-close-title',
} as const;

const EXPORT_CONTROLS = [
  {
    meta: 'Copy',
    title: 'Puts the version on the clipboard',
    body: 'Copies the selected saved version, including an earlier version you are viewing.',
  },
  {
    meta: 'Download',
    title: 'The artifact as a standalone file',
    body: 'Text artifacts offer HTML, source and Markdown downloads. Tables add CSV; images, binary documents and generated files have file downloads.',
  },
  {
    meta: 'Download all',
    title: 'Every artifact in the chat, zipped',
    body: 'Download all exports the current artifacts in the conversation as a ZIP. Duplicate filenames are numbered.',
  },
  {
    meta: 'Publish',
    title: 'A shareable page under its own link',
    body: 'Published pages request no indexing. Public links open for anyone with the link; workspace-only pages require workspace membership. Manage and unpublish them in Settings, Shared links. Publication can be refused or detected secrets redacted.',
  },
  {
    meta: 'Local and BYOK',
    title: 'Publishing does not move data quietly',
    body: 'The Web panel refuses managed-cloud publication for Local, BYOK or unknown origins and points to Download instead.',
  },
] as const;

export default function ArtifactsFeaturePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Features &middot; Artifacts</p>
              <h1 className="sr-only" id={IDS.hero}>
                <span className="agi-lp-line">Run it,</span>{' '}
                <span className="agi-lp-line">then decide.</span>{' '}
                <em className="agi-lp-accent">Not before.</em>
              </h1>
              <ButtonRow>
                <Button href="/gallery">Browse the gallery</Button>
                <Button href="/features/ai-chat" variant="secondary">
                  How a reply becomes one
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <ArtifactsWindow />
            </div>
          </div>
        </section>

        <Section id="renderers" labelledBy={IDS.renderers} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Rendering</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.renderers}>
                Preview or inspect the source.
              </h2>
              <Prose>
                HTML, React and SVG have framed previews. Mermaid diagrams render as sanitized SVG.
                Code, tables, slide decks, documents and images use the appropriate source view or
                reader.
              </Prose>
            </div>
            <Ledger
              caption="How each artifact type renders"
              rows={[
                {
                  label: 'HTML',
                  value:
                    'Rendered in a frame with the artifact content policy. Source remains available when the preview cannot start.',
                },
                {
                  label: 'React',
                  value:
                    'React source is compiled inside its framed preview. Interactive scripts depend on the sandbox renderer.',
                },
                {
                  label: 'SVG',
                  value:
                    'Sanitized before previewing. Detected unsafe patterns can trigger a notice.',
                },
                {
                  label: 'Mermaid',
                  value:
                    'Rendered as sanitized SVG in the panel. If it cannot be drawn, its source stays available.',
                },
              ]}
            />
          </Stack>
        </Section>

        <div className="agi-lp-factline">
          <div className="agi-ds-container">
            <Stack gap="loose">
              <Eyebrow>Isolation</Eyebrow>
              <h2 className="agi-ds-h3" id={IDS.isolation}>
                Some previews run code in an isolated frame.
              </h2>
              <Prose>
                Framed previews apply a separate content policy. Interactive script previews need
                the sandbox renderer. If Web falls back to a layout-only preview, it displays a
                notice and the Source tab remains available.
              </Prose>
            </Stack>
          </div>
        </div>

        <Section id="versions" labelledBy={IDS.versions} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Versions</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.versions}>
                Versions are keyed to the content.
              </h2>
              <Prose>
                An artifact is worth keeping only if revising it does not cost you the draft you
                liked, so the history tracks what actually changed.
              </Prose>
            </div>
            <Ledger
              caption="How artifact versions behave"
              rows={[
                {
                  label: '01',
                  value:
                    'Updating the same artifact ID with different content adds a version. The header shows the selected version and the history length.',
                },
                {
                  label: '02',
                  value:
                    'Updating the same artifact ID with identical content does not add a version.',
                },
                {
                  label: '03',
                  value: 'Previous and Next move between version entries.',
                },
                {
                  label: '04',
                  value:
                    'When its content differs from the latest, Restore adds the selected content as a new latest version and keeps the intervening versions.',
                },
                {
                  label: '05',
                  value:
                    'The latest stored text version can be edited. Saving changed source adds a version; saving unchanged source leaves the history intact.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="exports" labelledBy={IDS.exports} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Export</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.exports}>
                What leaves the panel with you.
              </h2>
              <Prose>
                Copy and text-file downloads use the selected saved version. Available downloads
                depend on the artifact type.
              </Prose>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {EXPORT_CONTROLS.map((item) => (
                <div key={item.meta} className="agi-ds-card">
                  <Eyebrow>{item.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                </div>
              ))}
            </div>
          </Stack>
        </Section>

        <Section id="gallery" labelledBy={IDS.gallery} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>The gallery</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.gallery}>
                Where the artifacts collect.
              </h2>
            </div>
            <Prose>
              The panel belongs to one conversation, and Ctrl or Cmd with Shift and A opens and
              closes it. The gallery is the account-wide view: your own artifacts on one tab and a
              set of worked examples on the other, with a search box and a type filter over both,
              plus a date window over your own.
            </Prose>
            <Prose>
              Outside temporary chats, Web saves artifact records in browser storage when space is
              available. Signed-in Web attempts account sync for eligible conversations. Gallery
              entries without local content open their source conversation.
            </Prose>
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Ask for something <em className="agi-lp-accent">you can open.</em>
              </h2>
              <p className="agi-lp-lede">
                When a reply produces a supported artifact, open it in the panel to preview it or
                read its source. Copy the selected text version or download a supported format.
              </p>
              <ButtonRow>
                <Button href="/login?redirectTo=%2Fchat">Open a chat</Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
