import { createContext, useContext, useMemo, useState } from 'react';
import { Image as ImageIcon, ImageOff } from 'lucide-react';
import { Button, useUiTranslation } from '@agiworkforce/ui';
import { cn } from '../../lib/utils';
import { markdownImageSource } from './markdownImageSources';

export const NO_TRUSTED_IMAGES: ReadonlySet<string> = new Set();

/** Image keys this message's own tool results produced, which load without asking. */
export const TrustedImagesContext = createContext<ReadonlySet<string>>(NO_TRUSTED_IMAGES);

/** Cross-origin image keys the user chose to load during this page session. */
export const approvedImageKeys = new Set<string>();

const TILE_CLASS =
  'flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-[var(--chat-border-subtle)] bg-muted/40 p-4 text-center text-xs text-muted-foreground';

/**
 * An image named by model output inside an answer block. A cross-origin image loads only
 * when this message's tool results produced it or the user asks to load it, because a URL
 * the model wrote can carry conversation data to the host that serves it.
 */
export function GatedImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const { t } = useUiTranslation('chat');
  const trusted = useContext(TrustedImagesContext);
  const source = useMemo(() => markdownImageSource(src), [src]);
  const [approved, setApproved] = useState(() =>
    source?.kind === 'cross-origin' ? approvedImageKeys.has(source.key) : false,
  );
  const [failed, setFailed] = useState(false);

  if (!source || failed) {
    return (
      <div className={cn(TILE_CLASS, className)} data-image-state="unavailable">
        <ImageOff className="h-5 w-5" aria-hidden="true" />
        <span>{alt || t('markdown.imageUnavailable', 'Image unavailable')}</span>
      </div>
    );
  }

  const crossOrigin = source.kind === 'cross-origin';
  if (source.kind === 'cross-origin' && !trusted.has(source.key) && !approved) {
    return (
      <div className={cn(TILE_CLASS, className)} data-image-state="blocked">
        <ImageIcon className="h-5 w-5" aria-hidden="true" />
        <span className="break-words">
          {t('markdown.imageFrom', 'Image from {{host}}', { host: source.host })}
        </span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="pointer-coarse:min-h-11"
          aria-label={t('markdown.loadImageLabel', 'Load image from {{host}}', {
            host: source.host,
          })}
          onClick={() => {
            approvedImageKeys.add(source.key);
            setApproved(true);
          }}
        >
          {t('markdown.loadImage', 'Load image')}
        </Button>
      </div>
    );
  }

  return (
    <img
      src={source.src}
      alt={alt}
      loading="lazy"
      referrerPolicy={crossOrigin ? 'no-referrer' : undefined}
      onError={() => setFailed(true)}
      className={className}
      data-image-state="loaded"
    />
  );
}
