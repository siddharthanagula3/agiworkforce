import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FinalCta } from '@/features/marketing/components/FlagshipSections';
import { ProofStrip } from '@/features/marketing/components/LandingSections';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { Reveal } from '@/features/marketing/components/Reveal';
import { COMING_SOON_LABEL, LAUNCH, NOTIFY_CTA } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI in Chrome | Side Panel and Browser Control',
  description:
    'A Chrome Manifest V3 side panel that answers about the tab you are reading. Chat runs on AGI Managed Cloud, page text is sent only from origins you approved, and AGI Desktop is an optional local bridge. Computer use calls the Managed Cloud gateway directly from the extension, carrying the conversation and every screenshot it took.',
  path: '/chrome-extension',
});

const BUILD_FACTS = [
  {
    value: 'MV3',
    label: 'Chrome manifest version',
    note: 'Service worker, side panel, content script. The page policy allows scripts from the extension itself, so no remote code loads.',
  },
  {
    value: '132',
    label: 'Minimum Chrome version',
    note: 'Declared in the manifest, because the side panel and the newer permission surfaces need it.',
  },
  {
    value: '8787',
    label: 'Desktop bridge port',
    note: 'The default. Only localhost, 127.0.0.1 and [::1] are accepted as the host.',
  },
  {
    value: 'SHA-256',
    label: 'HMAC on every bridge message',
    note: 'Signed over the message id, its timestamp and its body with a secret handed over at connect time.',
  },
];

const ARCHITECTURE_STEPS = [
  {
    n: 'api.agiworkforce.com',
    title: 'Chat and the page text you attach',
    body: 'Press send and your message, the conversation so far, and any page text you attached go to AGI Managed Cloud. The extension holds no provider key and offers no second chat route, so this is the only road for an answer. An origin you have not approved contributes no page text to it.',
  },
  {
    n: 'localhost:8787',
    title: 'The optional Desktop bridge',
    body: 'Pair AGI Desktop once, by reading a code off its window and typing it into the panel, and the status pill turns from “Desktop optional” into “Desktop tools”. The capture shortcut has this destination and no other, so on an unpaired browser it captures nothing at all rather than capturing and discarding.',
  },
  {
    n: 'api.agiworkforce.com, plus images',
    title: 'A computer-use run',
    body: 'Browser control needs Managed Cloud sign-in and a separate per-origin approval whose own text says it grants full DevTools-Protocol control of your signed-in session there. Every step of the run posts the conversation and the screenshots it has taken to the Managed Cloud gateway under your account token.',
  },
];

const CAPABILITIES = [
  {
    meta: 'Panel',
    title: 'A side panel beside the tab',
    body: 'A Manifest V3 side panel opens from the toolbar icon or Command+Shift+A and sits next to the page rather than over it.',
  },
  {
    meta: 'Context',
    title: 'Page text on request, on origins you approved',
    body: 'A content script loads on every http and https page so the panel can read the one you point it at. It reads when you ask, and it sends nothing from an origin that is missing from your allowlist.',
  },
  {
    meta: 'Bridge',
    title: 'An optional bridge to AGI Desktop',
    body: 'Pairing is a two-step handshake: Desktop parks a code and shows it on screen, you type it into the panel, and Desktop hands back a token. Reaching the loopback port is not enough on its own.',
  },
  {
    meta: 'Computer use',
    title: 'Browser control with the banner showing',
    body: 'A run attaches the Chrome DevTools Protocol debugger to one approved origin for one bounded action and detaches afterwards, with Chrome’s debugging banner up the whole time. Each step sends the conversation and its screenshots to the Managed Cloud gateway.',
  },
  {
    meta: 'Permissions',
    title: 'A grant you can withdraw from Chrome',
    body: 'Browser control asks Chrome for that single origin. Take the site off the list, or revoke the host permission at chrome://extensions, and the control goes with it. Approved origins ask before each action until you say otherwise.',
  },
  {
    meta: 'Injection',
    title: 'Page text arrives as untrusted input',
    body: 'Text read during a run is scanned for the phrases that try to turn an agent around: ignore previous instructions, send this to, your API key, one-time code — and a match reaches the model wrapped in a security warning.',
  },
  {
    meta: 'Automation',
    title: 'Recordings keep the selectors',
    body: 'Recording writes down the elements you touched; typed values stay out until you switch value capture on, and the on-page badge names the mode either way. Password fields are dropped even then, and a recording is bound to the origin where it started, so it refuses to replay anywhere else.',
  },
  {
    meta: 'Schedule',
    title: 'Recurring work on Chrome alarms',
    body: 'Up to fifty saved tasks fire through Chrome’s own alarms and live in extension storage. A task carrying a prompt belongs to the Managed Cloud account that made it and stays invisible to any other.',
  },
];

const BOUNDARY_LEDGER = [
  {
    k: 'Manifest',
    v: 'Chrome MV3 · side panel, service worker, and a content script on http and https pages',
  },
  {
    k: 'Chat',
    v: 'AGI Managed Cloud, every message. The extension ships no local chat runtime.',
  },
  {
    k: 'Page text',
    v: 'Leaves only from origins on your allowlist. An unapproved origin contributes nothing.',
  },
  {
    k: 'Desktop bridge',
    v: 'Optional. Loopback hosts only, default port 8787, paired by typing a code shown in the Desktop window.',
  },
  {
    k: 'Bridge integrity',
    v: 'Every native message is HMAC-SHA-256 signed over its id, timestamp and body with a per-session secret.',
  },
  {
    k: 'Keys in Chrome',
    v: 'None, and none accepted. Computer use runs on AGI’s server-side provider key rather than one of yours.',
  },
  {
    k: 'Computer-use egress',
    v: 'The whole conversation and every screenshot POST to the Managed Cloud gateway under your account token. Screenshots are not redacted and cannot be.',
  },
  {
    k: 'Chat sync',
    v: 'Managed Cloud chats are copied to your AGI account by default so they appear on web and mobile. One switch in options keeps them in this browser.',
  },
  {
    k: 'Cookies',
    v: 'A run can set a cookie on a site you are working in and never reads one. Banking, health, cloud-console, identity and mail domains are refused outright.',
  },
  {
    k: 'Prompt injection',
    v: 'Page text read during a run is pattern-scanned and reaches the model with a security warning when it matches.',
  },
];

