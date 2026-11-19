import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  buildToolApprovalPolicyRows,
  buildToolApprovalToolRows,
  toolApprovalPolicySentence,
  TOOL_APPROVAL_PRECEDENCE,
} from '@/lib/tool-approval-view';

type ProductTypesModule = typeof import('@agiworkforce/types');

const connectorRelease = vi.hoisted(() => ({ any: true, all: false }));

vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<ProductTypesModule>()),
  hasReleasedConnectors: () => connectorRelease.any,
  connectorsReleased: () => connectorRelease.all,
}));

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import AgentPermissionsPage from './page';

const SECURITY_DOC = path.resolve(__dirname, '../../../..', 'docs/security/security.md');
const COMPUTER_USE_SOURCE = path.resolve(
  __dirname,
  '../../../..',
  'apps/extension/src/features/computer-use',
);

function extensionSource(file: string): string {
  return readFileSync(path.join(COMPUTER_USE_SOURCE, file), 'utf8');
}

function extensionApprovalTimeoutMinutes(): number {
  const declared = /export const APPROVAL_TIMEOUT_MS = (\d+) \* 60_000;/u.exec(
    extensionSource('agentLoop.ts'),
  );
  expect(declared, 'APPROVAL_TIMEOUT_MS is no longer declared in minutes').not.toBeNull();
  return Number(declared![1]);
}

function extensionDefaultPermissionMode(): string {
  const declared =
    /export const DEFAULT_BROWSER_PERMISSION_MODE: BrowserPermissionMode = '([a-z]+)';/u.exec(
      extensionSource('askBeforeActing.ts'),
    );
  expect(declared, 'DEFAULT_BROWSER_PERMISSION_MODE is no longer declared').not.toBeNull();
  return declared![1]!;
}

const BROWSER_MODE_LABEL: Record<string, string> = {
  ask: 'Ask first',
  auto: 'Auto',
  full: 'Full access',
};

function renderedRows(caption: string): { label: string; value: string }[] {
  return within(screen.getByRole('list', { name: caption }))
    .getAllByRole('listitem')
    .map((item) => {
      const [label, value] = Array.from(item.children).map((child) => child.textContent ?? '');
      return { label: label ?? '', value: value ?? '' };
    });
}

