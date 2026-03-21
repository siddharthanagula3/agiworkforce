'use client';

import DashboardHome from '@features/pages/DashboardHome';

// Temporary: keep dashboard until cross-domain auth is resolved
// Goal: eliminate dashboard, serve chat directly on agiworkforce.com/chat
export default function DashboardPage() {
  return <DashboardHome />;
}
