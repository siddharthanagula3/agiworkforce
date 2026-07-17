interface DisclaimerProps {
  variant?: 'default' | 'citations' | 'code';
}

export function Disclaimer({ variant = 'default' }: DisclaimerProps) {
  const text =
    variant === 'citations'
      ? 'Sources provided. Verify important information.'
      : variant === 'code'
        ? 'Review code before running. AI can make mistakes.'
        : 'AI can make mistakes. Verify important information.';

  return <p className="text-center text-[10px] text-[var(--chat-text-muted)] pt-1 pb-1">{text}</p>;
}