// The verdicts the security document publishes for each tool. That document is
// held to the code by documented-approval-posture.test.ts, so agreeing with it
// is what ties this page to `policyAutoApprovesTool` rather than to itself.
function documentedReadOnlyVerdicts(): Map<string, string> {
  const source = readFileSync(SECURITY_DOC, 'utf8');
  const start = source.indexOf('### 1.1 Managed Cloud, default tool authority');
  expect(start, `${SECURITY_DOC} no longer has section 1.1`).toBeGreaterThan(-1);
  const section = source.slice(start, source.indexOf('\n#### ', start));
  const verdicts = new Map<string, string>();
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length < 5 || !/^`[a-z_]+`$/.test(cells[1] ?? '')) continue;
    verdicts.set(cells[1]!.replace(/`/g, ''), cells[3]!);
  }
  expect(verdicts.size).toBeGreaterThan(5);
  return verdicts;
}

describe('AgentPermissionsPage', () => {
  beforeEach(() => {
    connectorRelease.any = true;
    connectorRelease.all = false;
  });

  it('states when the page was last updated', () => {
    render(<AgentPermissionsPage />);

    expect(
      screen.getByText(new RegExp(`Last updated:\\s*${POLICY_LAST_UPDATED.agentPermissions}`)),
    ).toBeInTheDocument();
  });

  it('leads with the website default the gate actually applies', () => {
    render(<AgentPermissionsPage />);

    expect(
      screen.getByRole('heading', {
        name: 'On the website, eligible tools run automatically by default.',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/execute without a prompt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/runs in\s+automatic approval mode/i)).not.toBeInTheDocument();
  });

  it('renders the account defaults the settings contract offers, with their tools', () => {
    render(<AgentPermissionsPage />);

    expect(renderedRows('What each account default runs without asking')).toEqual(
      buildToolApprovalPolicyRows().map((row) => ({
        label: row.label,
        value: toolApprovalPolicySentence(row),
      })),
    );
  });

  it('renders one row per declared platform tool, from the tool metadata', () => {
    render(<AgentPermissionsPage />);

    expect(renderedRows('Built-in tools')).toEqual(
      buildToolApprovalToolRows().map((row) => ({ label: row.label, value: row.description })),
    );
  });

  it('renders the full precedence order the server gate applies', () => {
    render(<AgentPermissionsPage />);

    expect(renderedRows('Approval precedence order')).toEqual(
      TOOL_APPROVAL_PRECEDENCE.map((row) => ({
        label: `${row.rank}. ${row.condition}`,
        value: row.outcome,
      })),
    );
  });

  it('agrees with the security document about which tools the read-only default runs', () => {
    render(<AgentPermissionsPage />);

    const readOnly = renderedRows('What each account default runs without asking').find((row) =>
      row.label.includes('read-only'),
    );
    expect(readOnly, 'the read-only account default needs a row').toBeDefined();

    const disagreements: string[] = [];
    const documented = documentedReadOnlyVerdicts();
    for (const tool of buildToolApprovalToolRows()) {
      const published = readOnly!.value.includes(tool.label);
      const expected = documented.get(tool.name) === 'runs';
      if (published !== expected) {
        disagreements.push(
          `${tool.name}: page ${published ? 'lists' : 'omits'} it, document says ${documented.get(tool.name)}`,
        );
      }
    }
    expect(disagreements, disagreements.join('\n')).toEqual([]);
  });

  it('states the browser approval timeout the extension enforces', () => {
    render(<AgentPermissionsPage />);

    const unanswered = renderedRows('Browser computer-use permissions').find(
      (row) => row.label === 'Unanswered approvals',
    );
    expect(unanswered, 'the browser ledger needs an Unanswered approvals row').toBeDefined();
    expect(unanswered!.value).toContain(
      `Skipped after ${extensionApprovalTimeoutMinutes()} minutes.`,
    );
  });

  it('names the browser permission mode the extension defaults to', () => {
    render(<AgentPermissionsPage />);

    const label = BROWSER_MODE_LABEL[extensionDefaultPermissionMode()];
    expect(label, 'the extension default has no published mode name').toBeDefined();
    const rows = renderedRows('Browser computer-use permissions');
    const modes = rows.find((row) => row.label === 'Permission modes');
    expect(modes, 'the browser ledger needs a Permission modes row').toBeDefined();
    expect(modes!.value).toContain(`${label} is the default`);
    expect(rows.some((row) => row.label === `${label}, the default`)).toBe(true);
  });

  it('keeps the retired browser approval claims off the page', () => {
    const { container } = render(<AgentPermissionsPage />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/30 seconds/iu);
    expect(text).not.toMatch(/on by default/iu);
    expect(text).not.toMatch(/autopilot/iu);
    expect(text).not.toMatch(/only an explicit opt-out/iu);
  });

  it.each([
    {
      any: false,
      all: false,
      disclosure: 'Connectors are coming soon, and none can be connected yet.',
    },
    {
      any: true,
      all: false,
      disclosure:
        'Selected connectors can be connected when your plan, region and provider setup permit them.',
    },
    {
      any: true,
      all: true,
      disclosure:
        'Released connectors can be connected when your plan, region and provider setup permit them.',
    },
  ])('discloses connector availability for any=$any, all=$all', ({ any, all, disclosure }) => {
    connectorRelease.any = any;
    connectorRelease.all = all;

    render(<AgentPermissionsPage />);

    expect(screen.getByRole('heading', { name: 'What connectors request.' })).toBeInTheDocument();
    expect(screen.getByText(disclosure, { exact: false })).toBeInTheDocument();
    if (any) {
      expect(screen.queryByText(/none can be connected yet/)).not.toBeInTheDocument();
      expect(screen.getByText(/listing alone does not grant access/)).toBeInTheDocument();
    }
  });
});
