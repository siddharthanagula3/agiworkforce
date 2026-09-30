import { z } from 'zod';
import { REMOTE_CODE_LIMITS } from '@agiworkforce/types';

export const AgentModeSchema = z.enum(['ask', 'auto', 'plan', 'bypass']);
export const EffortSchema = z.enum(['low', 'medium', 'high', 'max']);

const sendMessage = z.object({
  type: z.literal('sendMessage'),
  payload: z.object({
    text: z.string().min(1).max(100_000),
    model: z.string().min(1).max(200).optional(),
    browseWeb: z.boolean().optional(),
    followUpBehavior: z.enum(['queue', 'steer']).optional(),
    clientMessageId: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9._-]+$/u)
      .optional(),
    references: z
      .array(
        z.object({
          path: z.string().min(1).max(4096),
          range: z
            .object({
              startLine: z.number().int().nonnegative(),
              startCharacter: z.number().int().nonnegative(),
              endLine: z.number().int().nonnegative(),
              endCharacter: z.number().int().nonnegative(),
            })
            .optional(),
        }),
      )
      .max(50)
      .optional(),
  }),
});

const ready = z.object({ type: z.literal('ready') });
const viewFocused = z.object({ type: z.literal('viewFocused') });
const setUpWebSearch = z.object({ type: z.literal('setUpWebSearch') });
const reconnectMcpServer = z.object({
  type: z.literal('reconnectMcpServer'),
  payload: z.object({ server: z.string().min(1).max(200) }),
});
const getModel = z.object({ type: z.literal('getModel') });
const openSettings = z.object({ type: z.literal('openSettings') });
const openWorkspace = z.object({ type: z.literal('openWorkspace') });
const manageWorkspaceTrust = z.object({ type: z.literal('manageWorkspaceTrust') });
const retryRuntime = z.object({ type: z.literal('retryRuntime') });
const installCli = z.object({ type: z.literal('installCli') });
const cancel = z.object({ type: z.literal('cancel') });
const shareDiagnostics = z.object({ type: z.literal('shareDiagnostics') });
const clearConversation = z.object({ type: z.literal('clearConversation') });
const openActionSheet = z.object({ type: z.literal('openActionSheet') });
const openModePicker = z.object({ type: z.literal('openModePicker') });
const openEffortPicker = z.object({ type: z.literal('openEffortPicker') });
const dismissUsageMeter = z.object({ type: z.literal('dismissUsageMeter') });
const restoreUsageMeter = z.object({ type: z.literal('restoreUsageMeter') });
const upgradeClicked = z.object({ type: z.literal('upgradeClicked') });
const manageBilling = z.object({ type: z.literal('manageBilling') });
const openModelPopover = z.object({ type: z.literal('openModelPopover') });
const openFilePicker = z.object({ type: z.literal('openFilePicker') });
const openHistory = z.object({ type: z.literal('openHistory') });
const newChat = z.object({ type: z.literal('newChat') });
const openArchivedSessions = z.object({ type: z.literal('openArchivedSessions') });
const messageAction = z.object({
  type: z.literal('messageAction'),
  payload: z.object({
    action: z.enum(['resend', 'branch', 'branchAnswer']),
    text: z.string().min(1).max(1_000_000),
    occurrence: z.number().int().nonnegative().max(10_000),
  }),
});
const planDecision = z.object({
  type: z.literal('planDecision'),
  payload: z.discriminatedUnion('decision', [
    z.object({ decision: z.literal('approve') }),
    z.object({ decision: z.literal('reject'), feedback: z.string().trim().min(1).max(4_000) }),
  ]),
});
const searchSessions = z.object({
  type: z.literal('searchSessions'),
  payload: z.object({ query: z.string().trim().min(2).max(200) }),
});
const openAccount = z.object({ type: z.literal('openAccount') });
const completeOnboarding = z.object({ type: z.literal('completeOnboarding') });
const openPermissionDocs = z.object({ type: z.literal('openPermissionDocs') });
const openPrivacySettings = z.object({ type: z.literal('openPrivacySettings') });
const openRecentConversation = z.object({
  type: z.literal('openRecentConversation'),
  payload: z.object({ threadId: z.string().min(1) }),
});
export const CONTEXT_ATTACHMENT_KINDS = [
  'selection',
  'open-files',
  'problems',
  'git-diff',
  'url',
] as const;
export const ContextAttachmentKindSchema = z.enum(CONTEXT_ATTACHMENT_KINDS);
export type ContextAttachmentKind = z.infer<typeof ContextAttachmentKindSchema>;

