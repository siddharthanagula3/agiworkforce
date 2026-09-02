import Image from 'next/image';

export function ProductFrame({
  light,
  dark,
  alt,
  width,
  height,
  caption,
  priority,
}: {
  light: string;
  dark: string;
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
        data-frame-theme="light"
        src={light}
        alt={alt}
        width={width}
        height={height}
        sizes="(max-width: 900px) 100vw, 50vw"
        priority={priority}
      />
      <Image
        className="agi-ds-frame-media"
        data-frame-theme="dark"
        src={dark}
        alt=""
        aria-hidden="true"
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
