import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FinalCta } from '@/features/marketing/components/SurfaceSections';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { Reveal } from '@/features/marketing/components/Reveal';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI in Chrome | Browser Context, Desktop Bridge',
  description:
    'A Chrome Manifest V3 side panel that reads the tab only when you ask. Chat answers come back from AGI Managed Cloud, a paired HMAC-signed bridge passes selections and captures to AGI Desktop, and computer use posts the conversation with its screenshots, and any console messages and request records it read, to the Managed Cloud gateway directly from the extension.',
  path: '/chrome-extension',
});

const ARCHITECTURE_STEPS = [
  {
    n: '01',
    title: 'Browser captures intent',
    body: 'The side panel and content scripts read the active tab and your prompt only when you ask. No model runs in the browser process and no provider key is ever stored there.',
  },
  {
    n: '02',
    title: 'Managed Cloud answers',
    body: 'Your message, the conversation so far, and any page text you attached go to AGI Managed Cloud under your signed-in account. The extension ships no local chat runtime, so this is the only road an answer can take.',
  },
  {
    n: '03',
    title: 'Computer use sends the pictures too',
    body: 'Driving a tab keeps the same gateway and changes the payload: every step posts the whole conversation, including every screenshot the run has taken of your tab, to the Managed Cloud gateway under your account token.',
  },
];

const CAPABILITIES = [
  {
    meta: 'Panel',
    title: 'Side panel on any page',
    body: 'A persistent Manifest V3 side panel opens beside the tab you are reading. No window juggling, no copy-paste.',
  },
  {
    meta: 'Context',
    title: 'Page context on request',
    body: 'Content scripts capture page content when you ask. Capture is an explicit action you take, never something running in the background.',
  },
  {
    meta: 'Chat',
    title: 'Answers from Managed Cloud',
    body: 'Press send and the conversation goes to AGI Managed Cloud under your account. The panel holds no provider key and offers no second chat route, so an unapproved origin contributes no page text to it.',
  },
  {
    meta: 'Bridge',
    title: 'Paired Desktop handoff',
    body: 'Native messaging carries a selection, a page capture or a queued message to AGI Desktop on localhost port 8787, with explicit pairing and HMAC-signed messages. It moves context into Desktop rather than answering in the panel.',
  },
  {
    meta: 'Computer use',
    title: 'Cloud-executed browser control',
    body: 'Driving a tab requires Managed Cloud sign-in. Each step sends the conversation and the screenshots taken of your tab to the Managed Cloud gateway, so a secret rendered on the page travels with the picture of it.',
  },
  {
    meta: 'Permissions',
    title: 'Scoped task permissions',
    body: 'Page interaction runs on approved sites with permissions scoped to the task at hand. Not a blanket grant across your browsing.',
  },
  {
    meta: 'Automation',
    title: 'Workflow recording',
    body: 'Record a browser flow as element selectors. Field values stay out of the recording by default. Replay it when the task comes back.',
  },
  {
    meta: 'Automation',
    title: 'Scheduled tasks',
    body: "Put recurring browser work on a schedule. Tasks persist in the extension and fire through Chrome's built-in alarms.",
  },
];

const BOUNDARY_LEDGER = [
  { k: 'Manifest', v: 'Chrome MV3 with side panel' },
  {
    k: 'Bridge',
    v: 'Optional native messaging to AGI Desktop · localhost port 8787 · selections, captures and queued messages',
  },
  { k: 'Pairing', v: 'Explicit pairing · HMAC-signed messages' },
  {
    k: 'Inference in Chrome',
    v: 'None. Chat answers come from AGI Managed Cloud, and computer use calls the Managed Cloud gateway directly from the extension with the screenshots it takes.',
  },
  {
    k: 'Keys in Chrome',
    v: 'None. Chat and computer use run on AGI’s server-side provider keys, not on yours. Your Desktop keys stay on Desktop, encrypted at rest.',
  },
  {
    k: 'Computer-use egress',
    v: 'The whole conversation and every screenshot POST to the Managed Cloud gateway under your account token. Screenshots are not redacted and cannot be.',
  },
  {
    k: 'Chat-memory sync',
    v: 'Managed Cloud chats mirror to your account by default. Turn mirroring off under Data handling in the extension options and they stay in local extension storage.',
  },
  {
    k: 'Security story',
    v: 'Threat model maintained in the repo (apps/extension/docs/threat-model.md)',
  },
  {
    k: 'Status',
    v: 'Chat and computer use scoped to Managed Cloud · the Desktop bridge is an optional local handoff',
  },
];

