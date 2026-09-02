import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FinalCta } from '@/features/marketing/components/FlagshipSections';

export const metadata = buildMetadata({
  title: 'AGI Memory: the list of facts you can read and edit',
  description:
    'AGI keeps memory as short sentences in a list you can open, search, rewrite, and clear. See what a chat can add, what reaches the model, and where the list is stored.',
  path: '/features/memory',
});

const LIST_ROWS = [
  {
    fact: 'User prefers Python over JavaScript for data work.',
    meta: 'Learned from a chat · 3d ago',
  },
  {
    fact: 'User works as a data engineer.',
    meta: 'Learned from a chat · 1w ago',
  },
  {
    fact: 'The weekly digest goes out as a table with one row per owner.',
    meta: 'Added by you · 6d ago',
  },
  {
    fact: 'Review requests go to the design channel first.',
    meta: 'Only in Q3 Launch · Added by you · 4d ago',
  },
  {
    fact: 'User dislikes meetings before 10am.',
    meta: 'Learned from a chat · 2w ago',
  },
];

const CAPTURE_TRACE = [
  { role: 'You typed', text: 'I prefer Python over JavaScript for data work.', quiet: false },
  { role: 'Saved as', text: 'User prefers Python over JavaScript for data work.', quiet: true },
  { role: 'You typed', text: 'Should I use Python for this?', quiet: false },
  {
    role: 'Saved as',
    text: 'Nothing. A sentence ending in a question mark is skipped.',
    quiet: true,
  },
];

const CONTROLS = [
  {
    name: 'Add',
    body: 'A box above the list takes up to 280 characters. Press Add and the fact appears in the list straight away.',
  },
  {
    name: 'Edit',
    body: 'Click a fact to rewrite it in place. Saving an empty box deletes that fact instead.',
  },
  {
    name: 'Delete',
    body: 'Every row carries its own delete control, and the row goes the moment you use it.',
  },
  {
    name: 'Search',
    body: 'Once the list holds anything, a search box appears above it and filters the rows by the text they contain.',
  },
  {
    name: 'Forget everything',
    body: 'One control empties the list, behind a confirmation that names how many facts are about to go.',
  },
  {
    name: 'Exclusions',
    body: 'Terms you never want captured, plus the sources you never want recalled from: automatic capture, the web app, Desktop, or mobile.',
  },
];

const ORIGINS = [
  {
    n: '01',
    title: 'You write it',
    body: 'Type the fact into the box above the list. It is stored exactly as you wrote it, under your own name for it.',
  },
  {
    n: '02',
    title: 'A finished chat produces it',
    body: 'With Memory and Generate from past chats both on, the turn is scanned for first-person statements — “I prefer…”, “my name is…”, “remember that…” — and each match is rewritten in the third person before it is offered to the list.',
  },
  {
    n: '03',
    title: 'You import it',
    body: 'On mobile, a ChatGPT, Claude, or Gemini export file is parsed on the device, and the remembered facts inside it join the list as ordinary rows.',
  },
];

const BOUNDS = [
  {
    k: 'Stored',
    v: 'On the device that created it, and synced to your account across the devices you sign into.',
  },
  {
    k: 'Recalled',
    v: 'Up to 30 facts on AGI managed cloud and 50 on mobile, capped at 8,000 characters either way.',
  },
  { k: 'Per turn', v: 'A single chat turn can add at most five new facts.' },
  { k: 'Temporary chats', v: 'A temporary chat never writes to the list.' },
  {
    k: 'Projects',
    v: 'A fact can be confined to one project, and a confined fact never appears outside it.',
  },
];

