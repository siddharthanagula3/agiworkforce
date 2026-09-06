import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { WebWindow } from '@/features/marketing/components/DeviceMockups';
import { ComposerWindow } from '@/features/marketing/components/FeatureScenes';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { MARKETING } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AI chat: one composer, a reply that shows its work',
  description:
    'The AGI composer takes files, images, dictation, and slash commands, then sends them to the model picked for that thread. The reply carries its tool calls, its reasoning, and its sources.',
  path: '/features/ai-chat',
});

const IDS = {
  hero: 'agi-features-ai-chat-title',
  moment: 'agi-features-ai-chat-moment-title',
  commands: 'agi-features-ai-chat-commands-title',
  links: 'agi-features-ai-chat-links-title',
  close: 'agi-features-ai-chat-close-title',
} as const;

const AROUND_THE_CHAT = [
  {
    meta: 'Artifacts',
    title: 'Artifacts',
    body: 'Long outputs leave the message stream and open in a panel with a code toggle and version history.',
    href: '/features/artifacts',
  },
  {
    meta: 'Projects',
    title: 'Projects',
    body: "Point a thread at a project and it starts with that project's files, sources, and instructions.",
    href: '/features/projects',
  },
  {
    meta: 'Memory',
    title: 'Memory',
    body: 'Type /memory to open what the assistant has kept about you and edit it directly.',
    href: '/features/memory',
  },
  {
    meta: 'Tools',
    title: 'Tools and connectors',
    body: 'Connected MCP servers and OAuth apps appear in the tool timeline under per-tool permissions.',
    href: '/features/tools',
  },
] as const;

export default function AiChatFeaturePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Features &middot; AI chat</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                <span className="agi-lp-line">One composer.</span>
                <span className="agi-lp-line">Every model.</span>
                <em className="agi-lp-accent">The reply shows its work.</em>
              </h1>
              <p className="agi-lp-lede">
                Attach files, dictate, or type a slash command, then send it to the model you picked
                for this thread. The reply carries its tool calls, its reasoning, and its sources,
                and anything substantial opens as an artifact beside it.
              </p>
              <ButtonRow>
                <Button href="/login?redirectTo=%2F">Open AGI Web</Button>
                <Button href="/desktop" variant="secondary">
                  See AGI Desktop
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <WebWindow />
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby={IDS.moment}>
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <p className="agi-lp-eyebrow">The composer</p>
              <h2 className="agi-lp-h2" id={IDS.moment}>
                One box, <em className="agi-lp-accent">more than text.</em>
              </h2>
            </div>
            <div className="agi-lp-moments">
              <article className="agi-lp-moment">
                <div className="agi-lp-moment-copy">
                  <h3 className="agi-lp-moment-title">Attach, dictate, or search</h3>
                  <p className="agi-lp-moment-body">
                    Drag files and images straight into the composer; each becomes a preview you can
                    inspect or remove before sending. The voice button transcribes speech into
                    editable text. Search-capable models reach the live web on their own when an
                    answer should not come from model memory alone. The composer states whether
                    search is on for the model you picked. The footer names the model in use,
                    reaching {MARKETING.models.display} models across {MARKETING.providers.display}{' '}
                    providers.
                  </p>
                </div>
                <ComposerWindow />
              </article>
            </div>
          </div>
        </section>

        <Section id="slash-commands" labelledBy={IDS.commands} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Commands</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.commands}>
                Typing a slash opens the command menu.
              </h2>
              <Prose>
                The menu lists the built-in commands, the custom commands you saved in Settings, and
                every skill installed on this surface.
              </Prose>
            </div>
            <Ledger
              caption="Slash commands"
              rows={[
                { label: '/search', value: 'Search the web.' },
                { label: '/think', value: 'Extended reasoning.' },
                {
                  label: '/image',
                  value: 'Generate an image. Listed when an image model is available to you.',
                },
                {
                  label: '/code',
                  value:
                    'Run code in a sandbox. Listed when the selected model supports code execution.',
                },
                { label: '/browser', value: 'Automate browser actions. Desktop only.' },
                { label: '/terminal', value: 'Execute shell commands. Desktop only.' },
                { label: '/database', value: 'Run database queries. Desktop only.' },
              ]}
            />
          </Stack>
        </Section>

        <Section id="around-the-chat" labelledBy={IDS.links} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Around the chat</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.links}>
                The chat opens into the rest of the workspace.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {AROUND_THE_CHAT.map((item) => (
                <div
                  key={item.title}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--agi-rule)] bg-[var(--agi-ground-2)] p-6"
                >
                  <Eyebrow>{item.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                  <Link href={item.href} className="agi-ds-link">
                    Read more
                  </Link>
                </div>
              ))}
            </div>
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Send the first message. <em className="agi-lp-accent">See what comes back.</em>
              </h2>
              <p className="agi-lp-lede">
                AGI Web runs in the browser with the command menu, the model footer, and the
                artifacts panel. The desktop app adds the terminal, browser, and database commands.
              </p>
              <ButtonRow>
                <Button href="/login?redirectTo=%2F">Open AGI Web</Button>
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
