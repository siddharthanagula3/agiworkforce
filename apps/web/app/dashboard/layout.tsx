import type { Metadata } from 'next';
import DashboardClientLayout from './DashboardClientLayout';

export const metadata: Metadata = {
  title: 'Dashboard | AGI Workforce',
  description:
    'Your AGI Workforce dashboard. Manage AI agents, conversations, billing, and settings.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: 'https://agiworkforce.com/dashboard',
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardClientLayout>{children}</DashboardClientLayout>;
}
