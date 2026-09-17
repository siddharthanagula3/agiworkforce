import { UNTRUSTED_MEMORY_CONTEXT_RULES, fenceUntrustedContent } from '@agiworkforce/utils';
import {
  isScreenDeviceStep,
  offeredDeviceStepTools,
  type DesktopCapability,
  type DesktopHostDeclaration,
} from '@agiworkforce/local-runtime-contract';

import { validateHttpsMcpUrl } from '@/lib/mcp-url-validation';
import { secretPatternScanner } from '@/lib/security/outbound-content-inspection';
import {
  findPoisonedDirective,
  inspectConnectorToolDefs,
} from '@/lib/security/mcp-tool-inspection';
import { classifyCommandRisk } from '@/lib/services/cloud-code-agent-tools';

import type { RedTeamCase, RedTeamCategory } from './corpus';

/**
 * Routes one corpus case to the production function that is supposed to refuse
 * it. Nothing here re-implements a check: a category maps onto a call the
 * request path already makes, so a defence that is weakened shows up as a
 * corpus case that stops being refused.
 */

export interface RedTeamVerdict {
  refused: boolean;
  defence: string;
  detail: string;
}

export const CATEGORY_DEFENCES: Readonly<Record<RedTeamCategory, string>> = {
  'prompt-injection': '@agiworkforce/utils fenceUntrustedContent',
  'tool-poisoning': 'lib/security/mcp-tool-inspection findPoisonedDirective',
  'cross-tool-escalation': 'lib/security/mcp-tool-inspection inspectConnectorToolDefs',
  'remote-control': '@agiworkforce/local-runtime-contract offeredDeviceStepTools',
  'computer-use': '@agiworkforce/local-runtime-contract offeredDeviceStepTools',
  'browser-use': 'lib/mcp-url-validation validateHttpsMcpUrl',
  'agent-command': 'lib/services/cloud-code-agent-tools classifyCommandRisk',
  exfiltration: 'lib/security/outbound-content-inspection secretPatternScanner',
};

function declaration(granted: readonly DesktopCapability[], roots: number): DesktopHostDeclaration {
  return {
    deviceId: 'red-team-device',
    deviceName: 'Red team desktop',
    platform: 'darwin',
    appVersion: '0.0.0',
    capabilities: [...granted],
    roots: Array.from({ length: roots }, (_unused, index) => ({
      id: `root-${index}`,
      name: `Folder ${index}`,
      path: `/Users/qa/projects/${index}`,
    })),
  };
}

export async function runRedTeamCase(entry: RedTeamCase): Promise<RedTeamVerdict> {
  const defence = CATEGORY_DEFENCES[entry.category];

  switch (entry.category) {
    case 'prompt-injection': {
      const fenced = fenceUntrustedContent(
        entry.untrusted,
        'tool_result',
        UNTRUSTED_MEMORY_CONTEXT_RULES,
      );
      // Only the body between the sentinel and the fence's own closing tag is
      // attacker-controlled; the wrapper the fence writes is not a leak.
      const body = fenced.slice(fenced.indexOf('-->') + 3, fenced.lastIndexOf('\n</tool_result>'));
      const leaked = entry.forbidden.filter((needle) => body.includes(needle));
      return {
        refused: leaked.length === 0,
        defence,
        detail:
          leaked.length === 0 ? 'neutralised inside the fence' : `leaked ${leaked.join(', ')}`,
      };
    }

    case 'tool-poisoning': {
      const label = findPoisonedDirective(entry.description);
      return {
        refused: label !== null,
        defence,
        detail: label ?? 'no directive matched',
      };
    }

    case 'cross-tool-escalation': {
      const { rejected } = inspectConnectorToolDefs([...entry.tools]);
      return {
        refused: rejected.length > 0,
        defence,
        detail: rejected.map((item) => `${item.toolName}: ${item.reason}`).join('; ') || 'allowed',
      };
    }

    case 'remote-control':
    case 'computer-use': {
      const offered = offeredDeviceStepTools(declaration(entry.granted, entry.roots));
      const refused = !(offered as readonly string[]).includes(entry.withheld);
      const scope = isScreenDeviceStep(entry.withheld) ? 'screen' : 'workspace';
      return {
        refused,
        defence,
        detail: refused
          ? `${entry.withheld} (${scope}) was not offered`
          : `${entry.withheld} was offered anyway`,
      };
    }

    case 'browser-use': {
      try {
        await validateHttpsMcpUrl(entry.url);
        return { refused: false, defence, detail: 'accepted the url' };
      } catch (error) {
        return { refused: true, defence, detail: (error as Error).message };
      }
    }

    case 'agent-command': {
      const { risk } = classifyCommandRisk(entry.command);
      return {
        refused: risk !== 'safe',
        defence,
        detail: `classified ${risk}`,
      };
    }

    case 'exfiltration': {
      const findings = await secretPatternScanner.scan({
        channel: 'artifact_publish',
        value: entry.content,
      });
      return {
        refused: findings.length > 0,
        defence,
        detail: findings.map((finding) => finding.name).join(', ') || 'no finding',
      };
    }
  }
}
