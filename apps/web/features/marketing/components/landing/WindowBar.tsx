import type { ReactNode } from 'react';

const DOTS = 3;

export function WindowBar({ url, children }: { url: string; children?: ReactNode }) {
  return (
    <div className="agi-home-window-bar">
      <span className="agi-home-window-dots" aria-hidden="true">
        {Array.from({ length: DOTS }, (_, position) => (
          <i key={position} />
        ))}
      </span>
      <span className="agi-home-window-url">{url}</span>
      {children}
    </div>
  );
}
