import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FinalCta } from '@/features/marketing/components/FlagshipSections';

export const metadata = buildMetadata({
  title: 'AGI Artifacts: sandboxed previews, versions, and downloads',
  description:
    'Artifacts in the AGI workspace: HTML, React, SVG, diagrams, code, and documents rendered in a sandboxed preview beside the chat. Versioned, with source view, copy, and download.',
  path: '/features/artifacts',
});

const ARTIFACT_SOURCE = `<svg viewBox="0 0 320 132" width="100%" role="img" aria-label="Chart">
  <g fill="currentColor">
    <rect x="0" y="84" width="44" height="48" rx="6" />
    <rect x="56" y="60" width="44" height="72" rx="6" />
    <rect x="112" y="96" width="44" height="36" rx="6" />
    <rect x="168" y="36" width="44" height="96" rx="6" />
    <rect x="224" y="12" width="44" height="120" rx="6" />
  </g>
</svg>`;

const PANEL_TABS = ['chart.svg', 'schema.sql', 'flow.mmd'];

const PANEL_ACTIONS = ['Source', 'Copy', 'Download', 'Fullscreen'];

const RENDERERS = [
  {
    k: 'HTML',
    v: 'The markup is rebuilt into a fresh document that carries the artifact policy, with a base tag dropped and any frame inside it stripped of same-origin access. Scripts and inline handlers survive that pass, so the page behaves the way it will behave anywhere else.',
  },
  {
    k: 'React',
    v: 'The source reaches Babel inside the frame as source rather than as escaped text, is compiled there, and whatever it names App or Component is mounted against React 18.',
  },
  {
    k: 'SVG',
    v: 'Sanitized before it is drawn: tags and attributes that could execute are stripped out. When something is stripped, the panel says so under the artifact rather than staying quiet about it.',
  },
  {
    k: 'Mermaid',
    v: 'The definition is HTML-escaped on the way into the frame, so markup written inside a diagram is laid out as text, and mermaid draws the graph from what is left.',
  },
];

const FRAME_LIMITS = [
  {
    k: 'Origin',
    v: 'A separate origin when the deployment configures one, and a null-origin frame when it does not. Neither one can read the page around it or the session you are signed into.',
  },
  {
    k: 'Network',
    v: 'Nothing inside the frame can fetch, open an XHR, or hold a socket. There is no route from a rendered artifact back out to your data.',
  },
  {
    k: 'Scripts',
    v: 'The artifact’s own script runs, because that is what makes the render a render. Anything it pulls in has to come from one of four named CDNs.',
  },
  {
    k: 'Forms and plugins',
    v: 'Form submission and object embedding are both switched off, so a preview cannot post a form anywhere or load a plugin.',
  },
];

const VERSIONS = [
  {
    n: '01',
    title: 'A rewrite lands as the next version',
    body: 'Ask for a change and the panel keeps the old content and appends the new one. The chip in the header counts up, so v2/2 means you are reading the newer of the two.',
  },
  {
    n: '02',
    title: 'An identical rewrite lands as nothing',
    body: 'Versions are keyed to the content. When a pass produces the same bytes the history does not move at all; only a changed title or language is written over the version you already have.',
  },
  {
    n: '03',
    title: 'You can walk backwards through them',
    body: 'Arrows either side of the chip step through the history. The frame re-renders whichever version you land on, and copy and download take that one rather than the newest.',
  },
  {
    n: '04',
    title: 'Restoring costs you nothing',
    body: 'On any version but the newest, a restore control makes it current by adding it to the end of the history. The versions in between are still there behind the arrows.',
  },
  {
    n: '05',
    title: 'You can edit the source yourself',
    body: 'On a stored text artifact at its newest version the source is editable in place, and saving the edit stores it as the next version instead of overwriting the one you had.',
  },
];

const EXPORTS = [
  { k: 'Copy', v: 'Puts the version you are reading on the clipboard.' },
  {
    k: 'Download',
    v: 'A menu: the artifact as a standalone HTML document, its source under its own extension, or the whole thing as Markdown. A table adds CSV, and an artifact backed by a generated file adds that file.',
  },
  {
    k: 'Download all',
    v: 'Once a conversation holds more than one artifact, the panel header zips them, each entry named from its title and its language, with collisions numbered rather than overwritten.',
  },
  {
    k: 'Publish',
    v: 'Puts the artifact on a public page under its own link. The page is not indexed, it is listed in Settings beside your shared links, and you revoke it from there whenever you want the link dead.',
  },
  {
    k: 'Local and BYOK',
    v: 'An artifact made in Local or BYOK mode does not publish. Publishing would move it to AGI managed cloud, so the panel refuses by name and points you at the download instead.',
  },
];

