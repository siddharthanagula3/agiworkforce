import { BILLING_PLAN_PRICING } from '@agiworkforce/types';
import { BYOK_PROVIDERS } from '@/lib/byok-providers';
import { BYOK_SURFACES, DESKTOP_LOCAL_RUNTIMES, SURFACE_STATUS } from '@/lib/marketing-constants';
import type { LaneId } from '../system/lanes';
import type { LedgerRow } from '../system/Ledger';
import type { SurfaceStatusProps } from '../system/SurfaceStatus';

export const HERO_QUESTION = 'Summarise this contract and flag the termination clause.';

export const HERO_ROUTES: readonly {
  lane: LaneId;
  detail: readonly string[];
  note: string;
}[] = [
  {
    lane: 'local',
    detail: ['llama.cpp', '$0.00'],
    note: 'Runs on your hardware. Nothing leaves the device.',
  },
  {
    lane: 'byok',
    detail: ['Anthropic', 'billed to you'],
    note: 'Your key, your provider account, straight through.',
  },
  {
    lane: 'cloud',
    detail: ['metered'],
    note: 'Our capacity, counted against your plan.',
  },
];

export const SURFACES: readonly SurfaceStatusProps[] = [
  {
    state: 'live',
    name: 'Web',
    detail: `${SURFACE_STATUS.web}. It runs in any browser with nothing to install.`,
    action: { label: 'Open AGI Web', href: '/login?redirectTo=%2F' },
  },
  {
    state: 'live',
    name: 'CLI',
    detail: `${SURFACE_STATUS.cli}. Signed archives for macOS, Linux, and Windows, each published with a checksum you can verify yourself.`,
    action: { label: 'See the release table', href: '/download' },
  },
  {
    state: 'pending',
    name: 'Desktop',
    blockedOn:
      'A Linux build is waiting on its signature check. The macOS app that ships today is a separate, cloud-only binary.',
  },
  { state: 'absent', name: 'Mobile', detail: 'No listing on either app store.' },
  { state: 'absent', name: 'Chrome', detail: 'No listing on the Chrome Web Store.' },
  { state: 'absent', name: 'VS Code', detail: 'The extension exists only as an unpublished VSIX.' },
];

const LIVE_SURFACE_NAMES = new Set(
  SURFACES.filter((surface) => surface.state === 'live').map((surface) => surface.name),
);

const listLiveSurfaces = (candidates: readonly string[]): string => {
  const live = candidates.filter((name) => LIVE_SURFACE_NAMES.has(name));
  if (live.length <= 1) return live[0] ?? 'Not shipped yet';
  if (live.length === 2) return `${live[0]} and ${live[1]}`;
  return `${live.slice(0, -1).join(', ')}, and ${live[live.length - 1]}`;
};

export const LANE_PANELS: readonly {
  lane: LaneId;
  title: string;
  summary: string;
  rows: readonly LedgerRow[];
}[] = [
  {
    lane: 'local',
    title: 'On hardware you already own',
    summary:
      'Point AGI at a model you already run. There is no account and no request to us in the path.',
    rows: [
      { label: 'Runtimes', value: DESKTOP_LOCAL_RUNTIMES.label },
      { label: 'Where the key lives', value: 'There is no key, and no account.' },
      { label: 'Cost', value: '$0.00' },
      {
        label: 'What leaves the device',
        value:
          'Nothing, until you send it. Moving a local session into another lane is an explicit fork with a payload preview and a secret scan.',
      },
      { label: 'Available on', value: listLiveSurfaces(['Desktop', 'CLI']) },
    ],
  },
  {
    lane: 'byok',
    title: 'On your own provider account',
    summary:
      'Paste a key you already pay for. The request goes to your provider and the bill arrives from your provider.',
    rows: [
      { label: 'Providers', value: `${BYOK_PROVIDERS.length}, from one key list` },
      {
        label: 'Where the key lives',
        value:
          'Desktop encrypted storage, the CLI keyring under com.agiworkforce.cli.auth, and VS Code SecretStorage.',
      },
      { label: 'Cost', value: 'Whatever your provider charges. AGI is never in the payment path.' },
      { label: 'Available on', value: listLiveSurfaces(['Desktop', 'CLI', 'VS Code']) },
      { label: 'Not accepted on', value: BYOK_SURFACES.exclusion, quiet: true },
    ],
  },
  {
    lane: 'cloud',
    title: 'On capacity we run',
    summary:
      'Sign in and start, no waitlist. A small free allowance needs no card, and paid plans raise the ceiling.',
    rows: [
      { label: 'Providers', value: 'Whatever the router picks, named on the answer.' },
      { label: 'Where the key lives', value: 'Ours. You never see it and never hold it.' },
      { label: 'Cost', value: 'Metered, and shown per turn.' },
      { label: 'Free allowance', value: 'Auto Economy, no card required' },
      { label: 'Available on', value: listLiveSurfaces(['Web', 'Desktop', 'Mobile']) },
    ],
  },
];

