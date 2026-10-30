import { useId, useState } from 'react';
import { Button, useUiTranslation } from '@agiworkforce/ui';
import { AnswerImage } from './AnswerImage';
import { markdownImageSource } from './markdownImageSources';
import { useRichBlockCopy } from './RichBlockCard';
import type { CarouselSpec, GalleryItem } from './answerSurfaces';

function ResourceActions({ src, caption }: { src: string; caption: string }) {
  const { t } = useUiTranslation('chat');
  const { copy, copyState } = useRichBlockCopy();
  const source = markdownImageSource(src);
  if (!source) return null;
  const navigable = source.kind === 'same-origin' || source.kind === 'cross-origin';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {navigable ? (
        <a
          href={source.src}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="rounded-sm text-[var(--chat-info-text)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
          aria-label={t('answerSurface.openGalleryImage', 'Open image: {{caption}}', { caption })}
        >
          {t('answerSurface.openImage', 'Open image')}
        </a>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-label={t('answerSurface.copyGalleryUrl', 'Copy image URL: {{caption}}', { caption })}
        onClick={() => void copy(source.src)}
      >
        {copyState === 'copied'
          ? t('answerSurface.copied', 'Copied')
          : t('answerSurface.copyUrl', 'Copy URL')}
      </Button>
      {copyState === 'failed' ? (
        <span role="status">{t('answerSurface.copyFailed', 'Copy failed')}</span>
      ) : null}
    </div>
  );
}

export function AnswerGallery({ items, className }: { items: GalleryItem[]; className: string }) {
  const { t } = useUiTranslation('chat');
  return (
    <section
      className={className}
      data-answer-surface="gallery"
      aria-label={t('answerSurface.gallery', 'Gallery')}
    >
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        {items.map((item, index) => (
          <figure
            key={`${index}-${item.src || item.color}`}
            data-gallery-resource={index}
            className="min-w-0"
          >
            {item.color ? (
              <div
                role="img"
                aria-label={item.caption}
                data-gallery-swatch={item.color}
                className="aspect-square w-full rounded-lg border border-[var(--chat-border-subtle)]"
                style={{ backgroundColor: item.color }}
              />
            ) : (
              <AnswerImage
                src={item.src}
                alt={item.caption}
                className="aspect-video w-full rounded-lg object-contain"
              />
            )}
            <figcaption className="mt-2 text-sm text-[var(--chat-text-primary)]">
              {item.caption}
              {item.detail ? (
                <span className="mt-1 block text-[var(--chat-text-secondary)]">{item.detail}</span>
              ) : null}
            </figcaption>
            {item.src ? <ResourceActions src={item.src} caption={item.caption} /> : null}
          </figure>
        ))}
      </div>
    </section>
  );
}

export function AnswerCarousel({ spec, className }: { spec: CarouselSpec; className: string }) {
  const { t } = useUiTranslation('chat');
  const [index, setIndex] = useState(0);
  const id = useId();
  const current = Math.min(index, spec.items.length - 1);
  const item = spec.items[current];
  if (!item) return null;
  const move = (next: number) => setIndex(Math.max(0, Math.min(spec.items.length - 1, next)));
  return (
    <section
      className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]`}
      data-answer-surface="carousel"
      aria-roledescription="carousel"
      aria-label={spec.title}
      tabIndex={0}
      onKeyDown={(event) => {
        if (
          event.key !== 'ArrowLeft' &&
          event.key !== 'ArrowRight' &&
          event.key !== 'Home' &&
          event.key !== 'End'
        )
          return;
        event.preventDefault();
        event.currentTarget.focus();
        move(
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? spec.items.length - 1
              : current + (event.key === 'ArrowRight' ? 1 : -1),
        );
      }}
    >
      <h3 className="border-b border-[var(--chat-border-subtle)] px-4 py-3 text-sm font-medium">
        {spec.title}
      </h3>
      <div
        id={id}
        className="px-4 py-3"
        role="group"
        aria-roledescription="slide"
        aria-label={`${current + 1} of ${spec.items.length}`}
        data-carousel-slide={current}
      >
        {item.src ? (
          <AnswerImage
            key={item.src}
            src={item.src}
            alt={item.title}
            className="aspect-video w-full rounded-lg object-contain"
          />
        ) : null}
        <h4 className="mt-2 text-sm font-medium">{item.title}</h4>
        {item.text ? (
          <p className="mt-1 text-sm text-[var(--chat-text-secondary)]">{item.text}</p>
        ) : null}
        {item.src ? <ResourceActions src={item.src} caption={item.title} /> : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[var(--chat-border-subtle)] px-4 py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-controls={id}
          disabled={current === 0}
          onClick={() => move(current - 1)}
        >
          {t('answerSurface.previous', 'Previous')}
        </Button>
        <span
          role="status"
          aria-live="polite"
          className="text-xs text-[var(--chat-text-secondary)]"
        >
          {t('answerSurface.slideCount', '{{current}} of {{total}}', {
            current: current + 1,
            total: spec.items.length,
          })}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-controls={id}
          disabled={current === spec.items.length - 1}
          onClick={() => move(current + 1)}
        >
          {t('answerSurface.next', 'Next')}
        </Button>
      </div>
    </section>
  );
}
