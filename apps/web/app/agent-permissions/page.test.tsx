import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  buildToolApprovalPolicyRows,
  buildToolApprovalToolRows,
  toolApprovalPolicySentence,
  TOOL_APPROVAL_PRECEDENCE,
} from '@/lib/tool-approval-view';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import AgentPermissionsPage from './page';

const SECURITY_DOC = path.resolve(__dirname, '../../../..', 'docs/security/security.md');

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
});
