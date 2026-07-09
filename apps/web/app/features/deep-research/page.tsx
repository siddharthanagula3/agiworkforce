import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import { ProductFrame } from '../../../components/marketing/ProductFrame';
import { FeatureGrid } from '../../../components/marketing/LandingSections';
import { FinalCta } from '../../../components/marketing/FlagshipSections';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2Fchat';

export const metadata: Metadata = {
  title: 'AGI Deep Research | Cited Answers Across Web, Files & Tools',
  description:
    'Research in AGI is designed around citations: live web search with source cards, numbered inline citations, and a sources panel. In the same workspace as your projects, artifacts, and memory.',
  alternates: { canonical: 'https://agiworkforce.com/features/deep-research' },
};

const RESEARCH_FEATURES = [
  {
    meta: 'Search',
    title: 'Live web search',
    body: 'Turn search on when the answer needs current information. Results arrive as source cards with titles, snippets, and links, right in the chat where you asked.',
  },
  {
    meta: 'Citations',
    title: 'Numbered, inline, checkable',
    body: 'Citations sit inside the answer as numbered markers. Hover for a preview of the source, click to open it. The claim and its evidence stay together.',
  },
  {
    meta: 'Sources',
    title: 'A panel for the evidence',
    body: 'The research panel collects the sources behind the latest answer in a sidebar. Scan them, open them, and judge them without leaving the conversation.',
  },
  {
    meta: 'Routing',
    title: 'Research-aware Auto routing',
    body: 'Auto routing recognizes research-shaped prompts and sends them to search-capable models. The provider label stays visible before the request leaves your machine.',
  },
  {
    meta: 'Artifacts',
    title: 'Reports that stay editable',
    body: 'Long-form output can live beside the chat as an artifact with previews and versions. A draft you keep working, not a reply you scroll past.',
    href: '/features/artifacts',
  },
  {
    meta: 'Projects',
    title: 'A home for each question',
    body: 'Projects group the chats, files, instructions, and sources behind a line of research, so follow-ups start with the context already in place.',
    href: '/features/projects',
  },
];

export default function DeepResearchPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-fl-research-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Deep Research</p>
          <h1 id="agi-fl-research-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Answers that</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">show their sources.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Research in AGI is designed around one rule: claims come with citations. Turn on search
            and results arrive as source cards, numbered citations sit inside the answer, and a
            sources panel keeps the evidence one click away, in the same workspace as your projects,
            artifacts, and memory.
          </p>
          <div className="agi-fl-cta-row">
            <Link href={WEB_CHAT_ENTRY_HREF} className="agi-fl-cta agi-fl-cta--primary">
              Try AGI Web
            </Link>
            <Link href="/features/artifacts" className="agi-fl-cta agi-fl-cta--secondary">
              Explore Artifacts
            </Link>
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label="Research highlights">
            <li>Search · live web</li>
            <li>Citations · inline &amp; linked</li>
            <li>Sources · one panel away</li>
          </ul>

          <div className="agi-fl-hero-console">
            <ProductFrame
              variant="web"
              title="agiworkforce.com/chat"
              badge="Sources"
              className="agi-fl-hero-frame agi-fl-hero-frame--main"
            />
          </div>
        </section>

        <FeatureGrid
          eyebrow="The research loop"
          title="From question to checked answer, in one workspace."
          items={RESEARCH_FEATURES}
        />

        <section className="agi-fl-section" aria-labelledby="agi-fl-research-boundaries-title">
          <p className="agi-fl-eyebrow">Honest boundaries</p>
          <h2 id="agi-fl-research-boundaries-title" className="agi-fl-h2">
            Research you can audit.
          </h2>
          <p className="agi-fl-section-lede">
            Cited answers only matter if you can check them, and if you control what the research
            touches. Both hold here.
          </p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Sources</td>
                <td>Every cited source is a real link you can open and judge yourself.</td>
              </tr>
              <tr>
                <td>Your files</td>
                <td>
                  Project files and connected tools join research only where you've enabled them.
                </td>
              </tr>
              <tr>
                <td>Local</td>
                <td>
                  Local chats stay on your device; live web search and connectors run only on routes
                  you can see.
                </td>
              </tr>
              <tr>
                <td>Cloud</td>
                <td>
                  Managed compute is public alpha, open by default. Nothing routes to AGI Cloud
                  without a visible label.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <FinalCta
          eyebrow="Start now"
          title="Ask something worth citing."
          body="Try AGI Web in the browser today. Get notified when Desktop and CLI open for Local and BYOK work."
          ctas={[
            { href: WEB_CHAT_ENTRY_HREF, label: 'Try AGI Web' },
            { href: '/download', label: 'Get notified' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
