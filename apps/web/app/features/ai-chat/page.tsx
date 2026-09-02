import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
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
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';
import { MARKETING } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AI chat: one composer, a reply that shows its work',
  description:
    'The AGI composer takes files, images, dictation, and slash commands, then sends them to the model picked for that thread. The reply carries its tool calls, its reasoning, and its sources.',
  path: '/features/ai-chat',
});

export default function AiChatFeaturePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-features-ai-chat-title"
          eyebrow="Features · AI chat"
          title="The reply shows its work, and you pick the model."
          lede="The composer takes files, images, dictation, and slash commands, then sends them to the model you picked for this thread. What comes back carries the reasoning it did, the tools it called, and the sources it read, and anything substantial opens as an artifact beside the conversation."
          ctas={[{ href: '/login?redirectTo=%2F', label: 'Open AGI Web' }]}
          visual={
            <ProductFrame
              light="/product/composer-light.png"
              dark="/product/composer-dark.png"
              alt="The AGI composer with attachments, dictation, and the model picker"
              width={1472}
              height={254}
              caption={['Chat', 'Composer']}
            />
          }
        />

        <Section id="composer" labelledBy="agi-features-ai-chat-composer-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The composer</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-ai-chat-composer-title">
                The composer takes more than text.
              </h2>
            </div>
            <Ledger
              caption="Composer capabilities"
              rows={[
                {
                  label: 'Attach',
                  value:
                    'Drag files and images straight into the composer. Each one becomes a preview you can inspect or remove before the message is sent.',
                },
                {
                  label: 'Dictate',
                  value:
                    'The voice button records, transcribes, and drops the text into the composer, where you can edit it like anything else you typed.',
                },
                {
                  label: 'Search',
                  value:
                    'Search-capable models reach the live web on their own when an answer should not come from model memory alone. The composer states whether search is on for the model you picked.',
                },
                {
                  label: 'Commands',
                  value:
                    'Typing "/" opens a menu of the built-in commands, the custom commands you saved in Settings, and every skill installed on this surface.',
                },
                {
                  label: 'Models',
                  value: `The footer names the model in use and marks it with its provider. Reach ${MARKETING.models.display} models from ${MARKETING.providers.display} providers, and set the reasoning effort where the model supports one.`,
                },
              ]}
            />
          </Stack>
        </Section>

        <Section
          id="slash-commands"
          labelledBy="agi-features-ai-chat-commands-title"
          rule
          ground="2"
        >
          <Stack gap="loose">
            <div>
              <Eyebrow>Commands</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-ai-chat-commands-title">
                Typing a slash opens the command menu.
              </h2>
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

        <Section id="around-the-chat" labelledBy="agi-features-ai-chat-around-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Around the chat</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-ai-chat-around-title">
                The chat opens into the rest of the workspace.
              </h2>
            </div>
            <LinkGrid
              items={[
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
              ]}
            />
          </Stack>
        </Section>

        <Section id="ai-chat-close" labelledBy="agi-features-ai-chat-close-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-features-ai-chat-close-title">
              Send the first message.
            </h2>
            <Prose>
              AGI Web runs in the browser with the command menu, the model footer, and the artifacts
              panel. The desktop app adds the terminal, browser, and database commands.
            </Prose>
            <ButtonRow>
              <Button href="/login?redirectTo=%2F">Open AGI Web</Button>
              <Button href="/desktop" variant="secondary">
                See AGI Desktop
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
