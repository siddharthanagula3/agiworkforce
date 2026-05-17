import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Update Password | AGI',
  description: 'Update your AGI account password.',
  robots: {
    index: false, // Don't index password update page
  },
  alternates: {
    canonical: 'https://agiworkforce.com/auth/update-password',
  },
};

export default function UpdatePasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
