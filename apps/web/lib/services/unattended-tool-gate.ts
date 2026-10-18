import 'server-only';

import type { ConnectorToolPermissions } from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
import { resolveToolCallGate } from '@/app/api/llm/v1/chat/completions/lib/tool-call-gate';
import type { ToolApprovalPolicy } from '@shared/types/toolApprovalPolicy';

export function runsUnattendedWithoutAsking(
  qualifiedName: string,
  toolApprovalPolicy: ToolApprovalPolicy,
  connectorPermissions: ConnectorToolPermissions,
): boolean {
  return (
    resolveToolCallGate(
      {
        qualifiedName,
        savedLevel: connectorPermissions.levelFor(qualifiedName),
        batchIntroducesUntrustedContent: false,
      },
      {
        approvalMode: 'manual',
        toolApprovalPolicy,
        unattended: true,
        deviceHostPresent: false,
        untrustedContentInContext: false,
        sensitiveSourceAvailable: false,
      },
    ).verdict === 'allow'
  );
}
