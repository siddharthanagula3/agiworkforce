import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';
import './options-index.css';

const MARK_SIZE = 30;

interface StyleFrame {
  number: string;
  name: string;
  href: string;
  picture: string;
  motion: string;
  swatches: readonly string[];
}

const FRAMES: readonly StyleFrame[] = [
  {
    number: '3',
    name: 'Daybreak',
    href: '/dev/frame-3',
    picture:
      'The mark is a sun rising over a city of six towers, one per surface. Web is lit; cranes stand over the others.',
    motion:
      'Night turns to day, the Web tower lights up floor by floor, the cranes swing and settle.',
    swatches: ['var(--agi-illo-sky)', 'var(--agi-illo-peach)', 'var(--agi-accent)'],
  },
  {
    number: '1',
    name: 'Crew',
    href: '/dev/frame-1',
    picture:
      'The four sign-in characters at work, handing a contract along and stamping the answer with the mark.',
    motion:
      'The paper is passed from one to the next, the receipt prints, the stamp lands. Their eyes follow your pointer.',
    swatches: ['var(--agi-illo-violet)', 'var(--agi-illo-orange)', 'var(--agi-illo-yellow)'],
  },
  {
    number: '4',
    name: 'Dial',
    href: '/dev/frame-4',
    picture:
      'One big selector dial built from the mark on full orange, with the model providers around its rim.',
    motion:
      'The needle sweeps to Auto and the reply card prints. Turn the dial to another provider and it prints again.',
    swatches: ['var(--agi-illo-orange)', 'var(--agi-illo-ink)', 'var(--agi-illo-cream)'],
  },
  {
    number: '2',
    name: 'Metro',
    href: '/dev/frame-2',
    picture:
      'A night transit map: three coloured lines from your question to a ticket, with the surfaces as stations.',
    motion: 'The lines draw, a train runs the line you choose, and the ticket prints the receipt.',
    swatches: [
      'var(--agi-lane-local-text)',
      'var(--agi-lane-byok-text)',
      'var(--agi-lane-cloud-text)',
    ],
  },
  {
    number: '5',
    name: 'Cuts',
    href: '/dev/frame-5',
    picture: 'A six-second title sequence in four colour fields: ask, route, answer, receipt.',
    motion:
      'Hard cuts between the four fields, then they fly into a poster beside the claim. Pause and replay.',
    swatches: ['var(--agi-illo-cream)', 'var(--agi-illo-lilac)', 'var(--agi-illo-orange)'],
  },
  {
    number: '6',
    name: 'Blocks',
    href: '/dev/frame-6',
    picture:
      'A poster of flat colour blocks of equal weight: the claim, the mark, the routes, the receipt, the surfaces.',
    motion:
      'The blocks print onto the page one after another. Choose a route and the receipt re-prints.',
    swatches: ['var(--agi-illo-yellow)', 'var(--agi-illo-mint)', 'var(--agi-illo-violet)'],
  },
];

const EARLIER = [
  { href: '/dev/landing-1', name: 'Console' },
  { href: '/dev/landing-2', name: 'Boundary' },
  { href: '/dev/landing-3', name: 'Board' },
  { href: '/', name: 'The present page' },
] as const;

export function OptionsIndex() {
  return (
    <div data-design="agi" className="lo">
      <main id="main-content" tabIndex={-1} className="lo-wrap">
        <header className="lo-top">
          <span className="lo-lockup">
            <AgiMark size={MARK_SIZE} className="lo-mark" />
            AGI
          </span>
          <span className="lo-top-note">Local preview, not published</span>
        </header>

        <section className="lo-intro" aria-labelledby="lo-title">
          <h1 id="lo-title" className="lo-title">
            Six first screens
          </h1>
          <p className="lo-lede">
            Each is one finished, moving first screen in a different visual world. Pick the one you
            like and only that one becomes a full page.
          </p>
        </section>

        <ol className="lo-list" aria-label="Style frames">
          {FRAMES.map((frame) => (
            <li key={frame.number} className="lo-row">
              <div className="lo-swatches" aria-hidden="true">
                {frame.swatches.map((swatch) => (
                  <span key={swatch} className="lo-swatch" style={{ background: swatch }} />
                ))}
              </div>
              <div className="lo-head">
                <span className="lo-letter" aria-hidden="true">
                  {frame.number}
                </span>
                <h2 className="lo-name">
                  <Link href={frame.href} className="lo-open">
                    <span className="lo-sr">Frame {frame.number}: </span>
                    {frame.name}
                  </Link>
                </h2>
              </div>
              <p className="lo-thesis">{frame.picture}</p>
              <p className="lo-motion">{frame.motion}</p>
              <span className="lo-go" aria-hidden="true">
                Open
                <span className="lo-arrow">→</span>
              </span>
            </li>
          ))}
        </ol>

        <section className="lo-earlier" aria-labelledby="lo-earlier-title">
          <h2 id="lo-earlier-title" className="lo-h3">
            Earlier full pages, for comparison
          </h2>
          <ul className="lo-links">
            {EARLIER.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="lo-link">
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
