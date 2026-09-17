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
} as const;

export type ObservabilityAttribute =
  (typeof OBSERVABILITY_ATTRIBUTE)[keyof typeof OBSERVABILITY_ATTRIBUTE];
