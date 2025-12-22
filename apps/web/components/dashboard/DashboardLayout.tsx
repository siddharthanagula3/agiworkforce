'use client';

import { ReactNode } from 'react';
import { Header } from '../layout/Header';
import { Sidebar } from './Sidebar';

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <div className="flex pt-16 h-screen overflow-hidden">
        <Sidebar className="hidden md:block w-64 flex-shrink-0 overflow-y-auto" />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
