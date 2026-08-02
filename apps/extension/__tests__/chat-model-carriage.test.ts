/**
 * AUTO-ROUTER-MIGRATION-01 (Chrome) regression pins.
 *
 * The side-panel model picker is only honest if the selection the user sees
 * travels the full wire: side panel → typed CHAT_MESSAGE → background
 * handleChatMessage → executeChromeManagedChat → canonical resolver. A
 * dropped field at any hop silently diverges what executes from what the
 * picker shows. These tests pin every hop at the source level (same
 * static-AST style as security-fixes H-10) plus the cloud-only trust facts
 * of the Chrome routing adapter.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTING_FIELDS = [
  'modelSelection',
  'quickMode',
  'effort',
  'currentModelKey',
  'previousTaskType',
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('side panel carries the visible model selection on every CHAT_MESSAGE', () => {
  const sidePanelSource = readFileSync(join(__dirname, '..', 'src', 'side_panel.ts'), 'utf8');

  it('every CHAT_MESSAGE send site includes the routing carriage fields', () => {
    // Capture each payload object from the CHAT_MESSAGE tag to the response
    // callback that terminates every side-panel send site.
    const sendSites = sidePanelSource.match(/type:\s*'CHAT_MESSAGE'[\s\S]*?\(response\?:/g);
    // Both the page-capture (slash command) path and the normal path.
    expect(sendSites?.length).toBe(2);
    for (const site of sendSites ?? []) {
      const codeOnly = stripComments(site);
      expect(codeOnly).toMatch(/modelSelection:\s*_ctx\.selectedModel/);
      expect(codeOnly).toMatch(/quickMode:\s*_ctx\.quickMode/);
      expect(codeOnly).toContain('...managedOutboundRoutingPayload()');
      expect(codeOnly).not.toMatch(/effort:\s*_ctx\.reasoningEffort/);
    }
  });

  it('omits prior route and effort from every Quick request envelope', () => {
    const start = sidePanelSource.indexOf('function managedOutboundRoutingPayload');
    const end = sidePanelSource.indexOf('// Provider display order', start);
    const helper = stripComments(sidePanelSource.slice(start, end));

    expect(helper).toContain('if (_ctx.quickMode) return {};');
    expect(helper).toContain('...managedOutboundEffortPayload()');
    expect(helper).toMatch(/currentModelKey:\s*_ctx\.currentModelKey/);
    expect(helper).toMatch(/previousTaskType:\s*_ctx\.previousTaskType/);
  });
});

describe('durable Managed Cloud resume carries the resolved route', () => {
  const sidePanelSource = readFileSync(join(__dirname, '..', 'src', 'side_panel.ts'), 'utf8');
  const backgroundSource = readFileSync(join(__dirname, '..', 'src', 'background.ts'), 'utf8');

  it('puts the concrete model, task, and reconciled effort on RESUME_CHAT_RUN', () => {
    const start = sidePanelSource.indexOf('function resumeManagedCloudRun');
    const end = sidePanelSource.indexOf('function cancelCurrentManagedStream', start);
    const body = stripComments(sidePanelSource.slice(start, end));

    expect(body).toContain("type: 'RESUME_CHAT_RUN'");
    expect(body).toMatch(/modelKey:\s*_ctx\.currentModelKey/);
    expect(body).toMatch(/taskType:\s*_ctx\.previousTaskType/);
    expect(body).toContain('...managedOutboundEffortPayload(true)');
  });

  it('validates and rebroadcasts the restored route before and after durable replay', () => {
    const start = backgroundSource.indexOf('async function handleResumeChatRun');
    const end = backgroundSource.indexOf('async function handleResolveChatApproval', start);
    const body = stripComments(backgroundSource.slice(start, end));

    expect(body).toContain('normalizeChromeManagedRoutingMetadata');
    expect(body).toMatch(/done:\s*false,\s*routing/);
    expect(body.match(/routing \? \{ routing \} : \{\}/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('background forwards the carried selection to the managed owner', () => {
  const backgroundSource = readFileSync(join(__dirname, '..', 'src', 'background.ts'), 'utf8');

  function handleChatMessageBody(): string {
    const start = backgroundSource.indexOf('async function handleChatMessage');
    if (start < 0) return '';
    const end = backgroundSource.indexOf('async function handleInPagePrompt', start);
    return end > start ? backgroundSource.slice(start, end) : backgroundSource.slice(start);
  }

  it('handleChatMessage forwards every routing carriage field from the wire message', () => {
    const body = stripComments(handleChatMessageBody());
    expect(body).toContain('executeChromeManagedChat');
    for (const field of ROUTING_FIELDS) {
      expect(body).toMatch(new RegExp(`${field}:\\s*message\\.${field}`));
    }
  });
});

describe('Chrome routing adapter is managed-cloud-only and canonically classified', () => {
  const adapterSource = readFileSync(
    join(__dirname, '..', 'src', 'features', 'cloud-bridge', 'managedChatRouting.ts'),
    'utf8',
  );
  const codeOnly = stripComments(adapterSource);

  it('classifies every Auto turn through the canonical classifier', () => {
    expect(codeOnly).toContain('classifyTaskLocally(');
    expect(codeOnly).toContain("from '@agiworkforce/routing'");
  });

  it('pins the managed_cloud trust mode and the chrome/managed-chat runtime profile', () => {
    expect(codeOnly).toMatch(/trustMode:\s*'managed_cloud'/);
    expect(codeOnly).toMatch(/runtimeProfileId:\s*'chrome\/managed-chat'/);
    // The Chrome-cloud-only matrix: no other trust mode may be admitted here.
    expect(codeOnly).not.toContain("'local'");
    expect(codeOnly).not.toContain("'byok'");
  });

  it('never documents or installs a local-bridge inference fallback in background chat paths', () => {
    const backgroundSource = readFileSync(join(__dirname, '..', 'src', 'background.ts'), 'utf8');
    const start = backgroundSource.indexOf('async function handleChatMessage');
    const chatRegion = backgroundSource.slice(start);
    // Comments count here on purpose: a doc block describing a localhost
    // bridge fallback chain is exactly what invites one back in.
    expect(chatRegion).not.toContain('localhost:8787');
    expect(chatRegion).not.toMatch(/native chain as CHAT_MESSAGE/);
  });
});
