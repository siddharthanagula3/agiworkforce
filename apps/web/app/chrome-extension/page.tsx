import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { ChromeWindow } from '@/features/marketing/components/DeviceMockups';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  MarketingFooter,
  Prose,
  Section,
  Stack,
  SurfaceStatus,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';

export const metadata = buildMetadata({
  title: 'AGI in Chrome: a side panel that answers about the tab you are reading',
  description:
    'A Chrome Manifest V3 side panel that answers about the tab you are reading. Chat runs on AGI Managed Cloud, page text is sent only from origins you approved, and AGI Desktop is an optional local bridge. Not on the Chrome Web Store yet.',
  path: '/chrome-extension',
});

export default function ChromeExtensionPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-chrome-hero-title"
          eyebrow="AGI in Chrome"
          title="AGI opens beside the tab you are reading."
          lede="The panel reads page text when you ask for it, and only on an origin you put on the allowlist. Every answer it gives comes back from AGI Managed Cloud. Computer use goes further than that: it attaches Chrome's own debugger to the tab and posts the conversation, screenshots included, under your account token."
          ctas={[
            { href: '/download', label: 'Get notified' },
            { href: '/agent-permissions', label: 'Read the permission list', variant: 'secondary' },
          ]}
          visual={<ChromeWindow />}
        />

        <section className="agi-lp-section" aria-labelledby="agi-chrome-status-title">
          <div className="agi-ds-container">
            <h2 className="agi-ds-h2" id="agi-chrome-status-title">
              Where the build stands.
            </h2>
            <div style={{ marginTop: '2rem' }}>
              <SurfaceStatus
                state="absent"
                name="AGI in Chrome"
                detail="No listing on the Chrome Web Store. The manifest, side panel, and bridge described below are already built into the extension."
              />
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-chrome-build-title">
          <div className="agi-ds-container">
            <h2 className="agi-ds-h2" id="agi-chrome-build-title">
              What the build is.
            </h2>
            <Ledger
              caption="Chrome extension build facts"
              rows={[
                {
                  label: 'Manifest',
                  value:
                    'MV3, chrome manifest version. Service worker, side panel, content script. Scripts load only from the extension itself.',
                },
                { label: 'Minimum Chrome', value: '132, declared in the manifest' },
                { label: 'Desktop bridge port', value: '8787 by default; loopback hosts only' },
                {
                  label: 'Bridge integrity',
                  value:
                    'Every native message is HMAC-SHA-256 signed over its id, timestamp and body with a per-session secret',
                },
              ]}
            />
          </div>
        </section>

        <Section id="chrome-destinations" labelledBy="agi-chrome-destinations-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Destinations</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-chrome-destinations-title">
                Here is every place the extension can send something.
              </h2>
              <Prose>
                The panel talks to AGI Managed Cloud. The bridge, when you pair it, talks to your
                own machine and nowhere else. Computer use opens a third road, and it is by far the
                loudest of the three.
              </Prose>
            </div>
            <Stack gap="base">
              <Eyebrow>api.agiworkforce.com</Eyebrow>
              <h3 className="agi-ds-h3">Chat and the page text you attach</h3>
              <Prose size="sm">
                Press send and your message, the conversation so far, and any page text you attached
                go to AGI Managed Cloud. The extension holds no provider key and offers no second
                chat route, so this is the only road for an answer. An origin you have not approved
                contributes no page text to it.
              </Prose>
            </Stack>
            <Stack gap="base">
              <Eyebrow>localhost:8787</Eyebrow>
              <h3 className="agi-ds-h3">The optional Desktop bridge</h3>
              <Prose size="sm">
                Pair AGI Desktop once, by reading a code off its window and typing it into the
                panel, and the status pill turns from Desktop optional into Desktop tools. The
                capture shortcut has this destination and no other, so on an unpaired browser it
                captures nothing at all.
              </Prose>
            </Stack>
            <Stack gap="base">
              <Eyebrow>api.agiworkforce.com, plus images</Eyebrow>
              <h3 className="agi-ds-h3">A computer-use run</h3>
              <Prose size="sm">
                Browser control needs Managed Cloud sign-in and a separate per-origin approval that
                grants full DevTools-Protocol control of your signed-in session there. Every step of
                the run posts the conversation and the screenshots it has taken to the Managed Cloud
                gateway under your account token.
              </Prose>
            </Stack>
          </Stack>
        </Section>

        <section className="agi-lp-section" aria-labelledby="agi-chrome-screenshots-title">
          <div className="agi-ds-container">
            <h2 className="agi-ds-h2" id="agi-chrome-screenshots-title">
              Screenshots travel with the conversation.
            </h2>
            <Prose size="lg">
              A computer-use step calls the Managed Cloud gateway directly from the extension, and
              it carries the conversation together with every screenshot the run has taken of your
              tab. Those images are not redacted and cannot be. Whatever your signed-in page was
              showing is inside the picture. Approve an origin for browser control only if you would
              hand us that session. The gates, the allowlist, and what remains after both are
              written out on the{' '}
              <a href="/agent-permissions" className="agi-ds-link">
                agent permissions
              </a>{' '}
              page.
            </Prose>
          </div>
        </section>

        <Section id="chrome-capabilities" labelledBy="agi-chrome-capabilities-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Capabilities</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-chrome-capabilities-title">
                Each of these runs in your browser, and each one names a destination.
              </h2>
            </div>
            <div className="agi-ds-grid-2">
              {[
                {
                  meta: 'Panel',
                  title: 'A side panel beside the tab',
                  body: 'A Manifest V3 side panel opens from the toolbar icon or Command+Shift+A and sits next to the page rather than over it.',
                },
                {
                  meta: 'Context',
                  title: 'Page text on request, on origins you approved',
                  body: 'A content script loads on every http and https page so the panel can read the one you point it at. It sends nothing from an origin missing from your allowlist.',
                },
                {
                  meta: 'Bridge',
                  title: 'An optional bridge to AGI Desktop',
                  body: 'Pairing is a two-step handshake: Desktop parks a code and shows it on screen, you type it into the panel, and Desktop hands back a token.',
                },
                {
                  meta: 'Computer use',
                  title: 'Browser control with the banner showing',
                  body: 'A run attaches the Chrome DevTools Protocol debugger to one approved origin for one bounded action and detaches afterwards, with Chrome’s debugging banner up the whole time.',
                },
                {
                  meta: 'Permissions',
                  title: 'A grant you can withdraw from Chrome',
                  body: 'Browser control asks Chrome for that single origin. Take the site off the list, or revoke the host permission at chrome://extensions, and the control goes with it.',
                },
                {
                  meta: 'Injection',
                  title: 'Page text arrives as untrusted input',
                  body: 'Text read during a run is scanned for the phrases that try to turn an agent around, such as ignore previous instructions or your API key, and a match reaches the model wrapped in a security warning.',
                },
                {
                  meta: 'Automation',
                  title: 'Recordings keep the selectors',
                  body: 'Recording writes down the elements you touched; typed values stay out until you switch value capture on. Password fields are dropped even then, and a recording refuses to replay on any other origin.',
                },
                {
                  meta: 'Schedule',
                  title: 'Recurring work on Chrome alarms',
                  body: 'Up to fifty saved tasks fire through Chrome’s own alarms and live in extension storage. A task carrying a prompt belongs to the Managed Cloud account that made it.',
                },
              ].map((item) => (
                <div className="agi-ds-card" style={{ padding: '1.5rem' }} key={item.title}>
                  <Eyebrow>{item.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                </div>
              ))}
            </div>
          </Stack>
        </Section>

        <Section id="chrome-boundary" labelledBy="agi-chrome-boundary-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>The ledger</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-chrome-boundary-title">
                Every destination the extension can reach is in this table.
              </h2>
            </div>
            <Ledger
              caption="Chrome extension boundary"
              rows={[
                {
                  label: 'Chat',
                  value:
                    'AGI Managed Cloud, every message. The extension ships no local chat runtime.',
                },
                {
                  label: 'Page text',
                  value:
                    'Leaves only from origins on your allowlist. An unapproved origin contributes nothing.',
                },
                {
                  label: 'Keys in Chrome',
                  value:
                    'None, and none accepted. Computer use runs on AGI’s server-side provider key rather than one of yours.',
                },
                {
                  label: 'Computer-use egress',
                  value:
                    'The whole conversation and every screenshot post to the Managed Cloud gateway under your account token.',
                },
                {
                  label: 'Chat sync',
                  value:
                    'Managed Cloud chats are copied to your AGI account by default so they appear on web and mobile. One switch in options keeps them in this browser.',
                },
                {
                  label: 'Cookies',
                  value:
                    'A run can set a cookie on a site you are working in and never reads one. Banking, health, cloud-console, identity and mail domains are refused outright.',
                },
              ]}
            />
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby="agi-chrome-close-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-chrome-close-title">
                AGI Desktop is the half of this{' '}
                <em className="agi-ds-accent">that runs on your machine.</em>
              </h2>
              <Prose size="lg">
                The extension is a browser client. Local models, encrypted provider keys, and the
                tools the panel borrows over the bridge all live in the desktop app, so that is
                where to start.
              </Prose>
              <ButtonRow>
                <Button href="/download">Get notified</Button>
                <Button href="/desktop" variant="secondary">
                  See AGI Desktop
                </Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
