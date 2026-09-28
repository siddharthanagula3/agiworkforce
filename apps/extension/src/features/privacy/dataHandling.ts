export interface DataHandlingDisclosure {
  id: 'page-injection' | 'debugger' | 'cookies' | 'cloud-mirroring' | 'training' | 'retention';
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
  {
    id: 'training',
    label: 'Model training',
    body: 'We do not sell your data, and we do not train AGI-owned models on your prompts, responses or files. There is no training opt-in, because that data path does not exist. Each request goes to the hosted provider serving the model you selected, under that provider’s terms. On the Free plan, requests are served by providers’ free models, and those providers’ terms may allow them to train on what you send, unless you turn on Only use models that do not train on your chats in your account’s privacy settings.',
  },
  {
    id: 'retention',
    label: 'How long chats are kept',
    body: 'A chat saved to your account stays in your history until you delete it, and a deleted chat stays in Recently deleted for 30 days, then is deleted for good. A temporary chat is never saved. This browser keeps your 100 most recent chats until you delete them or remove the extension. When you delete your account, erasure starts 24 hours after you confirm, and you can cancel until then.',
  },
];

export const CLOUD_MIRRORING_LABEL = 'Save Managed Cloud chats to my account';

export function describeCloudMirroring(enabled: boolean): string {
  return enabled
    ? 'Managed Cloud chats are mirrored to your AGI account.'
    : 'Managed Cloud chats stay in this browser only.';
}
