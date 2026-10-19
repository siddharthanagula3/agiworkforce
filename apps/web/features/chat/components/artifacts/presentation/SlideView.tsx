'use client';

import { memo, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChartArtifact, MermaidDiagram } from '@agiworkforce/unified-chat';
import { cn } from '@shared/lib/utils';
import { slideSegments } from './deck-model';
import { parseShapes, type DeckShape } from './deck-shapes';
import { DECK_FONT_STACKS, readableOn, type DeckTheme } from './deck-themes';
import { SlideShapes } from './SlideShapes';
import styles from './Deck.module.css';

export function deckThemeStyle(theme: DeckTheme): CSSProperties {
  return {
    '--deck-background': theme.background,
    '--deck-surface': theme.surface,
    '--deck-text': theme.text,
    '--deck-muted': theme.muted,
    '--deck-accent': theme.accent,
    '--deck-heading-font': DECK_FONT_STACKS[theme.headingFont],
    '--deck-body-font': DECK_FONT_STACKS[theme.bodyFont],
  } as CSSProperties;
}

function imageHost(src: string): string | null {
  try {
    const url = new URL(src, window.location.origin);
    if (url.origin === window.location.origin) return null;
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.host : null;
  } catch {
    return null;
  }
}

const approvedHosts = new Set<string>();

function SlideImage({ src, alt }: { src?: string; alt?: string }) {
  const [, setApproved] = useState(0);
  if (!src || typeof src !== 'string') return null;
  if (src.startsWith('data:image/') || src.startsWith('blob:')) {
    return <img src={src} alt={alt ?? ''} />;
  }
  const host = typeof window === 'undefined' ? null : imageHost(src);
  if (host && !approvedHosts.has(host)) {
    return (
      <span className={styles['remoteImage']}>
        Image from {host}
        <button
          type="button"
          onClick={() => {
            approvedHosts.add(host);
            setApproved((count) => count + 1);
          }}
        >
          Load image
        </button>
      </span>
    );
  }
  return <img src={src} alt={alt ?? ''} referrerPolicy="no-referrer" />;
}

const SLIDE_COMPONENTS: Components = {
  img: ({ src, alt }) => (
    <SlideImage {...(typeof src === 'string' ? { src } : {})} {...(alt ? { alt } : {})} />
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

const REMARK_PLUGINS = [remarkGfm];

const SlideMarkdown = memo(function SlideMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={SLIDE_COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
});

export function SlideView({
  markdown,
  theme,
  index,
  total,
  title,
  className,
  interactive = true,
  thumbnail = false,
  shapeLayer,
}: {
  markdown: string;
  theme: DeckTheme;
  index: number;
  total: number;
  title?: string;
  className?: string;
  interactive?: boolean;
  thumbnail?: boolean;
  shapeLayer?: (shapes: DeckShape[]) => ReactNode;
}) {
  const segments = useMemo(() => slideSegments(markdown), [markdown]);
  const shapes = useMemo(() => {
    const block = segments.find((segment) => segment.kind === 'shapes');
    return block && block.kind !== 'markdown' ? parseShapes(block.source) : [];
  }, [segments]);

  return (
    <div
      className={cn(styles['slide'], className)}
      style={deckThemeStyle(theme)}
      role="group"
      aria-roledescription="slide"
      aria-label={`Slide ${index + 1} of ${total}`}
      data-slide-index={index}
      data-testid="deck-slide"
    >
      <div className={styles['body']}>
        {segments.map((segment, position) => {
          if (segment.kind === 'markdown') {
            return <SlideMarkdown key={position} text={segment.text} />;
          }
          if (thumbnail && segment.kind !== 'shapes') {
            return (
              <div key={position} className={styles['visualPlaceholder']} aria-hidden="true" />
            );
          }
          if (segment.kind === 'chart') {
            return (
              <div key={position} className={styles['visual']}>
                <ChartArtifact
                  artifact={{
                    id: `slide-${index}-chart-${position}`,
                    type: 'chart',
                    content: segment.source,
                  }}
                  isDark={readableOn(theme.background) === '#ffffff'}
                />
              </div>
            );
          }
          if (segment.kind === 'mermaid') {
            return (
              <div key={position} className={styles['visual']}>
                <MermaidDiagram source={segment.source} interactive={interactive} />
              </div>
            );
          }
          return null;
        })}
      </div>
      {shapeLayer ? shapeLayer(shapes) : <SlideShapes shapes={shapes} theme={theme} />}
      <div className={styles['footer']} aria-hidden="true" hidden={thumbnail}>
        <span>{title}</span>
        <span>
          {index + 1} / {total}
        </span>
      </div>
    </div>
  );
}
