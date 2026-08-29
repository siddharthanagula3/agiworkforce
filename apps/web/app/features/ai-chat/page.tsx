import { buildMetadata } from '@/lib/seo/metadata';
import { getModels } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { CapabilityGrid, FinalCta } from '@/features/marketing/components/FlagshipSections';
import { FeatureGrid, LedgerSection } from '@/features/marketing/components/LandingSections';
import { MARKETING } from '../../../lib/marketing-constants';

const DEMO_MODEL = getModels({ modelTypes: ['chat'] }).find((model) => model.capabilities.thinking);
const DEMO_MODEL_NAME = DEMO_MODEL?.name ?? '';

export const metadata = buildMetadata({
  title: 'AGI AI Chat | One Conversation Across Six Surfaces',
  description:
    'AI Chat in the AGI workspace: one composer with attachments, voice input, web search, slash commands, and per-chat model choice. Across six surfaces and three trust modes.',
  path: '/features/ai-chat',
});

const RETRY_PATCH = `export async function withRetry<T>(run: () => Promise<T>, max = 4) {
  for (let attempt = 0; attempt < max; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!isRateLimited(err) || attempt === max - 1) throw err;
      await sleep(retryAfterMs(err) ?? 2 ** attempt * 500);
    }
  }
}`;

export default function AiChatFeaturePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Features · AI Chat</p>
          <h1 className="agi-page-h1">
            The reply <em>shows its work</em>, and you pick the model.
          </h1>
          <p className="agi-page-lede">
            The composer takes files, images, dictation, and slash commands, then sends them to the
            model you picked for this thread. What comes back carries the reasoning it did, the
            tools it called, and the sources it read, and anything substantial opens as an artifact
            beside the conversation.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">The transcript</p>
          <h2 className="agi-section-h2">This is what a reply with tool calls looks like.</h2>
          <div className="agi-chat">
            <div className="agi-chat-header">
              <span className="agi-chat-model">{DEMO_MODEL_NAME} · High</span>
              <span className="agi-chat-meta">example turn</span>
            </div>
            <div className="agi-chat-body">
              <div className="agi-msg">
                <div className="agi-msg-role">you</div>
                <div className="agi-msg-text">
                  Our retry helper gives up on the first <code>429</code>. Read{' '}
                  <code>lib/retry.ts</code>, check what the provider asks for, and rewrite it.
                </div>
              </div>

              <div className="agi-msg">
                <div className="agi-msg-role">{DEMO_MODEL_NAME}</div>
                <div className="agi-msg-quiet">
                  <div className="agi-msg-text">
                    Thought for 8s · Web search · Read file · Edit file
                  </div>
                </div>
                <div className="agi-msg-text">
                  It treats every non-2xx response as fatal, so a rate limit never gets a second
                  attempt. Backing off and honoring the <code>retry-after</code> header fixes it.
                </div>
                <div className="agi-terminal">
                  <div className="agi-terminal-bar">lib/retry.ts</div>
                  <pre className="agi-terminal-pre">{RETRY_PATCH}</pre>
                </div>
                <div className="agi-msg-quiet">
                  <div className="agi-msg-text">
                    Opened in the artifacts panel with a code toggle and a version chip.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <FeatureGrid
          eyebrow="The composer"
          title="The composer takes more than text."
          items={[
            {
              meta: 'Attach',
              title: 'Files and images, dropped in',
              body: 'Drag files and images straight into the composer. Each one becomes a preview you can inspect or remove before the message is sent.',
            },
            {
              meta: 'Dictate',
              title: 'Say it instead of typing it',
              body: 'The voice button records, transcribes, and drops the text into the composer, where you can edit it like anything else you typed.',
            },
            {
              meta: 'Search',
              title: 'The live web, with no switch to hunt for',
              body: 'Search-capable models reach the live web on their own when an answer should not come from model memory alone. The composer states whether search is on for the model you picked.',
            },
            {
              meta: 'Commands',
              title: 'Slash for the command menu',
              body: 'Typing “/” opens a menu of the built-in commands, the custom commands you saved in Settings, and every skill installed on this surface.',
            },
            {
              meta: 'Models',
              title: 'Switch models mid-thread',
              body: `The footer names the model in use and marks it with its provider. Reach ${MARKETING.models.display} models from ${MARKETING.providers.display} providers, and set the reasoning effort where the model supports one.`,
            },
          ]}
        />

        <LedgerSection
          eyebrow="Commands"
          title="Typing a slash opens the command menu."
          rows={[
            { k: '/search', v: 'Search the web.' },
            { k: '/think', v: 'Extended reasoning.' },
            {
              k: '/image',
              v: 'Generate an image. Listed when an image model is available to you.',
            },
            {
              k: '/code',
              v: 'Run code in a sandbox. Listed when the selected model supports code execution.',
            },
            { k: '/browser', v: 'Automate browser actions. Desktop only.' },
            { k: '/terminal', v: 'Execute shell commands. Desktop only.' },
            { k: '/database', v: 'Run database queries. Desktop only.' },
          ]}
        />

        <CapabilityGrid
          eyebrow="Around the chat"
          title="The chat opens into the rest of the workspace."
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
              body: 'Point a thread at a project and it starts with that project’s files, sources, and instructions.',
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
              title: 'Tools & Connectors',
              body: 'Connected MCP servers and OAuth apps appear in the tool timeline under per-tool permissions.',
              href: '/features/tools',
            },
          ]}
        />

        <FinalCta
          eyebrow="Open a thread"
          title="Send the first message."
          body="AGI Web runs in the browser with the command menu, the model footer, and the artifacts panel. The desktop app adds the terminal, browser, and database commands."
          ctas={[
            { href: '/login?redirectTo=%2F', label: 'Open AGI Web' },
            { href: '/desktop', label: 'See AGI Desktop' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
