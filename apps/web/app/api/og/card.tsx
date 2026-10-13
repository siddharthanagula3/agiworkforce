import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { APP_NAV_DESTINATIONS } from '@shared/components/layout/app-nav-items';

export const OG_CARD_SIZE = { width: 1200, height: 630 } as const;

export const OG_HEADLINE = ['ChatGPT, Claude,', 'Gemini & more.'] as const;
export const OG_HEADLINE_CLOSE = 'One app.';
export const OG_ACTION = 'Start free';
export const OG_DOMAIN = 'agiworkforce.com';

export const OG_NAV = APP_NAV_DESTINATIONS.filter(
  (destination) => !destination.adminOnly && !destination.requiresHealthSpace,
).map((destination) => destination.label);

const C = {
  ground: '#000000',
  raised: '#1f1f1f',
  ink: '#fafafa',
  inkSoft: '#a3a3a3',
  amber: '#f0a84a',
  line: 'rgba(255,255,255,0.14)',
} as const;

const FAINT = 0.72;

const COPY_WIDTH = 560;
const WINDOW = { left: COPY_WIDTH + 8, top: 62, width: 600, height: 620 } as const;
const FADE_TOP = 300;
const MARK_SPOKES = 12;
const WORDMARK_TRACKING = 0.08;
const WORDMARK_DROP = 0.236;
const LOCKUP_INSET = 6;

const box = (style: CSSProperties, ...children: ReactNode[]): ReactElement =>
  createElement('div', { style }, ...children);
const row = (style: CSSProperties, ...children: ReactNode[]): ReactElement =>
  box({ display: 'flex', alignItems: 'center', ...style }, ...children);
const column = (style: CSSProperties, ...children: ReactNode[]): ReactElement =>
  box({ display: 'flex', flexDirection: 'column', ...style }, ...children);
const text = (value: string, style: CSSProperties): ReactElement =>
  box({ display: 'flex', ...style }, value);

function mark(size: number): ReactElement {
  const spokes = Array.from({ length: MARK_SPOKES }, (_, index) => {
    const radians = (index * (360 / MARK_SPOKES) * Math.PI) / 180;
    return {
      x1: 12 + 4.6 * Math.sin(radians),
      y1: 12 - 4.6 * Math.cos(radians),
      x2: 12 + 9 * Math.sin(radians),
      y2: 12 - 9 * Math.cos(radians),
    };
  });
  return createElement(
    'svg',
    { width: size, height: size, viewBox: '0 0 24 24' },
    ...spokes.map((spoke, index) =>
      createElement('line', {
        key: index,
        ...spoke,
        stroke: index === 0 ? C.amber : C.ink,
        strokeWidth: 1.5,
        strokeLinecap: 'round',
      }),
    ),
  );
}

function wordmark(size: number): ReactElement {
  return text('AGI', {
    fontFamily: 'Newsreader',
    fontSize: size,
    fontWeight: 700,
    letterSpacing: size * WORDMARK_TRACKING,
    lineHeight: 1,
    marginTop: size * WORDMARK_DROP,
  });
}

function navItem(label: string, active: boolean): ReactElement {
  return row(
    {
      padding: '9px 14px',
      borderRadius: 10,
      backgroundColor: active ? C.raised : 'transparent',
      gap: 12,
    },
    box({
      display: 'flex',
      width: 8,
      height: 8,
      borderRadius: 99,
      backgroundColor: active ? C.ink : C.inkSoft,
      opacity: active ? 1 : FAINT,
    }),
    text(label, {
      fontSize: 19,
      fontWeight: active ? 600 : 500,
      color: active ? C.ink : C.inkSoft,
    }),
  );
}

function bar(width: number): ReactElement {
  return box({ display: 'flex', width, height: 15, borderRadius: 8, backgroundColor: C.raised });
}

function chip(value: string, strong: boolean): ReactElement {
  return text(value, {
    fontSize: 17,
    fontWeight: strong ? 600 : 500,
    color: strong ? C.ink : C.inkSoft,
    border: `1.5px solid ${C.line}`,
    borderRadius: 12,
    padding: '9px 14px',
  });
}

function appWindow(): ReactElement {
  return row(
    {
      width: WINDOW.width,
      height: WINDOW.height,
      borderRadius: 22,
      backgroundColor: C.ground,
      border: `1.5px solid ${C.line}`,
      alignItems: 'stretch',
      overflow: 'hidden',
    },
    column(
      { width: 176, padding: '22px 12px', borderRight: `1.5px solid ${C.line}`, gap: 6 },
      row({ gap: 4, padding: '0 8px 16px' }, mark(22), wordmark(24)),
      ...OG_NAV.map((label, index) => navItem(label, index === 0)),
    ),
    column(
      { flex: 1, padding: '26px 26px', gap: 22 },
      row(
        { justifyContent: 'flex-end' },
        text('Summarise this contract', {
          fontSize: 20,
          fontWeight: 500,
          color: C.ink,
          backgroundColor: C.raised,
          padding: '13px 20px',
          borderRadius: 20,
        }),
      ),
      column(
        { gap: 12 },
        row(
          { gap: 10 },
          mark(22),
          text('Auto chose a reasoning model', {
            fontSize: 17,
            fontWeight: 500,
            color: C.inkSoft,
            opacity: FAINT,
          }),
        ),
        bar(300),
        bar(340),
        bar(210),
      ),
      row({ gap: 12 }, chip('3 risks found', true), chip('Summary.docx', false)),
    ),
  );
}

export function ogCard(): ReactElement {
  const headline: CSSProperties = {
    fontSize: 48,
    fontWeight: 800,
    letterSpacing: -1.9,
    lineHeight: 1.06,
  };
  return box(
    {
      width: '100%',
      height: '100%',
      display: 'flex',
      backgroundColor: C.ground,
      fontFamily: 'Geist',
      color: C.ink,
    },
    column(
      { width: COPY_WIDTH, padding: '56px 0 56px 68px', justifyContent: 'space-between' },
      row({ gap: 8, marginLeft: -LOCKUP_INSET }, mark(64), wordmark(72)),
      column(
        {},
        ...OG_HEADLINE.map((line) => text(line, headline)),
        text(OG_HEADLINE_CLOSE, { ...headline, lineHeight: 1.12, color: C.inkSoft }),
      ),
      row(
        { gap: 20 },
        text(OG_ACTION, {
          fontSize: 28,
          fontWeight: 700,
          color: C.ground,
          backgroundColor: C.ink,
          borderRadius: 999,
          padding: '14px 30px',
        }),
        text(OG_DOMAIN, { fontSize: 24, fontWeight: 500, color: C.inkSoft }),
      ),
    ),
    box({ display: 'flex', position: 'absolute', left: WINDOW.left, top: WINDOW.top }, appWindow()),
    box({
      display: 'flex',
      position: 'absolute',
      left: COPY_WIDTH,
      top: FADE_TOP,
      width: OG_CARD_SIZE.width - COPY_WIDTH,
      height: OG_CARD_SIZE.height - FADE_TOP,
      backgroundImage: `linear-gradient(to bottom, transparent 0%, ${C.ground} 92%)`,
    }),
  );
}
