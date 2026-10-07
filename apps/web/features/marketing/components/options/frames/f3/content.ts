import { SURFACES_SECTION } from '@/features/marketing/components/landing/landing-content';
import { WEB_ENTRY_HREF } from '@/features/marketing/components/system/nav';
import {
  isReleased,
  SURFACE_NAMES,
  SURFACE_STATUS,
  surfaceAvailabilitySummary,
  surfaceCta,
  type SurfaceId,
} from '@/lib/surface-status';

export const CLAIM_LINES = SURFACES_SECTION.title
  .split('. ')
  .map((line, index, all) => (index < all.length - 1 ? `${line}.` : line));
export const SENTENCE = 'Projects, memory and artifacts follow your account between surfaces.';
export const AVAILABILITY = surfaceAvailabilitySummary();
export const PRIMARY = { label: 'Try AGI Web', href: WEB_ENTRY_HREF } as const;
export const SECONDARY = surfaceCta('desktop');

export interface CitySurface {
  readonly id: SurfaceId;
  readonly name: string;
  readonly status: string;
  readonly released: boolean;
  readonly width: number;
  readonly height: number;
}

const TOWER_SIZES: Readonly<Record<SurfaceId, readonly [number, number]>> = {
  chrome: [92, 170],
  desktop: [130, 230],
  web: [84, 420],
  cli: [60, 300],
  vscode: [112, 260],
  mobile: [52, 340],
};

const CITY_ORDER: readonly SurfaceId[] = ['chrome', 'desktop', 'web', 'cli', 'vscode', 'mobile'];

export const CITY: readonly CitySurface[] = CITY_ORDER.map((id) => ({
  id,
  name: SURFACE_NAMES[id],
  status: SURFACE_STATUS[id],
  released: isReleased(id),
  width: TOWER_SIZES[id][0],
  height: TOWER_SIZES[id][1],
}));
