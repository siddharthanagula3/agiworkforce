export function HeroHeadline({ id, text }: { id: string; text: string }) {
  return (
    <h1 className="agi-ds-h1" id={id}>
      {text.split(' ').map((word, index) => (
        <span
          className="agi-ds-hero-word"
          style={{ '--agi-ds-word-index': index } as React.CSSProperties}
          key={`${word}-${index}`}
        >
          {index === 0 ? word : ` ${word}`}
        </span>
      ))}
    </h1>
  );
}
