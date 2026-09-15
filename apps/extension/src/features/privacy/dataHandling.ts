export interface DataHandlingDisclosure {
  id: 'page-injection' | 'debugger' | 'cookies' | 'cloud-mirroring';
  label: string;
  body: string;
}

export const DATA_HANDLING_DISCLOSURES: DataHandlingDisclosure[] = [
  {
    id: 'page-injection',
    label: 'A content script loads on every page',
    body: 'AGI loads a content script into every http and https page you open, which is what Chrome’s “read and change all your data on all websites” warning refers to. On a site that is not on your approved list it adds no panel and sends nothing. Page text leaves the browser only when you ask for it: the page chip in the composer, a slash command that needs the page, or the Summarize entry in the right-click menu. That attach takes up to 5,000 characters of the visible text of the tab you point it at, with secret-like values redacted first. The approved-sites list below governs the in-page panel, the page tools and browser automation.',
  },
  {
    id: 'debugger',
    label: 'The debugger permission drives computer use',
    body: 'AGI holds the Chrome debugger permission because computer use drives the page through the Chrome DevTools Protocol. It attaches only for one bounded action on an approved site and detaches afterward, and Chrome shows its "being debugged" banner the whole time.',
  },
  {
    id: 'cookies',
    label: 'The cookies permission reads only your AGI sign-in',
    body: 'AGI holds the cookies permission so it can read your own agiworkforce.com sign-in session and act as the account you already signed into on the web. It never sets a cookie and never reads cookies from any other site.',
  },
  {
    id: 'cloud-mirroring',
    label: 'Managed Cloud chats are mirrored to your account',
    body: 'Chats you run on AGI Managed Cloud are copied to your AGI account so they appear on the web and mobile apps. Turn the mirror off to keep those chats in this browser only; nothing already stored locally is sent while it is off.',
  },
];

export const CLOUD_MIRRORING_LABEL = 'Save Managed Cloud chats to my account';

export function describeCloudMirroring(enabled: boolean): string {
  return enabled
    ? 'Managed Cloud chats are mirrored to your AGI account.'
    : 'Managed Cloud chats stay in this browser only.';
}