export default function ChromeExtensionPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-fl-chrome-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              <p className="agi-fl-eyebrow">AGI in Chrome · {COMING_SOON_LABEL}</p>
              <h1 id="agi-fl-chrome-hero-title" className="agi-fl-h1">
                <span className="agi-fl-h1-line">AGI opens beside the tab you are reading.</span>{' '}
                <span className="agi-fl-h1-line">
                  Its answers come from <em className="agi-fl-h1-em">Managed Cloud</em>.
                </span>
              </h1>
              <p className="agi-fl-lede">
                The panel reads page text when you ask for it, and only on an origin you put on the
                allowlist. Every answer it gives comes back from AGI Managed Cloud. Computer use
                goes further than that: it attaches Chrome&rsquo;s own debugger to the tab and posts
                the conversation, screenshots included, under your account token.
              </p>
              <div className="agi-fl-cta-row">
                <Link href={NOTIFY_CTA.href} className="agi-fl-cta agi-fl-cta--primary">
                  {NOTIFY_CTA.label}
                </Link>
                <Link href="/agent-permissions" className="agi-fl-cta agi-fl-cta--secondary">
                  Read the permission list
                </Link>
              </div>
              <ul className="agi-fl-mode-ribbon" aria-label="Where each part runs">
                <li>Chat · AGI Managed Cloud</li>
                <li>Page text · approved origins</li>
                <li>Desktop bridge · optional</li>
              </ul>
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main" aria-hidden="true">
              <ProductFrame variant="chrome" title="AGI in Chrome" badge="Side panel" />
            </div>
          </div>
        </section>

        <ProofStrip items={BUILD_FACTS} />

        <section className="agi-fl-section" aria-labelledby="agi-fl-chrome-arch-title">
          <p className="agi-fl-eyebrow">Destinations</p>
          <h2 id="agi-fl-chrome-arch-title" className="agi-fl-h2">
            Here is every place the extension can send something.
          </h2>
          <p className="agi-fl-section-lede">
            The panel talks to AGI Managed Cloud. The bridge, when you pair it, talks to your own
            machine and nowhere else. Computer use opens a third road, and it is by far the loudest
            of the three.
          </p>
          <ol className="agi-steps">
            {ARCHITECTURE_STEPS.map((step, i) => (
              <Reveal as="li" key={step.n} delay={i * 80} className="agi-step">
                <span className="agi-step-n">{step.n}</span>
                <h3 className="agi-step-h">{step.title}</h3>
                <p className="agi-step-body">{step.body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-fl-chrome-egress-title">
          <div className="agi-callout">
            <h2 id="agi-fl-chrome-egress-title" className="agi-callout-h">
              Screenshots travel with the conversation
            </h2>
            <p className="agi-callout-p">
              A computer-use step calls the Managed Cloud gateway directly from the extension, and
              it carries the conversation together with every screenshot the run has taken of your
              tab. Those images are{' '}
              <span className="agi-callout-amber">not redacted and cannot be</span>. Whatever your
              signed-in page was showing is inside the picture. Approve an origin for browser
              control only if you would hand us that session. The gates, the allowlist, and what
              remains after both are written out at{' '}
              <Link href="/agent-permissions">agent permissions</Link>.
            </p>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-fl-chrome-caps-title">
          <p className="agi-fl-eyebrow">Capabilities</p>
          <h2 id="agi-fl-chrome-caps-title" className="agi-fl-h2">
            Each of these runs in your browser, and each one names a destination.
          </h2>
          <p className="agi-fl-section-lede">
            Everything below is already built into the extension, scoped to the pages and the
            actions you approve.
          </p>
          <div className="agi-signal-grid">
            {CAPABILITIES.map((item, i) => (
              <Reveal
                as="article"
                key={item.title}
                delay={(i % 3) * 60}
                className="agi-signal-card"
              >
                <p className="agi-signal-meta">{item.meta}</p>
                <h3 className="agi-signal-title">{item.title}</h3>
                <p className="agi-signal-body">{item.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-fl-chrome-boundary-title">
          <p className="agi-fl-eyebrow">The ledger</p>
          <h2 id="agi-fl-chrome-boundary-title" className="agi-fl-h2">
            Every destination the extension can reach is in this table.
          </h2>
          <p className="agi-fl-section-lede">
            Each row describes what the extension code already does today, including the rows we
            would rather not have to write.
          </p>
          <table className="agi-ledger">
            <tbody>
              {BOUNDARY_LEDGER.map((row) => (
                <tr key={row.k}>
                  <td>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="AGI Desktop is the half of this that runs on your machine."
          body="The extension is a browser client. Local models, encrypted provider keys, and the tools the panel borrows over the bridge all live in the desktop app, so that is where to start."
          ctas={[{ href: '/desktop', label: 'See AGI Desktop' }]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
