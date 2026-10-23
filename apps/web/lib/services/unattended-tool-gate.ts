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

export interface UnattendedRunTrust {
  untrustedContentInContext: boolean;
  sensitiveSourceAvailable: boolean;
}

const TRUSTED_RUN: UnattendedRunTrust = {
  untrustedContentInContext: false,
  sensitiveSourceAvailable: false,
};

export function runsUnattendedWithoutAsking(
  qualifiedName: string,
  toolApprovalPolicy: ToolApprovalPolicy,
  connectorPermissions: ConnectorToolPermissions,
  annotations?: ToolAnnotations,
  trust: UnattendedRunTrust = TRUSTED_RUN,
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
        untrustedContentInContext: trust.untrustedContentInContext,
        sensitiveSourceAvailable: trust.sensitiveSourceAvailable,
      },
    ).verdict === 'allow'
  );
}
