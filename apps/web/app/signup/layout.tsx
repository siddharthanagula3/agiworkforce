import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account | AGI Workforce',
  description:
    'Create your free AGI Workforce account and start building autonomous AI agents. No credit card required.',
  openGraph: {
    title: 'Create Account | AGI Workforce',
    description: 'Sign up for free and start automating with AI agents. Hobby plan available.',
    type: 'website',
    url: 'https://agiworkforce.com/signup',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'Sign up for AGI Workforce',
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
