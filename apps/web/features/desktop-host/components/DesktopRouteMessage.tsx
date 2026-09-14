import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { PRODUCT_HOME_PATH } from '../lib/deep-links';

const BRAND_NAME = 'AGI Workforce';
const ACTION_LABEL = 'Go to chat';
const BRAND_MARK_SIZE = 20;

/**
 * What a route the desktop shell cannot render looks like inside it.
 *
 * The browser keeps the marketing version of these pages, with its header,
 * nav and footer. The shell hosts the product and nothing else, so a page it
 * reached by mistake says what happened and offers the one way back rather
 * than turning the app window into the website.
 */
export function DesktopRouteMessage({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div
      data-surface="desktop"
      className="relative flex min-h-svh w-full flex-col bg-[var(--chat-bg)] px-6 text-[var(--chat-fg)]"
    >
      <span
        data-window-brand=""
        className="absolute left-6 top-6 inline-flex items-center gap-2 text-base font-semibold tracking-[-0.01em]"
      >
        <AgiMark size={BRAND_MARK_SIZE} />
        {BRAND_NAME}
      </span>

      <main
        id="main-content"
        className="mx-auto flex w-full max-w-[26rem] flex-1 flex-col items-center justify-center gap-4 text-center"
      >
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
        {description !== undefined && (
          <p className="text-sm text-[var(--chat-text-secondary)]">{description}</p>
        )}
        <Link
          href={PRODUCT_HOME_PATH}
          className="mt-2 inline-flex h-9 items-center justify-center rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))]"
        >
          {ACTION_LABEL}
        </Link>
      </main>
    </div>
  );
}