export const CAPABILITIES: readonly {
  title: string;
  body: string;
  image: { light: string; dark: string; alt: string; width: number; height: number };
  caption: readonly string[];
}[] = [
  {
    title: 'Agents stop and ask',
    body: 'An agent is a markdown file with frontmatter that names the tools it may touch. Anything that writes, deletes, runs code, or can move data out waits for you, and the approval dialog opens with the cursor on No.',
    image: {
      light: '/product/agents-tool-approvals-light.png',
      dark: '/product/agents-tool-approvals-dark.png',
      alt: 'The tool approvals setting in AGI, with "Ask before every action" selected',
      width: 1132,
      height: 584,
    },
    caption: ['Settings', 'Tool approvals'],
  },
  {
    title: 'Artifacts keep their history',
    body: 'Files an answer produces land in one library, versioned, restorable at no cost, and editable at the source rather than regenerated from scratch.',
    image: {
      light: '/product/artifacts-library-light.png',
      dark: '/product/artifacts-library-dark.png',
      alt: 'The AGI library listing generated artifacts with their type, size, and route labels',
      width: 2880,
      height: 1800,
    },
    caption: ['Library', 'Generated files'],
  },
  {
    title: 'Memory you can read and edit',
    body: 'Facts come from three places: what you wrote, what a chat captured, and what you imported. Every one of them is listed, editable, and suppressible by source.',
    image: {
      light: '/product/memory-settings-light.png',
      dark: '/product/memory-settings-dark.png',
      alt: 'The memory settings panel in AGI, listing where memories come from and how to suppress a source',
      width: 1720,
      height: 1360,
    },
    caption: ['Settings', 'Memory'],
  },
  {
    title: 'Deep research that cites',
    body: 'A cited report you can check, rather than a paragraph you have to trust. It is a mode on the composer, not a separate product.',
    image: {
      light: '/product/deep-research-composer-light.png',
      dark: '/product/deep-research-composer-dark.png',
      alt: 'The AGI composer with the Deep Research mode selected',
      width: 1472,
      height: 254,
    },
    caption: ['Composer', 'Deep research'],
  },
];

const monthly = (usd: number) => `$${usd}`;

export const TIERS: readonly {
  name: string;
  price: string;
  cadence: string;
  detail: string;
  recommended?: boolean;
}[] = [
  {
    name: BILLING_PLAN_PRICING.free.label,
    price: monthly(BILLING_PLAN_PRICING.free.monthlyPriceUsd),
    cadence: 'no card',
    detail: 'The Auto Economy allowance on AGI Cloud, plus Local and your own keys.',
  },
  {
    name: BILLING_PLAN_PRICING.basic.label,
    price: monthly(BILLING_PLAN_PRICING.basic.monthlyPriceUsd),
    cadence: 'per month',
    detail: 'The first paid step up in hosted capacity.',
  },
  {
    name: BILLING_PLAN_PRICING.pro.label,
    price: monthly(BILLING_PLAN_PRICING.pro.monthlyPriceUsd),
    cadence: `per month, or $${BILLING_PLAN_PRICING.pro.yearlyPriceUsd} a year`,
    detail: 'Five times the Basic hosted capacity.',
    recommended: true,
  },
  {
    name: BILLING_PLAN_PRICING.max.label,
    price: monthly(BILLING_PLAN_PRICING.max.monthlyPriceUsd),
    cadence: 'per month',
    detail: 'Five times Pro, for sustained multi-agent work.',
  },
];

export const ENTERPRISE_ROWS: readonly LedgerRow[] = [
  { label: 'SOC 2', value: 'Not held.' },
  {
    label: 'SSO and SCIM',
    value: 'Implemented, and gated behind the enterprise controls flag.',
  },
  {
    label: 'Audit events',
    value:
      'Append only. They are written through a security-definer function that the application role cannot mutate.',
  },
];
