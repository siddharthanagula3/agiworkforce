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
  title: 'Artifacts: sandboxed previews, versions, and downloads',
  description:
    'Artifacts in the AGI workspace: HTML, React, SVG, diagrams, code, and documents rendered in a sandboxed preview beside the chat. Versioned, with source view, copy, and download.',
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

const ISOLATION_FACTS = [
  'own origin, never the page around it',
  'no fetch, XHR, or socket out',
  'forms and plugins switched off',
  "connect-src 'none' on every renderer",
] as const;

const EXPORT_CONTROLS = [
  {
    meta: 'Copy',
    title: 'Puts the version on the clipboard',
    body: 'Copies exactly the version you are reading, not the newest one if you have stepped back.',
  },
  {
    meta: 'Download',
    title: 'The artifact as a standalone file',
    body: 'A menu offers standalone HTML, the source under its own extension, or the whole thing as Markdown. A table adds CSV, and a generated file adds that file.',
  },
  {
    meta: 'Download all',
    title: 'Every artifact in the chat, zipped',
    body: 'Once a conversation holds more than one artifact, the panel header zips them, each entry named from its title and language, collisions numbered.',
  },
  {
    meta: 'Publish',
    title: 'A public page under its own link',
    body: 'The page is not indexed, it is listed in Settings beside your shared links, and you revoke it from there whenever you want the link dead.',
  },
  {
    meta: 'Local and BYOK',
    title: 'Publishing does not move data quietly',
    body: 'An artifact made in Local or BYOK mode does not publish, because that would move it to AGI managed cloud. The panel refuses by name and points at the download instead.',
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
              <h1 className="agi-lp-h1" id={IDS.hero}>
                <span className="agi-lp-line">Run it,</span>
                <span className="agi-lp-line">then decide.</span>
                <em className="agi-lp-accent">Not before.</em>
              </h1>
              <p className="agi-lp-lede">
                When a reply carries something buildable, it opens in a panel beside the chat. The
                render sits on one tab and the source that produced it sits on the other, so the
                thing you are judging is the thing you can read.
              </p>
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
                How each kind reaches the frame.
              </h2>
              <Prose>
                Four types get a live frame: HTML, React, SVG, and Mermaid. Code opens against its
                own source with copy and download, while a table, a slide deck, a PDF, or a
                generated image each get their own reader inside the same panel.
              </Prose>
            </div>
            <Ledger
              caption="How each artifact type renders"
              rows={[
                {
                  label: 'HTML',
                  value:
                    'Rebuilt into a fresh document that carries the artifact policy, with a base tag dropped and any inner frame stripped of same-origin access.',
                },
                {
                  label: 'React',
                  value:
                    'The source reaches Babel inside the frame as source rather than escaped text, is compiled there, and whatever it names App or Component is mounted against React 18.',
                },
                {
                  label: 'SVG',
                  value:
                    'Sanitized before it is drawn: tags and attributes that could execute are stripped, and the panel says so under the artifact when something was.',
                },
                {
                  label: 'Mermaid',
                  value:
                    'The definition is HTML-escaped on the way in, so markup written inside a diagram lays out as text, and mermaid draws the graph from what is left.',
                },
              ]}
            />
          </Stack>
        </Section>

        <div className="agi-lp-factline">
          <div className="agi-ds-container">
            <p className="agi-lp-eyebrow" style={{ marginBottom: '0.75rem' }}>
              Isolation
            </p>
            <h2 className="agi-ds-h3" style={{ marginBottom: '1rem' }}>
              Rendering an artifact means executing something a model wrote.
            </h2>
            <ul className="agi-lp-factline-list">
              {ISOLATION_FACTS.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
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
                    'A rewrite lands as the next version. The chip in the header counts up, so v2/2 means you are reading the newer of the two.',
                },
                {
                  label: '02',
                  value:
                    'An identical rewrite lands as nothing. Versions are keyed to the content, so the same bytes leave the history unmoved.',
                },
                {
                  label: '03',
                  value:
                    'Arrows either side of the chip step backwards through the history. The frame re-renders whichever version you land on.',
                },
                {
                  label: '04',
                  value:
                    'Restoring costs nothing. On any version but the newest, restore makes it current by adding it to the end of the history.',
                },
                {
                  label: '05',
                  value:
                    'A stored text artifact at its newest version is editable in place, and saving stores the edit as the next version.',
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
                Every control acts on the version currently on screen, so what you copy, save, or
                publish is what you were looking at when you pressed it.
              </Prose>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {EXPORT_CONTROLS.map((item) => (
                <div
                  key={item.meta}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--agi-rule)] bg-[var(--agi-ground-2)] p-6"
                >
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
              The panel belongs to one conversation, and Shift+A opens and closes it. The gallery is
              the account-wide view: your own artifacts on one tab and a set of worked examples on
              the other, with a search box and a type filter over both, plus a date window over your
              own.
            </Prose>
            <Prose>
              Artifacts are held in browser storage on the device that rendered them. Signed in,
              they also sync to your account, so one made on another device appears in the gallery;
              opening a row this device has never rendered takes you to the conversation that
              produced it, where it is rebuilt under the same identity.
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
                A chart, a component, a page, a diagram: ask for it and the panel opens beside the
                reply with the render on one tab and the source on the other. From there it is a
                file you own.
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