export default function MemoryFeaturePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-memory-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Features · Memory</p>
          <h1 id="agi-memory-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">
              Read <em className="agi-fl-h1-em">every fact</em> AGI keeps about you.
            </span>
          </h1>
          <p className="agi-fl-lede">
            Memory is a list of short sentences that lives in Settings. What the assistant remembers
            about you is written there in plain language, and you can search it, rewrite any line,
            or clear the whole list.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/settings/memory" className="agi-fl-cta agi-fl-cta--primary">
              Open your memory list
            </Link>
          </div>

          <div className="agi-fl-hero-console">
            <div className="agi-chat agi-fl-hero-frame--main">
              <div className="agi-chat-header">
                <span className="agi-chat-model">Settings → Memory</span>
                <span className="agi-chat-meta">Saved on this device.</span>
              </div>
              <div className="agi-chat-body">
                {LIST_ROWS.map((row) => (
                  <div key={row.fact} className="agi-msg">
                    <p className="agi-msg-text">{row.fact}</p>
                    <p className="agi-msg-role">{row.meta}</p>
                  </div>
                ))}
                <div className="agi-chip-row">
                  <span className="agi-chip">Add a new fact</span>
                  <span className="agi-chip">Search memory</span>
                  <span className="agi-chip">Forget everything</span>
                </div>
              </div>
            </div>

            <div className="agi-chat agi-fl-hero-frame--terminal">
              <div className="agi-chat-header">
                <span className="agi-chat-model">Capture</span>
                <span className="agi-chat-meta">five per turn, at most</span>
              </div>
              <div className="agi-chat-body">
                {CAPTURE_TRACE.map((line) => (
                  <div
                    key={`${line.role}-${line.text}`}
                    className={line.quiet ? 'agi-msg agi-msg-quiet' : 'agi-msg'}
                  >
                    <p className="agi-msg-role">{line.role}</p>
                    <p className="agi-msg-text">{line.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-memory-controls">
          <p className="agi-fl-eyebrow">The pane</p>
          <h2 id="agi-memory-controls" className="agi-fl-h2">
            What the memory pane lets you change
          </h2>
          <p className="agi-fl-section-lede">
            The pane is the whole feature. A box to add a fact sits above the list, every stored
            fact gets its own row, and each control below acts on that list directly.
          </p>
          <table className="agi-ledger">
            <tbody>
              {CONTROLS.map((control) => (
                <tr key={control.name}>
                  <td>{control.name}</td>
                  <td>{control.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-memory-origins">
          <p className="agi-fl-eyebrow">Origins</p>
          <h2 id="agi-memory-origins" className="agi-fl-h2">
            Where a fact comes from
          </h2>
          <p className="agi-fl-section-lede">
            Nothing lands on the list by accident, and a captured fact still arrives as an ordinary
            row you can rewrite or throw away.
          </p>
          <ol className="agi-steps">
            {ORIGINS.map((origin) => (
              <li key={origin.n} className="agi-step">
                <span className="agi-step-n">{origin.n}</span>
                <h3 className="agi-step-h">{origin.title}</h3>
                <p className="agi-step-body">{origin.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-memory-recall">
          <p className="agi-fl-eyebrow">Recall</p>
          <h2 id="agi-memory-recall" className="agi-fl-h2">
            What the model actually receives
          </h2>
          <p className="agi-fl-section-lede">
            Only part of the list travels with a request, and it travels as data the model may read
            but never obey.
          </p>

          <div className="agi-callout">
            <h3 className="agi-callout-h">Memory arrives fenced</h3>
            <p className="agi-callout-p">
              Recalled facts are wrapped in a block marked as untrusted, under a standing rule that{' '}
              <span className="agi-callout-amber">
                instructions found inside a memory are never followed
              </span>
              . A fact is a preference, and where one disagrees with the request in front of it, the
              request wins.
            </p>
          </div>

          <dl className="agi-colophon">
            {BOUNDS.map((bound) => (
              <div key={bound.k} className="agi-colophon-row">
                <dt className="agi-colophon-key">{bound.k}</dt>
                <dd className="agi-colophon-val">{bound.v}</dd>
              </div>
            ))}
          </dl>

          <div className="agi-fl-cta-row agi-fl-cta-row--sm">
            <Link href="/features/projects" className="agi-fl-cta agi-fl-cta--ghost">
              How project scoping works
            </Link>
          </div>
        </section>

        <FinalCta
          eyebrow="Start now"
          title="Open the list and read it."
          body="The memory pane sits in Settings, next to the exclusions that govern what may be written to it. Everything on the list is a sentence you can rewrite or remove."
          ctas={[{ href: '/download', label: 'See where AGI runs' }]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
