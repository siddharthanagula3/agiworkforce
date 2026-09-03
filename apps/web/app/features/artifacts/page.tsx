import { buildMetadata } from '@/lib/seo/metadata';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  ProductFrame,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';

export const metadata = buildMetadata({
  title: 'Artifacts: sandboxed previews, versions, and downloads',
  description:
    'Artifacts in the AGI workspace: HTML, React, SVG, diagrams, code, and documents rendered in a sandboxed preview beside the chat. Versioned, with source view, copy, and download.',
  path: '/features/artifacts',
});

export default function ArtifactsFeaturePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-features-artifacts-title"
          eyebrow="Features · Artifacts"
          title="You can run the artifact before you keep it."
          lede="When a reply carries something buildable, it leaves the message stream and opens in a panel beside the chat. The render sits on one tab and the source that produced it sits on the other, so the thing you are judging is the thing you can read."
          ctas={[{ href: '/gallery', label: 'Browse the gallery' }]}
          visual={
            <ProductFrame
              src="/product/artifacts-library-dark.png"
              srcLight="/product/artifacts-library-light.png"
              alt="The AGI library listing generated artifacts with their type, size, and route labels"
              width={2880}
              height={1800}
              caption={['Library', 'Generated files']}
              priority
            />
          }
        />

        <Section id="renderers" labelledBy="agi-features-artifacts-renderers-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Rendering</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-artifacts-renderers-title">
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
                    'The markup is rebuilt into a fresh document that carries the artifact policy, with a base tag dropped and any frame inside it stripped of same-origin access. Scripts and inline handlers survive that pass, so the page behaves the way it will behave anywhere else.',
                },
                {
                  label: 'React',
                  value:
                    'The source reaches Babel inside the frame as source rather than as escaped text, is compiled there, and whatever it names App or Component is mounted against React 18.',
                },
                {
                  label: 'SVG',
                  value:
                    'Sanitized before it is drawn: tags and attributes that could execute are stripped out. When something is stripped, the panel says so under the artifact rather than staying quiet about it.',
                },
                {
                  label: 'Mermaid',
                  value:
                    'The definition is HTML-escaped on the way into the frame, so markup written inside a diagram is laid out as text, and mermaid draws the graph from what is left.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="isolation" labelledBy="agi-features-artifacts-isolation-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Isolation</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-artifacts-isolation-title">
                What the preview frame is allowed to do.
              </h2>
              <Prose>
                Rendering an artifact means executing something a model wrote, so the frame it runs
                in is the boundary. The cross-origin renderer and the in-page fallback take their
                policy from one shared contract rather than each writing its own, so the same
                argument covers both paths. That single policy sets{' '}
                <code>connect-src &apos;none&apos;</code>, the directive that matters most: a page
                rendering in the panel may draw itself, but it has no way to send what it just read
                to anyone.
              </Prose>
            </div>
            <Ledger
              caption="Frame isolation"
              rows={[
                {
                  label: 'Origin',
                  value:
                    'A separate origin when the deployment configures one, and a null-origin frame when it does not. Neither one can read the page around it or the session you are signed into.',
                },
                {
                  label: 'Network',
                  value:
                    'Nothing inside the frame can fetch, open an XHR, or hold a socket. There is no route from a rendered artifact back out to your data.',
                },
                {
                  label: 'Scripts',
                  value:
                    "The artifact's own script runs, because that is what makes the render a render. Anything it pulls in has to come from one of four named CDNs.",
                },
                {
                  label: 'Forms and plugins',
                  value:
                    'Form submission and object embedding are both switched off, so a preview cannot post a form anywhere or load a plugin.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="versions" labelledBy="agi-features-artifacts-versions-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Versions</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-artifacts-versions-title">
                Versions are keyed to the content.
              </h2>
              <Prose>
                An artifact is worth keeping only if revising it does not cost you the draft you
                liked. The panel tracks what actually changed, so the history is short enough to
                walk through by hand.
              </Prose>
            </div>
            <Ledger
              caption="How artifact versions behave"
              rows={[
                {
                  label: '01',
                  value:
                    'A rewrite lands as the next version. Ask for a change and the panel keeps the old content and appends the new one. The chip in the header counts up, so v2/2 means you are reading the newer of the two.',
                },
                {
                  label: '02',
                  value:
                    'An identical rewrite lands as nothing. Versions are keyed to the content. When a pass produces the same bytes the history does not move at all; only a changed title or language is written over the version you already have.',
                },
                {
                  label: '03',
                  value:
                    'You can walk backwards through them. Arrows either side of the chip step through the history. The frame re-renders whichever version you land on, and copy and download take that one rather than the newest.',
                },
                {
                  label: '04',
                  value:
                    'Restoring costs you nothing. On any version but the newest, a restore control makes it current by adding it to the end of the history. The versions in between are still there behind the arrows.',
                },
                {
                  label: '05',
                  value:
                    'You can edit the source yourself. On a stored text artifact at its newest version the source is editable in place, and saving the edit stores it as the next version instead of overwriting the one you had.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="exports" labelledBy="agi-features-artifacts-exports-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Export</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-artifacts-exports-title">
                What leaves the panel with you.
              </h2>
              <Prose>
                Every control below acts on the version currently on screen, so what you copy, save,
                or publish is what you were looking at when you pressed it.
              </Prose>
            </div>
            <Ledger
              caption="Export controls"
              rows={[
                { label: 'Copy', value: 'Puts the version you are reading on the clipboard.' },
                {
                  label: 'Download',
                  value:
                    'A menu: the artifact as a standalone HTML document, its source under its own extension, or the whole thing as Markdown. A table adds CSV, and an artifact backed by a generated file adds that file.',
                },
                {
                  label: 'Download all',
                  value:
                    'Once a conversation holds more than one artifact, the panel header zips them, each entry named from its title and its language, with collisions numbered rather than overwritten.',
                },
                {
                  label: 'Publish',
                  value:
                    'Puts the artifact on a public page under its own link. The page is not indexed, it is listed in Settings beside your shared links, and you revoke it from there whenever you want the link dead.',
                },
                {
                  label: 'Local and BYOK',
                  value:
                    'An artifact made in Local or BYOK mode does not publish. Publishing would move it to AGI managed cloud, so the panel refuses by name and points you at the download instead.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="gallery" labelledBy="agi-features-artifacts-gallery-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The gallery</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-artifacts-gallery-title">
                Where the artifacts collect.
              </h2>
            </div>
            <Prose>
              The panel belongs to one conversation, and Shift+A opens and closes it. The gallery is
              the account-wide view: your own artifacts on one tab and a set of worked examples on
              the other, with a search box and a type filter over both, plus a date window over your
              own. The type filter only ever offers types the tab in front of you actually holds.
            </Prose>
            <Prose>
              Artifacts are held in browser storage on the device that rendered them, and when that
              storage fills up the panel says so rather than dropping work quietly. Signed in, they
              also sync to your account, so one made on another device appears in the gallery;
              opening a row whose content this device has never rendered takes you to the
              conversation that produced it, where it is rebuilt under the same identity.
            </Prose>
            <ButtonRow>
              <Button href="/features/ai-chat" variant="secondary">
                How a reply becomes one
              </Button>
              <Button href="/desktop" variant="secondary">
                The desktop workbench
              </Button>
            </ButtonRow>
          </Stack>
        </Section>

        <Section
          id="artifacts-close"
          labelledBy="agi-features-artifacts-close-title"
          rule
          ground="2"
        >
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-features-artifacts-close-title">
              Ask for something you can open.
            </h2>
            <Prose>
              A chart, a component, a page, a diagram: ask for it and the panel opens beside the
              reply with the render on one tab and the source on the other. From there it is a file
              you own.
            </Prose>
            <ButtonRow>
              <Button href="/login?redirectTo=%2Fchat">Open a chat</Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
