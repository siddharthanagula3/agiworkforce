import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password | AGI Workforce',
  description: 'Reset your AGI Workforce account password securely.',
  robots: {
    index: false, // Don't index password reset page
  },
  alternates: {
    canonical: 'https://agiworkforce.com/forgot-password',
  },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
