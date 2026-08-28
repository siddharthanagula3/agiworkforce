import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FinalCta } from '@/features/marketing/components/FlagshipSections';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { Reveal } from '@/features/marketing/components/Reveal';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI in Chrome | Browser Context, Desktop Bridge',
  description:
    'A Chrome Manifest V3 side panel that captures page context on request and hands chat to AGI Desktop over a paired, HMAC-signed native-messaging bridge. Computer use is the exception: it calls the Managed Cloud gateway directly from the extension, sending the conversation and its screenshots.',
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
    title: 'One paired bridge',
    body: "Chat crosses Chrome's native-messaging bridge to AGI Desktop on localhost port 8787. You pair the two once, explicitly, and every message is HMAC-signed.",
  },
  {
    n: '03',
    title: 'Desktop executes chat, Managed Cloud executes computer use',
    body: 'Chat models and tools run on Desktop in the route you chose there. Computer use does not use the bridge at all: the extension posts the whole conversation, including every screenshot it captures, to the Managed Cloud gateway under your account token.',
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
    meta: 'Bridge',
    title: 'Paired Desktop bridge',
    body: 'Native messaging carries chat to AGI Desktop on localhost port 8787 with explicit pairing and HMAC-signed messages. Provider keys never enter the browser.',
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
  { k: 'Bridge', v: 'Native messaging to AGI Desktop · localhost port 8787' },
  { k: 'Pairing', v: 'Explicit pairing · HMAC-signed messages' },
  {
    k: 'Inference in Chrome',
    v: 'Chat runs on Desktop. Computer use calls the Managed Cloud gateway directly from the extension, and the screenshots it takes go with it.',
  },
  {
    k: 'Keys in Chrome',
    v: 'None. Your Desktop keys stay on Desktop, encrypted at rest. Computer use runs on AGI’s server-side provider key, not one of yours.',
  },
  {
    k: 'Computer-use egress',
    v: 'The whole conversation and every screenshot POST to the Managed Cloud gateway under your account token. Screenshots are not redacted and cannot be.',
  },
  {
    k: 'Chat-memory sync',
    v: 'No default global sync. Chats stay in local extension storage.',
  },
  { k: 'Security story', v: 'Threat model maintained in the repo (docs/threat-model.md)' },
  { k: 'Status', v: 'Chat scoped to the Desktop bridge · computer use scoped to Managed Cloud' },
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
              <p className="agi-fl-eyebrow">AGI in Chrome · coming soon</p>
              <h1 id="agi-fl-chrome-hero-title" className="agi-fl-h1">
                <span className="agi-fl-h1-line">Your browser,</span>{' '}
                <span className="agi-fl-h1-line">
                  <em className="agi-fl-h1-em">with context.</em>
                </span>
              </h1>
              <p className="agi-fl-lede">
                AGI opens in a side panel beside any tab. It captures page context only when you
                ask, then hands chat to AGI Desktop over a paired native-messaging bridge, where
                your models and keys stay. Computer use is the exception: it calls the Managed Cloud
                gateway directly from the extension and sends the conversation and its screenshots
                there.
              </p>
              <div className="agi-fl-cta-row">
                <Link href="/desktop" className="agi-fl-cta agi-fl-cta--primary">
                  See AGI Desktop
                </Link>
                <Link href="/get-started" className="agi-fl-cta agi-fl-cta--secondary">
                  Get Started
                </Link>
              </div>
              <ul className="agi-fl-mode-ribbon" aria-label="Bridge guarantees">
                <li>Capture · on request</li>
                <li>Chat · paired bridge to Desktop</li>
                <li>Computer use · Managed Cloud</li>
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
            The browser asks. Desktop answers, except for computer use.
          </h2>
          <p className="agi-fl-section-lede">
            AGI in Chrome never runs a model locally and never stores provider keys. For chat it
            captures what you point at, crosses one paired bridge, and lets Desktop do the heavy
            lifting. Computer use is the exception: it signs in to Managed Cloud and calls that
            gateway directly from the extension, sending the conversation and the screenshots it
            takes with it.
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
            Local, BYOK, and AGI Cloud are separate trust boundaries. Chat inherits the one you
            chose on Desktop, and nothing about your browsing changes that silently. Computer use
            does not inherit it: it requires Managed Cloud sign-in and transmits the conversation
            and its screenshots to that gateway on every step, which is why starting a session is
            always an explicit act. The session gates, the site allowlist, and the residual
            screenshot risk are written out at{' '}
            <Link href="/agent-permissions">/agent-permissions</Link>. Your chats and memory
            don&apos;t sync anywhere by default.
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
          body="Start with AGI Desktop. The extension hands chat to it across one paired, signed bridge, and runs computer use against Managed Cloud instead. AGI managed cloud is in public alpha and open by default — sign in and start, no waitlist."
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
