import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Create Account',
  description:
    'Create your AGI account for the Managed Cloud trial on the web and an account-based workspace.',
  path: '/signup',
  ogDescription:
    'Sign up for the Managed Cloud trial on the web and an account-based AGI workspace.',
  imageAlt: 'Sign up for AGI',
  robots: { index: false },
});

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
