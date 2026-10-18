import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'API Documentation',
  description:
    'REST API reference for AGI. OpenAI-compatible chat completions, embeddings, transcriptions, model catalog, and credit balance, with a published OpenAPI bundle.',
  path: '/api-docs',
  keywords: [
    'AGI API',
    'AI agent API',
    'developer documentation',
    'REST API reference',
    'OpenAI-compatible API',
    'API integration',
  ],
  ogDescription:
    'REST API reference for AGI. Authentication, endpoints, and the published OpenAPI bundle.',
  imageAlt: 'AGI API Documentation',
});

export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
