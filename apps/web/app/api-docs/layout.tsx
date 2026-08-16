import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Documentation',
  description:
    'REST API reference for AGI. OpenAI-compatible chat completions, embeddings, transcriptions, model catalog, and credit balance, with a published OpenAPI bundle.',
  keywords: [
    'AGI API',
    'AI agent API',
    'developer documentation',
    'REST API reference',
    'OpenAI-compatible API',
    'API integration',
  ],
  openGraph: {
    title: 'API Documentation',
    description:
      'REST API reference for AGI. Authentication, endpoints, and the published OpenAPI bundle.',
    type: 'website',
    url: 'https://agiworkforce.com/api-docs',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'AGI API Documentation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'API Documentation',
    description:
      'REST API reference for AGI. Authentication, endpoints, and the published OpenAPI bundle.',
    images: ['/api/og'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/api-docs',
  },
};

export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
