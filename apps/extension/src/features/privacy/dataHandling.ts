export interface DataHandlingDisclosure {
  id: 'page-injection' | 'debugger' | 'cookies' | 'cloud-mirroring';
  label: string;
  body: string;
}

export const DATA_HANDLING_DISCLOSURES: DataHandlingDisclosure[] = [
  {
    id: 'page-injection',
    label: 'A content script loads on every page',
    body: 'AGI injects a content script into every http and https page you open so the side panel can read the page you point it at. It reads page text only when you ask for it on a site you approved below; it sends nothing from sites you have not approved.',
  },
  {
    id: 'debugger',
    label: 'The debugger permission drives computer use',
    body: 'AGI holds the Chrome debugger permission because computer use drives the page through the Chrome DevTools Protocol. It attaches only for one bounded action on an approved site and detaches afterward, and Chrome shows its "being debugged" banner the whole time.',
  },
  {
    id: 'cookies',
    label: 'The cookies permission only writes, never reads',
    body: 'AGI holds the cookies permission so a run can set a cookie on a site you are working in. Only AGI’s own extension pages can ask for it, banking, government, health, cloud-console, identity and mail domains are refused outright, and AGI never reads the cookies any site has stored.',
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
