import type { Metadata } from 'next';

/**
 * These strings are the copy search engines and link previews quote for the
 * developer API, so they must name only what `public/openapi.json` actually
 * documents.
 *
 * They previously promised "webhooks, and SDK guides". Neither exists: the
 * published spec has no webhook path (the shipped surface is `/llm/v1/models`,
 * `/chat/completions`, `/embeddings`, `/audio/transcriptions` and
 * `/credits/balance`), and every workspace package is `private: true`, so there
 * is no client library anyone can install — `app/partners/page.tsx` says as
 * much in plain text. `keywords` is the one field `page.tsx` does not override
 * (`buildMetadata` replaces title/description/openGraph/twitter/canonical and
 * is passed no keywords), so "AGI SDK" and "webhooks" shipped verbatim on the
 * page while the rest of the block was dead.
 *
 * `__tests__/api-docs-metadata.test.ts` fails if either claim reappears without
 * the spec path or the publishable package that would make it true.
 */
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
