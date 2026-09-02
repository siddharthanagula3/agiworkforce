import { Metadata } from 'next';

const TITLE = 'Get started: from zero to a working chat';
const DESCRIPTION =
  'AGI Web works today in the browser, the CLI ships signed archives for macOS, Linux, and Windows, and Desktop has a Linux build pending its signature check. Mobile, Chrome, and VS Code are not shipped yet.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    url: 'https://agiworkforce.com/get-started',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'Getting started with AGI',
      },
    ],
  },
  alternates: {
    canonical: 'https://agiworkforce.com/get-started',
  },
};

export default function GetStartedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