export default function ChromeExtensionPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell agi-surface">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-fl-chrome-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              <p className="agi-fl-eyebrow">AGI in Chrome · coming soon</p>
              <h1 id="agi-fl-chrome-hero-title" className="agi-fl-h1">
                <span className="agi-fl-h1-line">Your browser,</span>{' '}
                <span className="agi-fl-h1-line">
                  <em className="agi-fl-h1-em">with context.</em>
                </span>
              </h1>
              <p className="agi-fl-lede">
                AGI opens in a side panel beside any tab. It captures page context only when you
                ask, and the answer comes back from AGI Managed Cloud under your account. Computer
                use goes further: it posts the conversation and every screenshot it takes to the
                Managed Cloud gateway directly from the extension.
              </p>
              <div className="agi-fl-cta-row">
                <Link href="/desktop" className="agi-fl-cta agi-fl-cta--primary">
                  See AGI Desktop
                </Link>
                <Link href="/get-started" className="agi-fl-cta agi-fl-cta--secondary">
                  Get Started
                </Link>
              </div>
              <ul className="agi-fl-mode-ribbon" aria-label="Boundary summary">
                <li>Capture · on request</li>
                <li>Chat · Managed Cloud</li>
                <li>Computer use · screenshots included</li>
              </ul>
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main" aria-hidden="true">
              <ProductFrame variant="browser" title="AGI · side panel" badge="Scoped" />
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-fl-chrome-arch-title">
          <p className="agi-fl-eyebrow">The architecture</p>
          <h2 id="agi-fl-chrome-arch-title" className="agi-fl-h2">
            The browser asks. Managed Cloud answers.
          </h2>
          <p className="agi-fl-section-lede">
            AGI in Chrome never runs a model locally and never stores provider keys. It captures
            what you point at, sends it to Managed Cloud under your account, and brings the answer
            back into the panel. Pairing AGI Desktop adds a local road for selections and captures,
            not a second place an answer can come from. Computer use keeps the same gateway and adds
            the screenshots it takes of your tab.
          </p>
          <ol className="agi-steps">
            {ARCHITECTURE_STEPS.map((step, i) => (
              <Reveal as="li" key={step.n} delay={i * 80} className="agi-step">
                <span className="agi-step-n" aria-hidden="true">
                  {step.n}
                </span>
                <h3 className="agi-step-h">{step.title}</h3>
                <p className="agi-step-body">{step.body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-fl-chrome-caps-title">
          <p className="agi-fl-eyebrow">Capabilities</p>
          <h2 id="agi-fl-chrome-caps-title" className="agi-fl-h2">
            A working surface, not a wrapper.
          </h2>
          <p className="agi-fl-section-lede">
            Everything below is built into the extension, scoped to the pages and tasks you approve.
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
          <p className="agi-fl-eyebrow">Trust boundary</p>
          <h2 id="agi-fl-chrome-boundary-title" className="agi-fl-h2">
            What stays where.
          </h2>
          <p className="agi-fl-section-lede">
            Local, BYOK, and AGI Cloud are separate trust boundaries, and the panel sits in the
            cloud one: chat leaves for Managed Cloud under your account whatever route you run on
            Desktop. Computer use goes further still, transmitting the conversation and its
            screenshots to that gateway on every step, which is why starting a session is always an
            explicit act. The session gates, the site allowlist, and the residual screenshot risk
            are written out at <Link href="/agent-permissions">/agent-permissions</Link>. Those
            chats mirror to your account until you turn mirroring off in the extension options.
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
          title="Put AGI beside the page."
          body="The panel answers from AGI Managed Cloud, and computer use posts the conversation, its screenshots, and any console messages and request records it read to that same gateway. Pair AGI Desktop when you want a local road for selections and captures. AGI managed cloud is in public alpha and open by default: sign in and start, no waitlist."
          ctas={[
            { href: '/desktop', label: 'See AGI Desktop' },
            { href: '/get-started', label: 'Get Started' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
