'use client';

import React from 'react';

export default function ChatLayoutShell({ children }: { children: React.ReactNode }) {
  return <div className="h-screen bg-background">{children}</div>;
}
