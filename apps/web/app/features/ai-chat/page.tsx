import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbSchema } from '@/lib/seo/structured-data';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import { CapabilityGrid, FinalCta } from '../../../components/marketing/FlagshipSections';
import { FeatureGrid, LedgerSection } from '../../../components/marketing/LandingSections';
import { MARKETING } from '../../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI AI Chat | One Conversation Across Six Surfaces',
  description:
    'AI Chat in the AGI workspace: one composer with attachments, voice input, web search, slash commands, and per-chat model choice. Across six surfaces and three trust modes.',
  path: '/features/ai-chat',
});

export default function AiChatFeaturePage() {
  return (
    <div data-design="agi">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Features', path: '/features' },
          { name: 'AI Chat', path: '/features/ai-chat' },
        ])}
      />
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Features · AI Chat</p>
          <h1 className="agi-page-h1">The conversation is the front door.</h1>
          <p className="agi-page-lede">
            Every AGI session starts as a chat: one fast, familiar composer that carries your files,
            tools, projects, and memory with it. On all six surfaces, in every trust mode, with the
            route visible before a request leaves your device.
          </p>
        </section>

        <FeatureGrid
          eyebrow="The composer"
          title="Everything within reach of the cursor."
          items={[
            {
              meta: 'Attach',
              title: 'Files and images, dropped in',
              body: 'Drag files and images straight into the composer and review them as previews before anything is sent.',
            },
            {
              meta: 'Voice',
              title: 'Speak instead of typing',
              body: "A built-in voice input records your prompt, so longer thoughts don't have to be thumbed out.",
            },
            {
              meta: 'Search',
              title: 'Web search on demand',
              body: "A one-tap toggle sends the question to the live web when an answer shouldn't come from model memory alone.",
            },
            {
              meta: 'Models',
              title: 'The right model per chat',
              body: `Pick from ${MARKETING.models.display} models across ${MARKETING.providers.display} providers without leaving the composer. The active provider stays labeled.`,
            },
            {
              meta: 'Commands',
              title: 'Slash commands',
              body: 'Type “/” to reach commands and shortcuts without taking your hands off the keyboard.',
            },
            {
              meta: 'Modes',
              title: 'Trust mode, visible',
              body: 'Each chat shows whether it runs Local, BYOK, or on AGI Cloud. A Local thread stays Local. Any continuation elsewhere is an explicit choice.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="The reply"
          title="Answers you can take apart."
          rows={[
            {
              k: 'Reasoning',
              v: 'Thinking models stream their reasoning into a collapsible block above the answer.',
            },
            {
              k: 'Tools',
              v: 'Tool calls render as an inspectable timeline, not invisible side effects.',
            },
            {
              k: 'Citations',
              v: 'Inline citations point back at sources when web search or research informs the answer.',
            },
            {
              k: 'Artifacts',
              v: 'Substantial outputs open as artifacts beside the chat, with previews and versions.',
            },
            {
              k: 'Actions',
              v: 'Copy any message, or regenerate a reply that missed the mark.',
            },
            {
              k: 'Sharing',
              v: 'Conversations can be shared as read-only views. Expired shares say so instead of breaking.',
            },
          ]}
        />

        <CapabilityGrid
          eyebrow="Connected"
          title="A chat that opens into a workspace."
          items={[
            {
              meta: 'Artifacts',
              title: 'Artifacts',
              body: 'Documents, code, and visual outputs with previews, versions, and sharing.',
              href: '/features/artifacts',
            },
            {
              meta: 'Projects',
              title: 'Projects',
              body: 'Group chats, files, instructions, memory, and sources by topic.',
              href: '/features/projects',
            },
            {
              meta: 'Memory',
              title: 'Memory',
              body: 'Preferences and project memory you can see, search, and control.',
              href: '/features/memory',
            },
            {
              meta: 'Research',
              title: 'Deep Research',
              body: 'Cited reports across the web, your files, and connected tools.',
              href: '/features/deep-research',
            },
            {
              meta: 'Tools',
              title: 'Tools & Connectors',
              body: 'MCP servers, OAuth apps, and explicit tool permissions for real work.',
              href: '/features/tools',
            },
            {
              meta: 'Agents',
              title: 'Agents',
              body: 'Delegated, tool-using work with explicit permissions and approvals.',
              href: '/features/agents',
            },
          ]}
        />

        <FinalCta
          eyebrow="Start now"
          title="Start the conversation."
          body="Try AGI Web in the browser. Get notified when the apps open for Local and BYOK work."
          ctas={[
            { href: '/login?redirectTo=%2Fchat', label: 'Try AGI Web' },
            { href: '/download', label: 'Get notified' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