const requestContextMenuState = z.object({ type: z.literal('requestContextMenuState') });
const attachContext = z.object({
  type: z.literal('attachContext'),
  payload: z.object({ kind: ContextAttachmentKindSchema }),
});

const openPathReference = z.object({
  type: z.literal('openPathReference'),
  payload: z.object({
    path: z.string().min(1).max(1024),
    line: z.number().int().positive().max(1_000_000).optional(),
    column: z.number().int().positive().max(1_000_000).optional(),
  }),
});

const attachFiles = z.object({
  type: z.literal('attachFiles'),
  payload: z.object({
    files: z
      .array(
        z.object({
          name: z
            .string()
            .min(1)
            .max(255)
            .refine((value) => !value.includes('/') && !value.includes('\\'), {
              message: 'Filename must not contain path separators',
            }),
          mimeType: z.string().min(1).max(200),
          sizeBytes: z.number().int().min(0).max(10_000_000),
          dataUrl: z
            .string()
            .min(1)
            .max(15_000_000)
            .refine((value) => value.startsWith('data:'), {
              message: 'Expected a data: URL',
            }),
        }),
      )
      .min(1)
      .max(8),
  }),
});

const fileSearch = z.object({
  type: z.literal('fileSearch'),
  payload: z.object({
    query: z.string().min(1).max(500),
  }),
});

const setMode = z.object({
  type: z.literal('setMode'),
  payload: z.object({ mode: AgentModeSchema }),
});

const setEffort = z.object({
  type: z.literal('setEffort'),
  payload: z.object({ effort: EffortSchema }),
});

const selectModel = z.object({
  type: z.literal('selectModel'),
  payload: z.object({ modelId: z.string().min(1).max(200) }),
});

const proposeDiff = z.object({
  type: z.literal('proposeDiff'),
  payload: z.object({
    code: z.string().max(500_000),
    language: z.string().max(100),
  }),
});

const clearActiveProject = z.object({ type: z.literal('clearActiveProject') });

const openSurface = z.object({
  type: z.literal('openSurface'),
  payload: z.object({ surfaceId: z.string().min(1).max(64) }),
});

const requestSessions = z.object({
  type: z.literal('requestSessions'),
  payload: z.object({ source: z.enum(['local', 'cloud']) }),
});

const openSessionRow = z.object({
  type: z.literal('openSessionRow'),
  payload: z.object({
    id: z.string().min(1).max(200),
    source: z.enum(['local', 'cloud', 'cloud-code']),
  }),
});

const requestSlashCommands = z.object({ type: z.literal('requestSlashCommands') });
const continueInCloud = z.object({ type: z.literal('continueInCloud') });
const regenerate = z.object({ type: z.literal('regenerate') });
const cancelQueuedMessage = z.object({
  type: z.literal('cancelQueuedMessage'),
  payload: z.object({ clientMessageId: z.string().min(1).max(200) }),
});
const openSuggestedProject = z.object({
  type: z.literal('openSuggestedProject'),
  payload: z.object({ projectId: z.string().min(1).max(200) }),
});

const runSlashCommand = z.object({
  type: z.literal('runSlashCommand'),
  payload: z.object({ name: z.string().min(1).max(120) }),
});

const reviewApprovalChange = z.object({
  type: z.literal('reviewApprovalChange'),
  payload: z.object({ requestId: z.string().min(1).max(200) }),
});

const rateAnswer = z.object({
  type: z.literal('rateAnswer'),
  payload: z.object({
    key: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9-]+$/u),
    text: z.string().min(1).max(500_000),
    rating: z.enum(['up', 'down']).nullable(),
  }),
});

