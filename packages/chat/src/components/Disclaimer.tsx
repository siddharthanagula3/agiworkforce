import { cn } from '../lib/utils';

type DisclaimerVariant = 'default' | 'citations' | 'code';

const DISCLAIMER_TEXT: Record<DisclaimerVariant, string> = {
  default: 'AI can make mistakes. Please double-check responses.',
  citations: 'AI can make mistakes. Please double-check cited sources.',
  code: 'AI can make mistakes. Please review generated code.',
};

interface DisclaimerProps {
  variant?: DisclaimerVariant;
  className?: string;
}

export function Disclaimer({ variant = 'default', className }: DisclaimerProps) {
  return (
    <p className={cn('pb-2 pt-1 text-center text-[12px] text-[var(--chat-text-muted)]', className)}>
      {DISCLAIMER_TEXT[variant]}
    </p>
  );
}
