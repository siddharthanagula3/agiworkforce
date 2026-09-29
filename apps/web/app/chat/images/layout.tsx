import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Images',
  description: 'Create and edit images from a prompt.',
  robots: { index: false, follow: false },
};

export default function ImagesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
