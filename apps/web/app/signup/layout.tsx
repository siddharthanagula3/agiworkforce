import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Create your AGI account for the hosted web trial and account-based workspace.',
  openGraph: {
    title: 'Create Account',
    description: 'Sign up for the hosted web trial and account-based AGI workspace.',
    type: 'website',
    url: 'https://agiworkforce.com/signup',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'Sign up for AGI',
      },
    ],
  },
  robots: {
    index: false, // Don't index signup page
  },
  alternates: {
    canonical: 'https://agiworkforce.com/signup',
  },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
