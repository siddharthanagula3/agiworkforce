import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { PhoneDevice } from '@/features/marketing/components/DeviceMockups';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  MarketingFooter,
  Prose,
  SurfaceStatus,
} from '@/features/marketing/components/system';
import { SURFACE_STATUS } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI Mobile: local chat that stays on your phone',
  description:
    'AGI Mobile runs chat on-device by default, through the phone’s own model runtime or a downloaded build. Chats, memory, projects, and files stay on the phone unless you choose otherwise. Not on the App Store or Google Play yet.',
  path: '/mobile',
});

const RUNTIME_FACTS = [
  {
    meta: 'System model',
    title: 'The model the operating system already holds',
    body: "On an iPhone where Apple Intelligence is available, AGI generates through Apple's Foundation Models runtime. On an Android device with AICore, it generates through Google's on-device model. Neither one is downloaded by AGI.",
  },
  {
    meta: 'Downloaded model',
    title: 'A model you download once',
    body: 'Choose AGI Standard instead and the phone loads a 4B Qwen3 build, roughly 2 GB quantized, with a 262,144-token context. It runs through ExecuTorch where the device reports at least 3.5 GB of RAM, and through llama.rn from the downloaded file where it does not.',
  },
  {
    meta: 'Model picker',
    title: 'A picker that says which one is loaded',
    body: 'Every row in the model picker carries one of three states, ready, download required, or locked, so the cost of a tap is visible before you make it. Generation also pauses on its own while the device reports thermal throttling.',
  },
] as const;

const APP_FACTS = [
  {
    meta: 'Chat',
    title: 'Local chat',
    body: 'Threads run and stay on the device, and the model picker sits in the composer beside the attach and voice controls.',
  },
  {
    meta: 'Projects',
    title: 'Projects and recents',
    body: 'One drawer holds chats, projects, artifacts, the library, connectors, skills, schedules, and tasks.',
  },
  {
    meta: 'Memory',
    title: 'Memory and personalization',
    body: 'Memory facts are held on the phone and are excluded even when you choose to sync chats to AGI Cloud.',
  },
  {
    meta: 'Data',
    title: 'Data controls',
    body: 'Export chats, memory, settings, and installed model details from the device, and wipe local-only chats from Storage.',
  },
] as const;

export default function MobilePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby="agi-mobile-hero-title">
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <Eyebrow>AGI Mobile</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-mobile-hero-title">
                Your phone runs the model <em className="agi-ds-accent">and keeps the chat.</em>
              </h1>
              <Prose size="lg">
                On an iPhone with Apple Intelligence the app generates through Apple&rsquo;s
                Foundation Models runtime, and on Android through AICore. Otherwise you download AGI
                Standard once and it runs through ExecuTorch or llama.rn. Either way the thread is
                written to SQLite on the phone.
              </Prose>
              <ButtonRow>
                <Button href="/download">Get notified</Button>
                <Button href="/local" variant="secondary">
                  How local mode is defined
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <div className="agi-lp-phone">
                <PhoneDevice />
              </div>
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-mobile-status-title">
          <div className="agi-ds-container">
            <h2 className="agi-ds-h2" id="agi-mobile-status-title">
              Where the build stands.
            </h2>
            <div style={{ marginTop: '2rem' }}>
              <SurfaceStatus
                state="absent"
                name="AGI Mobile"
                detail={`${SURFACE_STATUS.mobile}. No listing on the App Store or Google Play. The runtimes and drawer described below are built and running on-device; neither store submission is published.`}
              />
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-mobile-runtime-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>On-device inference</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-mobile-runtime-title">
                A local answer is generated by the phone you are holding.
              </h2>
              <Prose>
                The app picks a runtime from what the hardware actually reports, the system model, a
                downloaded one, or nothing yet, and it tells you which before you send anything.
              </Prose>
            </div>
            <div className="agi-ds-grid-2">
              {RUNTIME_FACTS.map((item) => (
                <div className="agi-ds-card" style={{ padding: '1.5rem' }} key={item.title}>
                  <Eyebrow>{item.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-mobile-cloud-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>What tapping Cloud does</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-mobile-cloud-title">
                Switch to AGI Cloud?
              </h2>
            </div>
            <Prose size="lg">
              &ldquo;Sign in to use AGI Cloud chat. Your local chat stays on this device unless you
              choose to start a Cloud session.&rdquo; That is the dialog, word for word. Local and
              Cloud sit side by side in the chat screen, onboarding lands you on local with no
              account, and Cloud stays behind that prompt until you sign in. Sending chats you
              already have is a separate action under Settings, Data controls: it copies
              conversation titles and message text, leaves file attachments and memory facts on the
              phone, and runs once when you press it.
            </Prose>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-mobile-app-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>In the app</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-mobile-app-title">
                The drawer carries the whole workspace.
              </h2>
            </div>
            <Ledger
              caption="AGI Mobile drawer contents"
              rows={APP_FACTS.map((item) => ({ label: item.title, value: item.body }))}
            />
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-mobile-build-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Build sheet</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-mobile-build-title">
                Here is what the build contains.
              </h2>
            </div>
            <Ledger
              caption="AGI Mobile build sheet"
              rows={[
                {
                  label: 'Default model',
                  value: 'AGI Standard, Qwen3 4B Instruct, ~2 GB quantized, 262,144-token context',
                },
                { label: 'Lighter option', value: 'AGI Lite, 1B on-device build, ~1.1 GB' },
                { label: 'Chats and memory', value: 'SQLite on the device' },
                {
                  label: 'Export',
                  value: 'Runs on the device: chats, memory, settings, installed model details',
                },
                {
                  label: 'Cloud sync',
                  value: 'Manual and one-time. Attachments and memory facts stay on the phone',
                },
                {
                  label: 'App lock',
                  value: 'The Face ID, Touch ID, or passcode already enrolled on the phone',
                },
                {
                  label: 'Model training',
                  value:
                    'Off. Prompts, responses, and files are not used to train AGI-owned models',
                },
              ]}
            />
          </div>
        </section>

        <section className="agi-lp-close" aria-labelledby="agi-mobile-close-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-mobile-close-title">
                Neither store listing <em className="agi-ds-accent">is published yet.</em>
              </h2>
              <Prose size="lg">
                The runtimes, the drawer, and the settings above are built and running on device. No
                release date has been announced.
              </Prose>
              <ButtonRow>
                <Button href="/mobile/legal" variant="secondary">
                  Read the mobile privacy policy
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
