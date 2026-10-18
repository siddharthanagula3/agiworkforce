import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Sign In',
  description: 'Sign in to your AGI account to access your AI assistant and manage billing.',
  path: '/login',
  robots: { index: false },
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
