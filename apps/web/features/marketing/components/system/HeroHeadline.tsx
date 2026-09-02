import { Fragment, type CSSProperties } from 'react';

export function HeroHeadline({ id, text }: { id: string; text: string }) {
  return (
    <h1 className="agi-ds-h1" id={id}>
      {text.split(' ').map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          {index === 0 ? null : ' '}
          <span
            className="agi-ds-hero-word"
            style={{ '--agi-ds-word-index': index } as CSSProperties}
          >
            {word}
          </span>
        </Fragment>
      ))}
    </h1>
  );
}
