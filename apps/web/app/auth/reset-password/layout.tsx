import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Reset Password',
  description: 'Recover your AGI account password.',
  path: '/auth/reset-password',
  robots: { index: false },
});

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