export default function ArtifactsFeaturePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-artifacts-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Features · Artifacts</p>
          <h1 id="agi-artifacts-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">
              You can <em className="agi-fl-h1-em">run the artifact</em> before you keep it.
            </span>
          </h1>
          <p className="agi-fl-lede">
            When a reply carries something buildable, it leaves the message stream and opens in a
            panel beside the chat. The render sits on one tab and the source that produced it sits
            on the other, so the thing you are judging is the thing you can read.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/gallery" className="agi-fl-cta agi-fl-cta--primary">
              Browse the gallery
            </Link>
          </div>

          <div className="agi-fl-hero-console">
            <div className="agi-terminal agi-fl-hero-frame--main">
              <div className="agi-terminal-bar">chart.svg · Source</div>
              <pre className="agi-terminal-pre">{ARTIFACT_SOURCE}</pre>
            </div>

            <div className="agi-chat agi-fl-hero-frame--terminal">
              <div className="agi-chat-header">
                <span className="agi-chat-model">Artifacts</span>
                <span className="agi-chat-meta">Preview · v3/3</span>
              </div>
              <div className="agi-chat-body">
                <div className="agi-chip-row">
                  {PANEL_TABS.map((tab) => (
                    <span key={tab} className="agi-chip">
                      {tab}
                    </span>
                  ))}
                </div>
                <svg viewBox="0 0 320 132" width="100%" role="img" aria-label="Chart">
                  <g fill="currentColor">
                    <rect x="0" y="84" width="44" height="48" rx="6" />
                    <rect x="56" y="60" width="44" height="72" rx="6" />
                    <rect x="112" y="96" width="44" height="36" rx="6" />
                    <rect x="168" y="36" width="44" height="96" rx="6" />
                    <rect x="224" y="12" width="44" height="120" rx="6" />
                  </g>
                </svg>
                <div className="agi-chip-row">
                  {PANEL_ACTIONS.map((action) => (
                    <span key={action} className="agi-chip">
                      {action}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-artifacts-renderers">
          <p className="agi-fl-eyebrow">Rendering</p>
          <h2 id="agi-artifacts-renderers" className="agi-fl-h2">
            How each kind reaches the frame
          </h2>
          <p className="agi-fl-section-lede">
            Four types get a live frame: HTML, React, SVG and Mermaid. Code opens against its own
            source with copy and download, while a table, a slide deck, a PDF or a generated image
            each get their own reader inside the same panel.
          </p>
          <table className="agi-ledger">
            <tbody>
              {RENDERERS.map((row) => (
                <tr key={row.k}>
                  <td>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-artifacts-frame">
          <p className="agi-fl-eyebrow">Isolation</p>
          <h2 id="agi-artifacts-frame" className="agi-fl-h2">
            What the preview frame is allowed to do
          </h2>
          <p className="agi-fl-section-lede">
            Rendering an artifact means executing something a model wrote, so the frame it runs in
            is the boundary. The cross-origin renderer and the in-page fallback take their policy
            from one shared contract rather than each writing its own, so the same argument covers
            both paths.
          </p>

          <div className="agi-callout">
            <h3 className="agi-callout-h">The preview cannot call home</h3>
            <p className="agi-callout-p">
              That single policy sets{' '}
              <span className="agi-callout-amber">connect-src &apos;none&apos;</span>, and it is the
              directive that matters most here. A page rendering in the panel may draw itself, but
              it has no way to send what it just read to anyone.
            </p>
          </div>

          <dl className="agi-colophon">
            {FRAME_LIMITS.map((limit) => (
              <div key={limit.k} className="agi-colophon-row">
                <dt className="agi-colophon-key">{limit.k}</dt>
                <dd className="agi-colophon-val">{limit.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-artifacts-versions">
          <p className="agi-fl-eyebrow">Versions</p>
          <h2 id="agi-artifacts-versions" className="agi-fl-h2">
            Versions are keyed to the content
          </h2>
          <p className="agi-fl-section-lede">
            An artifact is worth keeping only if revising it does not cost you the draft you liked.
            The panel tracks what actually changed, so the history is short enough to walk through
            by hand.
          </p>
          <ol className="agi-steps">
            {VERSIONS.map((step) => (
              <li key={step.n} className="agi-step">
                <span className="agi-step-n">{step.n}</span>
                <h3 className="agi-step-h">{step.title}</h3>
                <p className="agi-step-body">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-artifacts-exports">
          <p className="agi-fl-eyebrow">Export</p>
          <h2 id="agi-artifacts-exports" className="agi-fl-h2">
            What leaves the panel with you
          </h2>
          <p className="agi-fl-section-lede">
            Every control below acts on the version currently on screen, so what you copy, save or
            publish is what you were looking at when you pressed it.
          </p>
          <dl className="agi-colophon">
            {EXPORTS.map((row) => (
              <div key={row.k} className="agi-colophon-row">
                <dt className="agi-colophon-key">{row.k}</dt>
                <dd className="agi-colophon-val">{row.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-artifacts-gallery">
          <p className="agi-fl-eyebrow">The gallery</p>
          <h2 id="agi-artifacts-gallery" className="agi-fl-h2">
            Where the artifacts collect
          </h2>
          <p className="agi-fl-section-lede">
            The panel belongs to one conversation, and Shift+A opens and closes it. The gallery is
            the account-wide view: your own artifacts on one tab and a set of worked examples on the
            other, with a search box and a type filter over both, plus a date window over your own.
            The type filter only ever offers types the tab in front of you actually holds.
          </p>
          <p className="agi-fl-section-lede">
            Artifacts are held in browser storage on the device that rendered them, and when that
            storage fills up the panel says so rather than dropping work quietly. Signed in, they
            also sync to your account, so one made on another device appears in the gallery; opening
            a row whose content this device has never rendered takes you to the conversation that
            produced it, where it is rebuilt under the same identity.
          </p>
          <div className="agi-fl-cta-row agi-fl-cta-row--sm">
            <Link href="/features/ai-chat" className="agi-fl-cta agi-fl-cta--ghost">
              How a reply becomes one
            </Link>
            <Link href="/desktop" className="agi-fl-cta agi-fl-cta--ghost">
              The desktop workbench
            </Link>
          </div>
        </section>

        <FinalCta
          eyebrow="Make one"
          title="Ask for something you can open."
          body="A chart, a component, a page, a diagram: ask for it and the panel opens beside the reply with the render on one tab and the source on the other. From there it is a file you own."
          ctas={[{ href: '/login?redirectTo=%2Fchat', label: 'Open a chat' }]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
