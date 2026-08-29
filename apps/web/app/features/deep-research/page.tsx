import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FinalCta } from '@/features/marketing/components/FlagshipSections';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2F';

export const metadata = buildMetadata({
  title: 'AGI Deep Research | Cited Answers Across Web, Files & Tools',
  description:
    'Research in AGI is designed around citations: live web search with source cards, numbered inline citations, and a sources panel. In the same workspace as your projects, artifacts, and memory.',
  path: '/features/deep-research',
});

const GATHERED_SOURCES = [
  { n: 1, host: 'w3.org', title: 'Web Content Accessibility Guidelines (WCAG) 2.1' },
  { n: 2, host: 'w3.org', title: 'Understanding Success Criterion 1.4.3: Contrast (Minimum)' },
  { n: 3, host: 'webaim.org', title: 'Contrast and Color Accessibility' },
  { n: 4, host: 'w3.org', title: 'Success Criterion 1.4.6: Contrast (Enhanced)' },
];

const RUN_BOUNDS = [
  {
    value: '6',
    label: 'model turns in a run',
    note: 'The planning turn, the gathering rounds, and the turn that writes the report all come out of the same allowance.',
  },
  {
    value: '12',
    label: 'web searches in a run',
    note: 'Gathering stops at the cap. The report is then written from whatever the run had already collected.',
  },
  {
    value: '4 min',
    label: 'gathering budget',
    note: 'Whatever ends the gathering phase, the report still gets written, and it has to say so when coverage came up short.',
  },
];

export default function DeepResearchPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-fl-research-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Features · Deep Research</p>
          <h1 id="agi-fl-research-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">
              Every claim <em className="agi-fl-h1-em">names the source</em> it came from.
            </span>
          </h1>
          <p className="agi-fl-lede">
            Search-capable models reach the live web on their own, and the composer states whether
            search is on for the model you picked. Deep Research goes further: the run writes out
            the searches it intends to make, then stops and waits for you to approve them. What
            comes back is a report with a bracketed number behind every factual claim, the matching
            sources listed beside it, and a stored copy you can reopen long after the chat has
            scrolled away.
          </p>
          <div className="agi-fl-cta-row">
            <Link href={WEB_CHAT_ENTRY_HREF} className="agi-fl-cta agi-fl-cta--primary">
              Start a research run
            </Link>
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label="Research highlights">
            <li>Search · live web</li>
            <li>Citations · numbered [n]</li>
            <li>Plan · yours to approve</li>
          </ul>

          <div className="agi-fl-hero-console">
            <div className="agi-chat agi-fl-hero-frame--main">
              <div className="agi-chat-header">
                <span className="agi-chat-model">Deep Research · Auto</span>
                <span className="agi-chat-meta">Research complete</span>
              </div>
              <div className="agi-chat-body">
                <div className="agi-msg">
                  <p className="agi-msg-role">you</p>
                  <p className="agi-msg-text">
                    What contrast ratio does WCAG require for body text, and what counts as large
                    text?
                  </p>
                </div>
                <div className="agi-msg agi-msg-quiet">
                  <p className="agi-msg-role">plan · approved by you</p>
                  <p className="agi-msg-text">
                    wcag 2.1 minimum contrast ratio · wcag large scale text definition · wcag 1.4.6
                    enhanced contrast
                  </p>
                </div>
                <div className="agi-msg">
                  <p className="agi-msg-role">report</p>
                  <p className="agi-msg-text">
                    WCAG 2.1 sets the minimum contrast ratio for body text at 4.5:1 and allows 3:1
                    for text that counts as large <code>[1]</code> — 18pt, or 14pt bold{' '}
                    <code>[2]</code>. Logotypes and incidental text sit outside the criterion{' '}
                    <code>[1]</code>. Level AAA raises the same two thresholds to 7:1 and 4.5:1{' '}
                    <code>[4]</code>, and the WebAIM walkthrough covers measuring a pair of colors
                    against them <code>[3]</code>.
                  </p>
                </div>
              </div>
            </div>

            <div className="agi-chat agi-fl-hero-frame--terminal">
              <div className="agi-chat-header">
                <span className="agi-chat-model">Sources</span>
                <span className="agi-chat-meta">4 gathered, 4 cited</span>
              </div>
              <div className="agi-chat-body">
                {GATHERED_SOURCES.map((source) => (
                  <div key={source.n} className="agi-msg">
                    <p className="agi-msg-role">
                      [{source.n}] {source.host}
                    </p>
                    <p className="agi-msg-text">{source.title}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-fl-research-run-title">
          <p className="agi-fl-eyebrow">Inside a run</p>
          <h2 id="agi-fl-research-run-title" className="agi-fl-h2">
            A run shows its plan first.
          </h2>
          <p className="agi-fl-section-lede">
            Deep Research is a bounded loop that runs on the server: it plans, waits, gathers,
            writes, and stores what it wrote. Each stage names itself in the chat while it is
            happening.
          </p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Plan</td>
                <td>
                  The opening turn lists the searches it intends to run, three to six of them, and
                  runs none of them yet.
                </td>
              </tr>
              <tr>
                <td>Approve</td>
                <td>
                  The run pauses there. Searching spends your budget, so nothing is searched until
                  you accept the plan, and the queries you accepted are the ones the next turn runs.
                </td>
              </tr>
              <tr>
                <td>Gather</td>
                <td>
                  Each round runs those searches and can open up to three of the pages it finds to
                  read them in full. The source list is built from what the searches actually
                  returned.
                </td>
              </tr>
              <tr>
                <td>Cite</td>
                <td>
                  The last turn writes the report against a numbered list of everything gathered,
                  under instruction to put a bracketed number behind every factual claim and to keep
                  raw URLs out of the prose.
                </td>
              </tr>
              <tr>
                <td>Keep</td>
                <td>
                  The finished report is stored against your account and listed newest first. Export
                  it as Markdown, PDF, or Word, ask a follow-up that is grounded in it, or hand it
                  to the <Link href="/features/artifacts">artifacts panel</Link> as an editable
                  document.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-fl-research-bounds-title">
          <p className="agi-fl-eyebrow">What a run may spend</p>
          <h2 id="agi-fl-research-bounds-title" className="agi-fl-h2">
            Every run is capped before it starts.
          </h2>
          <p className="agi-fl-section-lede">
            These are the defaults a single run is held to. Across the whole run at most eight pages
            are opened and read in full, three of them in any one round. A run reaches the live web,
            so it is never an on-device thread; the <Link href="/privacy">privacy page</Link> sets
            out where each route sends your data.
          </p>
          <div className="agi-console-stats">
            {RUN_BOUNDS.map((bound) => (
              <div key={bound.label} className="agi-console-stat">
                <span className="agi-console-stat-value">{bound.value}</span>
                <span className="agi-console-stat-label">{bound.label}</span>
                <span className="agi-console-stat-note">{bound.note}</span>
              </div>
            ))}
          </div>
        </section>

        <FinalCta
          eyebrow="Before you turn it on"
          title="Deep Research is a paid feature."
          body="The toggle stays off on the website free trial, and it needs a model that supports research or the Auto router. The plan page lists what each tier includes."
          ctas={[{ href: '/pricing', label: 'See which plans include it' }]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
