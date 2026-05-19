import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Documentation',
  description:
    'Complete API reference and developer documentation for AGI integrations. REST endpoints, authentication, webhooks, and SDK guides.',
  keywords: [
    'AGI API',
    'AI agent API',
    'developer documentation',
    'REST API reference',
    'AGI SDK',
    'API integration',
    'webhooks',
  ],
  openGraph: {
    title: 'API Documentation | AGI',
    description:
      'Complete REST API reference for AGI. Authentication, endpoints, webhooks, and SDK guides.',
    type: 'website',
    url: 'https://agiworkforce.com/api-docs',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI API Documentation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'API Documentation | AGI',
    description:
      'Complete REST API reference for AGI. Authentication, endpoints, webhooks, and SDK guides.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/api-docs',
  },
};

export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
