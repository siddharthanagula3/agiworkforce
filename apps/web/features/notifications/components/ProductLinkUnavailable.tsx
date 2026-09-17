import Link from 'next/link';
import type { ProductLinkTarget, ProductLinkUnavailableState } from '@agiworkforce/types';

const NOUN: Record<ProductLinkTarget, string> = {
  file: 'file',
  artifact: 'artifact',
  work: 'Work session',
  research: 'research report',
  schedule: 'schedule',
  'browser-task': 'browser task',
};

const RETURN: Record<ProductLinkTarget, { href: string; label: string }> = {
  file: { href: '/chat/library', label: 'Open Library' },
  artifact: { href: '/chat/library?surface=artifact', label: 'Open Library' },
  work: { href: '/tasks', label: 'Open Work history' },
  research: { href: '/chat', label: 'Back to chats' },
  schedule: { href: '/chat/schedules', label: 'Open Schedules' },
  'browser-task': { href: '/tasks', label: 'Open Work history' },
};

export function productLinkUnavailableCopy(
  target: ProductLinkTarget,
  state: ProductLinkUnavailableState,
): { title: string; body: string } {
  const noun = NOUN[target];
  switch (state) {
    case 'deleted':
      return {
        title: `This ${noun} was deleted`,
        body:
          target === 'file' || target === 'artifact'
            ? 'It is in Recently deleted in Library, where it can be restored until it is erased for good.'
            : 'It was deleted, or removed along with the chat it belonged to, and can no longer be opened.',
      };
    case 'expired':
      return {
        title: `This ${noun} has ended`,
        body: 'It reached its end date and no longer runs. Its past runs are still in Schedules, where you can create a new one.',
      };
    case 'unauthorized':
      return {
        title: 'You don’t have access to this',
        body: `This ${noun} belongs to a different account. Sign in with the account the link was meant for, or ask its owner to share it with you.`,
      };
    case 'not_found':
      return {
        title: `This ${noun} isn’t available`,
        body: 'The link points to something that no longer exists, or never did. It may have been removed for good.',
      };
  }
}

export function ProductLinkUnavailable({
  target,
  state,
}: {
  target: ProductLinkTarget;
  state: ProductLinkUnavailableState;
}) {
  const { title, body } = productLinkUnavailableCopy(target, state);
  const back = RETURN[target];
  return (
    <section
      data-testid="product-link-unavailable"
      data-state={state}
      className="mx-auto flex min-h-full w-full max-w-[30rem] flex-col items-center justify-center gap-3 px-4 py-16 text-center"
    >
      <h1 className="text-xl font-medium text-[var(--chat-text-primary)]">{title}</h1>
      <p className="text-sm leading-relaxed text-[var(--chat-text-secondary)]">{body}</p>
      <Link
        href={back.href}
        className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-[var(--chat-surface-hover)] px-4 text-sm font-medium text-[var(--chat-text-primary)] outline-none transition-colors hover:bg-[var(--chat-surface-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)] pointer-coarse:min-h-11"
      >
        {back.label}
      </Link>
    </section>
  );
}
