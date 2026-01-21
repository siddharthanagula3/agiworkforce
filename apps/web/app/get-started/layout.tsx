import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Getting Started | AGI Workforce',
  description:
    'Download AGI Workforce and start chatting with AI in seconds. No setup required - just open the app and describe what you want done.',
  openGraph: {
    title: 'Getting Started | AGI Workforce',
    description: 'Download and start using AGI Workforce in seconds. No configuration needed.',
    type: 'website',
    url: 'https://agiworkforce.com/get-started',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'Getting Started with AGI Workforce',
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
