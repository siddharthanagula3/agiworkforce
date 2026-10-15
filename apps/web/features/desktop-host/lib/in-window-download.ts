'use client';

/**
 * Save a file this site serves, from inside the desktop window. A download
 * that is opened as a link or a new window is turned away to the browser by
 * the shell, and the browser has no session for the route, so the request is
 * made here as a download, which the window's own session answers.
 */
export function downloadInWindow(href: string): void {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = '';
  anchor.rel = 'noopener';
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
