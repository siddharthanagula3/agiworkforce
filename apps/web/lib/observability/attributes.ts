import { deployEnvironment, deployRegion, deploymentId, releaseSha } from '@/lib/server/hosting';

export const OBSERVABILITY_ATTRIBUTE = {
  sessionId: 'session.id',
  turnId: 'agi.turn.id',
  runId: 'agi.run.id',
  surface: 'agi.surface',
  toolName: 'gen_ai.tool.name',
  toolCallId: 'gen_ai.tool.call.id',
  toolCategory: 'agi.tool.category',
  toolStatus: 'agi.tool.status',
  providerName: 'gen_ai.provider.name',
  requestModel: 'gen_ai.request.model',
  responseModel: 'gen_ai.response.model',
  providerRequestId: 'agi.provider.request_id',
  queueName: 'messaging.destination.name',
  queueJobId: 'messaging.message.id',
  browserTaskId: 'agi.browser.task_id',
  browserTaskStatus: 'agi.browser.status',
  notificationChannel: 'agi.notification.channel',
  notificationOutcome: 'agi.notification.outcome',
  notificationReason: 'agi.notification.reason',
  remoteSessionId: 'agi.remote.session_id',
  remoteDeviceId: 'agi.remote.device_id',
  failureKind: 'agi.failure.kind',
  errorType: 'error.type',
  serviceVersion: 'service.version',
  deploymentId: 'deployment.id',
  deploymentEnvironment: 'deployment.environment.name',
  cloudRegion: 'cloud.region',
  clientVersion: 'agi.client.version',
  dataRegion: 'agi.data.region',
  trustMode: 'agi.trust_mode',
  routeId: 'agi.route.id',
  routingCohort: 'agi.routing.cohort',
  routingStatus: 'agi.routing.status',
  configurationComponent: 'agi.configuration.component',
  configurationState: 'agi.configuration.state',
} as const;

export type ObservabilityAttribute =
  (typeof OBSERVABILITY_ATTRIBUTE)[keyof typeof OBSERVABILITY_ATTRIBUTE];

export type DeploymentAttributes = Readonly<Record<string, string>>;

type HostingEnvironment = Record<string, string | undefined>;

function buildDeploymentAttributes(env: HostingEnvironment): DeploymentAttributes {
  const attributes: Record<string, string> = {};
  const version = releaseSha(env);
  const id = deploymentId(env);
  const environment = deployEnvironment(env);
  const region = deployRegion(env);
  if (version) attributes[OBSERVABILITY_ATTRIBUTE.serviceVersion] = version;
  if (id) attributes[OBSERVABILITY_ATTRIBUTE.deploymentId] = id;
  if (environment) attributes[OBSERVABILITY_ATTRIBUTE.deploymentEnvironment] = environment;
  if (region) attributes[OBSERVABILITY_ATTRIBUTE.cloudRegion] = region;
  return Object.freeze(attributes);
}

let cachedForProcessEnv: DeploymentAttributes | null = null;

/**
 * The build and the place that emitted a signal. Every metric carries it, so an
 * error rate can be split by release and a spike attributed to the deploy that
 * caused it. An unset value is omitted rather than reported as 'unknown': a
 * made-up version groups a signal under a build that was never shipped.
 */
export function deploymentAttributes(env?: HostingEnvironment): DeploymentAttributes {
  if (env) return buildDeploymentAttributes(env);
  cachedForProcessEnv ??= buildDeploymentAttributes(process.env);
  return cachedForProcessEnv;
}

export function resetDeploymentAttributesCache(): void {
  cachedForProcessEnv = null;
}
