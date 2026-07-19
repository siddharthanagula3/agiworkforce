/**
 * Dynamic Open Graph / social share card (1200x630) rendered with next/og.
 *
 * Replaces the old `public/app-preview.png` desktop screenshot that link
 * unfurlers (Slack/X/iMessage/LinkedIn) showed. Branded, professional, and
 * always in sync with the product name/tagline — no stale static screenshot.
 * `lib/seo/site.ts` OG_IMAGE points here, so every page's og:image + twitter
 * card uses it.
 */
import { ImageResponse } from 'next/og';

// Route handlers run on the Node runtime by default (Fluid Compute); ImageResponse
// is supported there — no edge runtime needed. The card is constant, so Next caches it.

const AMBER = '#C8892A';

/** The 12-ray AGI brand mark from app/icon.svg, drawn at an arbitrary size. */
const MARK_LINES: ReadonlyArray<[number, number, number, number]> = [
  [12, 7.4, 12, 3],
  [14.3, 8.02, 16.5, 4.21],
  [15.98, 9.7, 19.79, 7.5],
  [16.6, 12, 21, 12],
  [15.98, 14.3, 19.79, 16.5],
  [14.3, 15.98, 16.5, 19.79],
  [12, 16.6, 12, 21],
  [9.7, 15.98, 7.5, 19.79],
  [8.02, 14.3, 4.21, 16.5],
  [7.4, 12, 3, 12],
  [8.02, 9.7, 4.21, 7.5],
  [9.7, 8.02, 7.5, 4.21],
];

export function GET(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        backgroundColor: '#0A0A0F',
        backgroundImage:
          'radial-gradient(circle at 18% 12%, rgba(200,137,42,0.20), transparent 42%)',
        padding: '84px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        <svg width={104} height={104} viewBox="0 0 24 24">
          <g stroke={AMBER} strokeWidth={1.8} strokeLinecap="round">
            {MARK_LINES.map((l, i) => (
              <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} />
            ))}
          </g>
        </svg>
        <div style={{ fontSize: 116, fontWeight: 800, color: '#FFFFFF', letterSpacing: -4 }}>
          AGI
        </div>
      </div>

      <div
        style={{
          marginTop: 40,
          fontSize: 54,
          fontWeight: 600,
          color: '#F4F4F5',
          lineHeight: 1.15,
          maxWidth: 940,
        }}
      >
        One AI workspace across models and tools.
      </div>

      <div style={{ marginTop: 26, fontSize: 30, color: '#9BA1A6', maxWidth: 980 }}>
        Chat, code, research, files, artifacts, connectors, and automation.
      </div>

      <div style={{ marginTop: 48, fontSize: 27, fontWeight: 600, color: AMBER }}>
        agiworkforce.com
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
