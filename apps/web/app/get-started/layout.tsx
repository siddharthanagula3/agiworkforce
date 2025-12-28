import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Getting Started | AGI Workforce',
  description:
    'Get started with AGI Workforce. Learn how to build, configure, and deploy your first AI agent in minutes.',
  openGraph: {
    title: 'Getting Started Guide | AGI Workforce',
    description: 'Step-by-step guide to building your first autonomous AI agent.',
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
