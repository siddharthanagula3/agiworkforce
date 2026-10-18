import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Gallery',
  description:
    'See what AGI can do. Example projects showing AI automation, code generation, research, and desktop control.',
  path: '/gallery',
  keywords: [
    'AI automation examples',
    'AGI gallery',
    'AI agent demos',
    'automation showcase',
    'AI use case examples',
  ],
  ogDescription:
    'Example projects showing AGI in action - code generation, research, automation, and more.',
  imageAlt: 'AGI Gallery',
});

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
