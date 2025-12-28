import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | AGI Workforce',
  description: 'Sign in to your AGI Workforce account to access your AI agents and workflows.',
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
