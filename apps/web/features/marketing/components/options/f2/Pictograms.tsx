import type { CSSProperties, ReactNode } from 'react';
import type { SurfaceId } from '@/lib/surface-status';

const VIEW = '0 0 96 96';

function Figure({ children }: { children: ReactNode }) {
  return (
    <svg className="f2-picto" viewBox={VIEW} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const stroke = (index: number): CSSProperties => ({ '--i': index }) as CSSProperties;

const Web = (
  <Figure>
    <rect x="10" y="18" width="76" height="60" rx="8" pathLength={1} style={stroke(0)} />
    <path d="M10 34H86" pathLength={1} style={stroke(1)} />
    <path d="M18 26h4M26 26h4M34 26h4" pathLength={1} style={stroke(2)} />
    <path d="M24 48H64" pathLength={1} style={stroke(3)} />
    <path d="M24 60H50" pathLength={1} style={stroke(4)} />
  </Figure>
);

const Desktop = (
  <Figure>
    <rect x="18" y="14" width="60" height="44" rx="6" pathLength={1} style={stroke(0)} />
    <path d="M8 70H88L80 60H16Z" pathLength={1} style={stroke(1)} />
    <path d="M30 30H66" pathLength={1} style={stroke(2)} />
    <path d="M30 42H54" pathLength={1} style={stroke(3)} />
  </Figure>
);

const Cli = (
  <Figure>
    <rect x="10" y="18" width="76" height="60" rx="8" pathLength={1} style={stroke(0)} />
    <path d="M10 32H86" pathLength={1} style={stroke(1)} />
    <path d="M24 46L36 55L24 64" pathLength={1} style={stroke(2)} />
    <path d="M44 64H60" pathLength={1} style={stroke(3)} />
  </Figure>
);

const Mobile = (
  <Figure>
    <rect x="30" y="8" width="36" height="80" rx="8" pathLength={1} style={stroke(0)} />
    <path d="M42 16H54" pathLength={1} style={stroke(1)} />
    <path d="M38 36H58" pathLength={1} style={stroke(2)} />
    <path d="M38 48H52" pathLength={1} style={stroke(3)} />
    <path d="M40 80H56" pathLength={1} style={stroke(4)} />
  </Figure>
);

const Chrome = (
  <Figure>
    <rect x="10" y="18" width="76" height="60" rx="8" pathLength={1} style={stroke(0)} />
    <path d="M10 32H86" pathLength={1} style={stroke(1)} />
    <path d="M58 32V78" pathLength={1} style={stroke(2)} />
    <path d="M20 46H48M20 58H40" pathLength={1} style={stroke(3)} />
    <path d="M66 46H78M66 58H78M66 70H74" pathLength={1} style={stroke(4)} />
  </Figure>
);

const VsCode = (
  <Figure>
    <rect x="10" y="18" width="76" height="60" rx="8" pathLength={1} style={stroke(0)} />
    <path d="M26 18V78" pathLength={1} style={stroke(1)} />
    <path d="M36 36H72" pathLength={1} style={stroke(2)} />
    <path d="M36 48H60" pathLength={1} style={stroke(3)} />
    <path d="M36 60H66" pathLength={1} style={stroke(4)} />
    <path d="M14 28h4M14 40h4M14 52h4" pathLength={1} style={stroke(5)} />
  </Figure>
);

export const PICTOGRAMS: Record<SurfaceId, ReactNode> = {
  web: Web,
  desktop: Desktop,
  cli: Cli,
  mobile: Mobile,
  chrome: Chrome,
  vscode: VsCode,
};
