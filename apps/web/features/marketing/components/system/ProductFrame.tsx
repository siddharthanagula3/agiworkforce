import Image from 'next/image';

const DEFAULT_SIZES = '(max-width: 900px) 100vw, 50vw';

export function ProductFrame({
  src,
  srcLight,
  alt,
  width,
  height,
  caption,
  priority,
  sizes = DEFAULT_SIZES,
}: {
  src: string;
  srcLight?: string;
  alt: string;
  width: number;
  height: number;
  caption?: readonly string[];
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <figure className="agi-ds-frame" data-paired={srcLight ? 'true' : undefined}>
      <Image
        className="agi-ds-frame-media"
        data-frame-theme="dark"
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        priority={priority}
      />
      {srcLight ? (
        <Image
          className="agi-ds-frame-media"
          data-frame-theme="light"
          src={srcLight}
          alt=""
          aria-hidden="true"
          width={width}
          height={height}
          sizes={sizes}
          priority={priority}
        />
      ) : null}
      {caption ? (
        <figcaption className="agi-ds-frame-caption">
          {caption.map((part) => (
            <span key={part}>{part}</span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
}
