import Image from 'next/image';

export function ProductFrame({
  src,
  alt,
  width,
  height,
  caption,
  priority,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: readonly string[];
  priority?: boolean;
}) {
  return (
    <figure className="agi-ds-frame">
      <Image
        className="agi-ds-frame-media"
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="(max-width: 900px) 100vw, 50vw"
        priority={priority}
      />
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
