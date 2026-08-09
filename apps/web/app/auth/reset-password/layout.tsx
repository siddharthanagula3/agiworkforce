import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Recover your AGI account password.',
  robots: {
    index: false, // Don't index password reset page
  },
  alternates: {
    canonical: 'https://agiworkforce.com/auth/reset-password',
  },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
