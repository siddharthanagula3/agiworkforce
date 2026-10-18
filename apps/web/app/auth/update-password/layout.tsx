import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Update Password',
  description: 'Update your AGI account password.',
  path: '/auth/update-password',
  robots: { index: false },
});

export default function UpdatePasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
