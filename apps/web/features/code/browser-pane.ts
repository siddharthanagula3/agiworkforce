const PANE_ID_CHARACTERS = /[^A-Za-z0-9_-]/gu;
const PANE_ID_LENGTH = 80;
const FALLBACK_PANE_ID = 'session';

/** The pane a session owns: the desktop keeps one set of tabs for each id. */
export function browserPaneIdFor(sessionId: string): string {
  const id = sessionId.replace(PANE_ID_CHARACTERS, '').slice(0, PANE_ID_LENGTH);
  return id === '' ? FALLBACK_PANE_ID : id;
}

export interface BrowserPaneRequest {
  url: string;
  key: number;
}

export const BROWSER_PANE_COPY = {
  pane: 'Browser',
  toggle: 'Browser',
  tabs: 'Browser tabs',
  newTab: 'New tab',
  blankTab: 'New tab',
  closeTab: (title: string): string => `Close ${title}`,
  back: 'Back',
  forward: 'Forward',
  reload: 'Reload',
  stop: 'Stop loading',
  address: 'Web address',
  addressPlaceholder: 'Type a web address',
  addressInvalid: 'That is not a web address. Try localhost:3000 or example.com.',
  annotate: 'Mark up this page and add it to the chat',
  openOutside: 'Open this page in your own browser',
  expand: 'Expand the browser',
  restore: 'Restore the browser',
  close: 'Close the browser',
  emptyTitle: 'Browse beside your session',
  emptyBody: 'Type a web address above, or preview the app this folder is running.',
  emptyPrivacy:
    'Pages here are kept apart from your account and your files. Sign-ins made here are forgotten when the app closes, and downloads are off.',
  findServer: 'Find the dev server',
  findingServer: 'Looking for a dev server',
  noServer: 'No dev server is running in this folder. Start one in the terminal, then look again.',
  serverChoices: 'Dev servers running in this folder',
  openServer: (url: string): string => `Open ${url}`,
  findServerFailed: 'The running commands could not be read.',
  failureTitle: 'This page did not load',
  retry: 'Try again',
  paused: 'The page is paused while something is open over it.',
  frozenPage: 'The page as it was a moment ago',
  loading: 'Loading the page',
  captureName: 'browser-capture.png',
  captureFailed: 'The page could not be captured.',
  failed: 'The browser could not do that.',
  openOutsideFailed: 'The page could not be opened in your browser.',
} as const;
