import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | AGI',
  description: 'Sign in to your AGI account to access your AI assistant and manage billing.',
  robots: {
    index: false, // Don't index login page
  },
  alternates: {
    canonical: 'https://agiworkforce.com/login',
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
