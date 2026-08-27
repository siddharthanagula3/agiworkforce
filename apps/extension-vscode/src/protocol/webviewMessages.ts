import { z } from 'zod';

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
const getModel = z.object({ type: z.literal('getModel') });
const openSettings = z.object({ type: z.literal('openSettings') });
const openWorkspace = z.object({ type: z.literal('openWorkspace') });
const manageWorkspaceTrust = z.object({ type: z.literal('manageWorkspaceTrust') });
const retryRuntime = z.object({ type: z.literal('retryRuntime') });
const cancel = z.object({ type: z.literal('cancel') });
const shareDiagnostics = z.object({ type: z.literal('shareDiagnostics') });
const clearConversation = z.object({ type: z.literal('clearConversation') });
const openActionSheet = z.object({
  type: z.literal('openActionSheet'),
  payload: z.object({ scope: z.literal('composer') }).optional(),
});
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
const openAccount = z.object({ type: z.literal('openAccount') });
const completeOnboarding = z.object({ type: z.literal('completeOnboarding') });
const openPermissionDocs = z.object({ type: z.literal('openPermissionDocs') });
const openPrivacySettings = z.object({ type: z.literal('openPrivacySettings') });
const openWebTasks = z.object({ type: z.literal('openWebTasks') });

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

const removePendingAttachment = z.object({
  type: z.literal('removePendingAttachment'),
  payload: z.object({ id: z.string().min(1).max(200) }),
});

export const WebviewToExtSchema = z.discriminatedUnion('type', [
  sendMessage,
  ready,
  getModel,
  openSettings,
  openWorkspace,
  manageWorkspaceTrust,
  retryRuntime,
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
  openAccount,
  completeOnboarding,
  openPermissionDocs,
  openPrivacySettings,
  openWebTasks,
  attachFiles,
  removePendingAttachment,
]);

export type WebviewToExtMessage = z.infer<typeof WebviewToExtSchema>;

export function parseWebviewMessage(raw: unknown): WebviewToExtMessage | undefined {
  const result = WebviewToExtSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}
