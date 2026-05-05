import type { Metadata } from 'next';

import { EditorialPage } from '../../components/marketing/editorial/EditorialPage';
import { RuledSection } from '../../components/marketing/editorial/RuledSection';
import { Slug } from '../../components/marketing/editorial/Slug';
import { Specimen } from '../../components/marketing/editorial/Specimen';
import { OpsizMorph } from '../../components/marketing/editorial/OpsizMorph';
import { DispatchSection } from '../../components/marketing/editorial/DispatchSection';

export const metadata: Metadata = {
  title: 'Archive | AGI Workforce',
  description:
    'A dated archive of what shipped. CLI v1.0 live. Desktop v1.2.0 in progress. Honest about what has not.',
  alternates: { canonical: '/changelog' },
  openGraph: {
    title: 'Archive | AGI Workforce',
    description: 'A dated archive of what shipped. Honest about what has not.',
    type: 'website',
    url: 'https://agiworkforce.com/changelog',
  },
};

interface Dispatch {
  vol: string;
  no: string;
  date: string;
  headline: string;
  headlineEmphasis: string;
  body: string[];
}

const dispatches: Dispatch[] = [
  {
    vol: 'I',
    no: '03',
    date: '2026-05-05',
    headline: 'Operator-broadsheet',
    headlineEmphasis: 'redesigned.',
    body: [
      'Marketing surface across 54 routes redesigned in the operator-broadsheet style. Newsreader serif throughout, JetBrains Mono for chrome, paper/graphite tier switching, ruled sections, dot-leader index lists, mono CTAs.',
      'Tier A pages bespoke; Tier B pages inherit shared editorial primitives; Tier C utility pages absorb only the token cascade.',
    ],
  },
  {
    vol: 'I',
    no: '02',
    date: '2026-05-04',
    headline: 'OpenClaw porting',
    headlineEmphasis: 'complete.',
    body: [
      'Sprints 1 through 11 of the OpenClaw integration shipped. Provider adapter interface stable. Anthropic, OpenAI, Ollama, Google adapters live. MCP transport and skills loader landed. Hook events parity in Rust CLI. Live cross-provider demo runs through the API gateway.',
    ],
  },
  {
    vol: 'I',
    no: '01',
    date: '2026-05-03',
    headline: 'CLI v1.0.0',
    headlineEmphasis: 'live.',
    body: [
      '195 .rs files · 155,029 LOC · 2,161 tests · 22 subcommands · 22 hook events · 5.7 MB arm64 binary · ~/.cargo/bin/agiworkforce. Five-platform GitHub Release. Homebrew tap auto-generated. install.sh tested.',
      'Cleanup pass: -1.04 M LOC net (102 codex-rs port crates removed). Audit closed P0 13/14, P1 20/25.',
    ],
  },
  {
    vol: 'I',
    no: '00',
    date: '2026-02 to 2026-05',
    headline: 'Desktop v1.0 to v1.2.0',
    headlineEmphasis: 'shipped.',
    body: [
      'Tauri v2 + React. macOS DMG signed (Apple Developer ID D2PR62RLT4). Linux AppImage. Windows EV cert pending. v1.2.0 Linux live; macOS notarization currently blocked on a missing Apple secret in CI.',
    ],
  },
];

const forthcoming = [
  {
    item: 'Mobile',
    detail: 'App Store + Play Store listings.',
    quarter: 'Q3 2026',
  },
  {
    item: 'Chrome extension',
    detail: 'CWS submission once visual review clears.',
    quarter: 'Q3 2026',
  },
  {
    item: 'VS Code extension',
    detail: 'Marketplace listing once private beta clears.',
    quarter: 'Q3 2026',
  },
  {
    item: 'Pro tier',
    detail: 'Opens after security audit closes (currently P0 13/14, P1 20/25).',
    quarter: 'TBD',
  },
  {
    item: 'Max tier',
    detail: 'Opens after Pro stabilizes.',
    quarter: 'TBD',
  },
];

export default function ChangelogPage() {
  return (
    <EditorialPage tier="mixed">
      {/* S1 — Masthead */}
      <RuledSection tier="paper" id="changelog-hero">
        <div className="py-16 md:py-24 max-w-3xl">
          <h1 className="font-display font-light leading-[0.95] tracking-tight">
            <span
              className="block text-[clamp(3rem,8vw,5rem)]"
              style={{ fontVariationSettings: '"wght" 300, "opsz" 72' }}
            >
              Vol. I.
            </span>
            <span
              className="block italic text-[clamp(2.5rem,7vw,4.5rem)] border-b-[3px] border-[var(--color-rule)] pb-1 mt-1"
              style={{ fontVariationSettings: '"wght" 800, "opsz" 72' }}
            >
              The archive.
            </span>
          </h1>

          <div className="mt-10">
            <Specimen dropCap columns={2}>
              <p>
                Every shipped feature is dated. Every &ldquo;in progress&rdquo; item is named
                openly. We do not backdate, we do not pre-announce, and we do not list things we are
                not actively maintaining.
              </p>
              <p>
                What follows is a dispatch-style log of every issue, in reverse chronological order.
              </p>
            </Specimen>
          </div>
        </div>
      </RuledSection>

      {/* S2 — Vol/No archive */}
      <RuledSection tier="paper" slug={<Slug index="01" kicker="ISSUES" />}>
        <div className="py-14 md:py-20">
          <OpsizMorph as="h2" className="text-3xl md:text-4xl mb-12">
            Issues, in reverse order.
          </OpsizMorph>

          <div className="space-y-0">
            {dispatches.map((d) => (
              <article key={d.no} className="border-t border-[var(--color-rule)] pt-8 pb-10">
                {/* Mono strip */}
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-quiet)] mb-4">
                  VOL. {d.vol} &middot; NO. {d.no} &middot; {d.date}
                </div>

                {/* Headline */}
                <h3
                  className="font-display text-2xl md:text-3xl mb-5 leading-tight"
                  style={{ fontVariationSettings: '"wght" 700' }}
                >
                  {d.headline} <em className="italic">{d.headlineEmphasis}</em>
                </h3>

                {/* Body */}
                <Specimen columns={2}>
                  {d.body.map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </Specimen>
              </article>
            ))}
          </div>
        </div>
      </RuledSection>

      {/* S3 — Forthcoming */}
      <RuledSection tier="paper" slug={<Slug index="02" kicker="FORTHCOMING" />}>
        <div className="py-14 md:py-20">
          <h2
            className="font-display text-2xl md:text-3xl mb-10"
            style={{ fontVariationSettings: '"wght" 600' }}
          >
            What&rsquo;s in the next edition.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0">
            {forthcoming.map((item) => (
              <div key={item.item} className="border border-[var(--color-rule-soft)] p-6">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-amber-text)] mb-2">
                  {item.quarter}
                </div>
                <div
                  className="font-display text-lg mb-2"
                  style={{ fontVariationSettings: '"wght" 600' }}
                >
                  {item.item}
                </div>
                <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </RuledSection>

      {/* S4 — Dispatch */}
      <DispatchSection slugIndex="03" slugKicker="DISPATCH" />
    </EditorialPage>
  );
}
