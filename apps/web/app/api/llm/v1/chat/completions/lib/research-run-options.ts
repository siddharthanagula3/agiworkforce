import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  connectorIdsReadGoogleUserData,
  markConversationGoogleUserData,
} from '@/lib/connectors/google-user-data';
import { notifyResearchReportSettled } from '@/lib/services/agent-notification-service';
import {
  isCloudAgentRunCancellationRequested,
  isCloudAgentRunPauseRequested,
  takeCloudAgentRunSteers,
} from '@/lib/services/cloud-agent-run-service';
import { readResearchConnectorSources } from '@/lib/services/research-connector-source-service';
import {
  saveResearchReport,
  type PersistedResearchReport,
} from '@/lib/services/research-report-service';
import type { ToolApprovalPolicy } from '@shared/types/toolApprovalPolicy';

import {
  scopeConnectorPermissionsToTurn,
  withoutStandingApprovals,
  type ConnectorToolPermissions,
} from './connector-tool-permissions';
import type { ProcessedRequest } from './request-processor';
import type { ResearchLoopOptions } from './research-loop';
import type { ResearchFileSource } from './research-sources';
import type { ToolLoopFailoverPlan } from './tool-loop';

export interface ResearchRunContext {
  processed: ProcessedRequest;
  userId: string;
  runId: string;
  db: DatabaseAdapter;
  connectorIds: readonly string[];
  fileSources: readonly ResearchFileSource[];
  connectorPermissions: ConnectorToolPermissions;
  toolApprovalPolicy: ToolApprovalPolicy;
  signal: AbortSignal;
  failover: ToolLoopFailoverPlan;
  onCancellationRequested?: () => void;
  onReportStored: (report: PersistedResearchReport) => void;
}

/**
 * The verdicts a research turn reads connectors under, and the picked
 * connectors it may read: the same per-chat switches and temporary-chat rules
 * as an ordinary turn, so a connector switched off for the chat is not read
 * because the plan card still lists it.
 */
export function scopeResearchConnectors(
  processed: Pick<ProcessedRequest, 'chatRequest' | 'conversationIsTemporary' | 'researchSources'>,
  saved: ConnectorToolPermissions,
): { permissions: ConnectorToolPermissions; connectorIds: string[] } {
  const permissions = scopeConnectorPermissionsToTurn(saved, {
    temporary: processed.conversationIsTemporary === true,
    disabledConnectorIds: processed.chatRequest.disabled_connector_ids,
  });
  return {
    permissions,
    connectorIds: (processed.researchSources?.connectors ?? []).filter(
      (connectorId) => !permissions.isConnectorDenied(connectorId),
    ),
  };
}

export function buildResearchRunOptions(context: ResearchRunContext): ResearchLoopOptions {
  const { processed, userId, runId, db } = context;
  const resume = processed.researchResume;
  const connectorIds = [...context.connectorIds];
  return {
    persistReport: async (report) => {
      const stored: PersistedResearchReport = {
        ...(await saveResearchReport(db, {
          userId,
          requestId: processed.requestId,
          conversationId: processed.conversationId ?? null,
          model: processed.chatRequest.model,
          provider: processed.provider,
          ...report,
        })),
        deliverable: report.deliverable,
        sourceSelection: report.sourceSelection,
      };
      context.onReportStored(stored);
      await notifyResearchReportSettled(db, {
        userId,
        reportId: stored.id,
        requestId: processed.requestId,
        title: stored.title || stored.query,
        status: stored.status,
        sourcesConsulted: stored.sourcesConsulted,
      });
      return stored;
    },
    ...(resume
      ? {
          priorSources: resume.sources.map((source) => ({
            url: source.url,
            title: source.title ?? source.url,
            ...(source.snippet ? { snippet: source.snippet } : {}),
            ...(source.retrieved_at ? { retrievedAt: source.retrieved_at } : {}),
          })),
          priorSteps: resume.steps,
          approvedPlan: resume.approvedSteps,
          deliverable: resume.deliverable,
          ...(resume.guidance ? { guidance: resume.guidance } : {}),
        }
      : {}),
    requirePlanApproval: (resume?.approvedSteps.length ?? 0) === 0,
    domainPolicy: processed.webSearchDomainPolicy ?? null,
    sources: {
      files: processed.researchSources?.files ?? false,
      allowDomains: processed.researchSources?.allowDomains ?? [],
      denyDomains: processed.researchSources?.denyDomains ?? [],
      connectors: connectorIds,
    },
    ...(connectorIds.length > 0
      ? {
          readConnectorSources: async (queries: readonly string[]) => {
            if (
              processed.conversationId &&
              (await connectorIdsReadGoogleUserData(
                db,
                userId,
                processed.organizationId ?? null,
                connectorIds,
              ))
            ) {
              await markConversationGoogleUserData(db, userId, processed.conversationId);
            }
            return readResearchConnectorSources({
              userId,
              organizationId: processed.organizationId ?? null,
              planTier: processed.subscriptionTier ?? null,
              connectorIds,
              queries,
              isToolDenied: context.connectorPermissions.isConnectorToolDenied,
              googleUserDataRouted: processed.googleUserData === true,
              signal: context.signal,
            });
          },
        }
      : {}),
    fileSources: context.fileSources,
    toolApprovalPolicy: context.toolApprovalPolicy,
    connectorPermissions: processed.conversationIsTemporary
      ? withoutStandingApprovals(context.connectorPermissions)
      : context.connectorPermissions,
    isCancellationRequested: async () => {
      const cancelled = await isCloudAgentRunCancellationRequested(db, { userId, runId });
      if (cancelled) context.onCancellationRequested?.();
      return cancelled;
    },
    isPauseRequested: () => isCloudAgentRunPauseRequested(db, { userId, runId }),
    takeSteerMessages: () =>
      takeCloudAgentRunSteers(db, {
        userId,
        organizationId: processed.organizationId ?? null,
        runId,
      }),
    signal: context.signal,
    failover: context.failover,
  };
}
