import type { ReactNode } from 'react';

export function ConsolePage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-1)' }}>
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {description}
        </p>
      </header>
      {children}
    </div>
  );
}
