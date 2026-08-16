
export async function printConversation(
  options: { onExpand?: () => void; waitMs?: number } = {},
): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const root = document.documentElement;
  root.setAttribute('data-print-scope', 'transcript');

  options.onExpand?.();

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  if (options.waitMs && options.waitMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, options.waitMs));
  }

  const cleanup = () => {
    root.removeAttribute('data-print-scope');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  try {
    window.print();
  } finally {
    setTimeout(cleanup, 1000);
  }
}
