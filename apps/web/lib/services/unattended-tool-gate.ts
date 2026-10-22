import 'server-only';

import {
  decisionTimeConnectorLevel,
  type ConnectorToolPermissions,
} from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
import { resolveToolCallGate } from '@/app/api/llm/v1/chat/completions/lib/tool-call-gate';
import {
  toolRiskTier,
  type ToolAnnotations,
} from '@/app/api/llm/v1/chat/completions/lib/tool-metadata';
import type { ToolApprovalPolicy } from '@shared/types/toolApprovalPolicy';

export function runsUnattendedWithoutAsking(
  qualifiedName: string,
  toolApprovalPolicy: ToolApprovalPolicy,
  connectorPermissions: ConnectorToolPermissions,
  annotations?: ToolAnnotations,
): boolean {
  return (
    resolveToolCallGate(
      {
        qualifiedName,
        savedLevel: decisionTimeConnectorLevel(
          connectorPermissions,
          qualifiedName,
          toolRiskTier(qualifiedName, annotations),
        ),
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