export const APPROVAL_DECISIONS = ['once', 'session', 'always', 'deny', 'abort'] as const;
export const ApprovalDecisionSchema = z.enum(APPROVAL_DECISIONS);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

const respondToApproval = z.object({
  type: z.literal('respondToApproval'),
  payload: z.object({
    requestId: z.string().min(1).max(200),
    decision: ApprovalDecisionSchema,
    guidance: z.string().trim().min(1).max(REMOTE_CODE_LIMITS.guidanceLength).optional(),
    answer: z.string().trim().min(1).max(REMOTE_CODE_LIMITS.guidanceLength).optional(),
  }),
});

const resolveTurnFailure = z.object({
  type: z.literal('resolveTurnFailure'),
  payload: z.object({
    kind: z.enum([
      'sign-in-provider',
      'sign-in-account',
      'upgrade-plan',
      'open-settings',
      'switch-model',
      'update-extension',
      'open-recovery',
    ]),
    provider: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
  }),
});

const openToolDiff = z.object({
  type: z.literal('openToolDiff'),
  payload: z.object({ path: z.string().min(1).max(4096) }),
});

const dismissEditorContext = z.object({
  type: z.literal('dismissEditorContext'),
  payload: z.object({ id: z.string().min(1).max(2048) }),
});

const removePendingAttachment = z.object({
  type: z.literal('removePendingAttachment'),
  payload: z.object({ id: z.string().min(1).max(200) }),
});

export const WebviewToExtSchema = z.discriminatedUnion('type', [
  sendMessage,
  ready,
  viewFocused,
  setUpWebSearch,
  reconnectMcpServer,
  getModel,
  openSettings,
  openWorkspace,
  manageWorkspaceTrust,
  retryRuntime,
  installCli,
  cancel,
  fileSearch,
  shareDiagnostics,
  clearConversation,
  openActionSheet,
  openModePicker,
  openEffortPicker,
  setMode,
  setEffort,
  dismissUsageMeter,
  restoreUsageMeter,
  upgradeClicked,
  manageBilling,
  openModelPopover,
  selectModel,
  proposeDiff,
  openFilePicker,
  openHistory,
  newChat,
  openArchivedSessions,
  searchSessions,
  messageAction,
  planDecision,
  openAccount,
  completeOnboarding,
  openPermissionDocs,
  openPrivacySettings,
  openRecentConversation,
  openPathReference,
  requestContextMenuState,
  attachContext,
  dismissEditorContext,
  openToolDiff,
  resolveTurnFailure,
  respondToApproval,
  attachFiles,
  removePendingAttachment,
  clearActiveProject,
  openSurface,
  requestSessions,
  openSessionRow,
  requestSlashCommands,
  runSlashCommand,
  continueInCloud,
  regenerate,
  cancelQueuedMessage,
  openSuggestedProject,
  rateAnswer,
  reviewApprovalChange,
]);

export type WebviewToExtMessage = z.infer<typeof WebviewToExtSchema>;

export function parseWebviewMessage(raw: unknown): WebviewToExtMessage | undefined {
  const result = WebviewToExtSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}

/**
 * Which webview a message came from, and which conversation it was written
 * against. A panel keeps running while the conversation under it is replaced,
 * so a send composed before New Chat would otherwise arrive as the first turn
 * of the conversation that replaced it.
 */
export const SessionBindingSchema = z.object({
  origin: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/u),
  epoch: z.number().int().nonnegative(),
});

export type SessionBinding = z.infer<typeof SessionBindingSchema>;

export function parseBoundWebviewMessage(
  raw: unknown,
  current: SessionBinding,
): WebviewToExtMessage | undefined {
  const binding = SessionBindingSchema.safeParse(raw);
  if (!binding.success) return undefined;
  if (binding.data.origin !== current.origin) return undefined;
  if (binding.data.epoch !== current.epoch) return undefined;
  return parseWebviewMessage(raw);
}
