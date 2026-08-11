import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { CapabilityGrid, FinalCta } from '@/features/marketing/components/FlagshipSections';
import { Reveal } from '@/features/marketing/components/Reveal';

export const metadata = buildMetadata({
  title: 'AGI Memory | Plain-Language Facts You Control',
  description:
    'AGI Memory is a readable list of facts you can view, add to, edit, and delete. Device-local by default. Hosted sync available with AGI managed cloud (public alpha).',
  path: '/features/memory',
});

const CONTROLS = [
  {
    meta: 'See',
    title: 'Every memory is a sentence.',
    body: 'Memory is stored as short, readable facts rather than an opaque profile.',
    points: [
      'Open the full list any time in Settings → Memory',
      // Scoped to Mobile deliberately. Only the Mobile store writes
      // `source_conversation_id` (features/memory/services/consolidation.ts) and
      // only the Mobile summary screen groups facts by it. Web and Desktop
      // memories record a coarse origin ('auto' vs manual) and no conversation
      // at all, so the unqualified sentence promised provenance that neither
      // surface can show.
      'On Mobile, a fact records the conversation it was learned from',
      'Facts stay short and readable by design',
    ],
  },
  {
    meta: 'Shape',
    title: 'Edit it like a list. Because it is one.',
    body: 'Add the facts you want remembered, fix the ones that drift, and delete what no longer belongs.',
    points: [
      'Add a fact yourself in seconds',
      'Edit or delete any single fact',
      '“Forget everything” clears the list in one step',
    ],
  },
  {
    meta: 'Keep',
    title: 'On your device by default.',
    body: 'In the current release, memory lives on the device that created it.',
    points: [
      'Facts persist locally on each device',
      'Hosted memory sync belongs to AGI managed cloud (public alpha)',
      "Incognito conversations aren't saved to disk",
    ],
  },
];

export default function MemoryFeaturePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Features · Memory</p>
          <h1 className="agi-page-h1">Memory you can read.</h1>
          <p className="agi-page-lede">
            AGI keeps memory as a list of plain-language facts. Open it, add to it, edit it, or
            clear it entirely. Personal context stays something you hold, not something that happens
            to you.
          </p>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-memory-controls">
          <p className="agi-fl-eyebrow">Controls</p>
          <h2 id="agi-memory-controls" className="agi-fl-h2">
            A list, not a black box.
          </h2>
          <p className="agi-fl-section-lede">
            Every remembered fact is a short sentence you can see and change. The controls are the
            feature.
          </p>
          <div className="agi-fl-trust-grid">
            {CONTROLS.map((card, i) => (
              <Reveal key={card.meta} delay={i * 80} className="agi-fl-trust-card">
                <p className="agi-fl-trust-mode">{card.meta}</p>
                <h3 className="agi-fl-trust-title">{card.title}</h3>
                <p className="agi-fl-trust-body">{card.body}</p>
                <ul className="agi-fl-trust-points">
                  {card.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-memory-learning">
          <p className="agi-fl-eyebrow">Day by day</p>
          <h2 id="agi-memory-learning" className="agi-fl-h2">
            Designed to learn carefully.
          </h2>
          <p className="agi-fl-section-lede">
            Memory grows from what you actually say. Conservatively, visibly, and always under your
            hand.
          </p>
          <div className="agi-fl-trust-grid">
            <Reveal className="agi-fl-trust-card">
              <p className="agi-fl-trust-mode">Learn</p>
              <h3 className="agi-fl-trust-title">It learns from your own words.</h3>
              <p className="agi-fl-trust-body">
                On Mobile, AGI can turn first-person statements like “I prefer...” or “my name
                is...” into durable facts after a chat, tuned for precision over recall.
              </p>
              <ul className="agi-fl-trust-points">
                <li>Only clear self-disclosure becomes a candidate fact</li>
                <li>New facts land in the memory list, ready to edit or delete</li>
              </ul>
            </Reveal>
            <Reveal delay={80} className="agi-fl-trust-card">
              <p className="agi-fl-trust-mode">Import</p>
              <h3 className="agi-fl-trust-title">Bring your context with you.</h3>
              <p className="agi-fl-trust-body">
                On Mobile, import remembered context from a ChatGPT, Claude, or Gemini export file.
                Parsing happens entirely on your device.
              </p>
              <ul className="agi-fl-trust-points">
                <li>Works from the export files you already own</li>
                <li>Nothing in the file leaves the device</li>
              </ul>
            </Reveal>
            <Reveal delay={160} className="agi-fl-trust-card">
              <p className="agi-fl-trust-mode">Scope</p>
              <h3 className="agi-fl-trust-title">Standing context, where it belongs.</h3>
              <p className="agi-fl-trust-body">
                Project instructions carry per-project context separately, so one project can sound
                like itself without rewriting your personal memory.
              </p>
              <Link href="/features/projects" className="agi-fl-cta agi-fl-cta--ghost">
                Explore Projects
              </Link>
            </Reveal>
          </div>
        </section>

        <CapabilityGrid
          eyebrow="Keep exploring"
          title="Where memory does its work."
          items={[
            {
              meta: 'Projects',
              title: 'Projects',
              body: 'Group chats, files, and instructions under one objective.',
              href: '/features/projects',
            },
            {
              meta: 'Agents',
              title: 'Agents',
              body: 'Delegated, tool-using work with explicit permissions and approvals.',
              href: '/features/agents',
            },
            {
              meta: 'Research',
              title: 'Deep Research',
              body: 'Cited reports across the web, your files, and connected tools.',
              href: '/features/deep-research',
            },
          ]}
        />

        <FinalCta
          eyebrow="Start now"
          title="Make it personal. Keep it yours."
          body="Try AGI Web in the browser. Get notified when the apps open for Local and BYOK work. Memory stays in your hands either way."
          ctas={[
            { href: '/login?redirectTo=%2F', label: 'Try AGI Web' },
            { href: '/download', label: 'Get notified' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
