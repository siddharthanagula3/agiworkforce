import { notFound } from 'next/navigation';

// No published posts yet. Any slug 404s until we have writing to ship.
export default function BlogPostPage(): never {
  notFound();
}
