import type { ChatMessage } from '@agiworkforce/unified-chat';
import { hasExplicitWebFetchIntent, hasExplicitWebSearchIntent } from '@agiworkforce/search';
import { hasExplicitCodeExecutionIntent } from '@/lib/code-execution/explicit-execution-intent';
import { evaluateModelCompatibility } from '../components/Composer/model-compatibility';

const BLOCKING_COMPATIBILITY_CODES = new Set([
  'unknown_model',
  'no_vision',
  'no_tools',
  'no_attachments',
]);

export function hasCompatibleFreeErrorRecoveryModel(
  userMessage: ChatMessage | undefined,
  failedModelId: string | undefined,
  options: readonly { id: string }[] | undefined,
): boolean {
  if (!userMessage) return true;

  const attachments = userMessage.attachments ?? [];
  const replay = (
    userMessage.metadata as
      | {
          sendReplay?: {
            webSearchEnabled?: boolean;
            codeExecutionEnabled?: boolean;
            officeCreationEnabled?: boolean;
            hasSkillInstruction?: boolean;
            workMode?: string;
          };
        }
      | undefined
  )?.sendReplay;
  const needsTools = Boolean(
    replay?.webSearchEnabled ||
    replay?.codeExecutionEnabled ||
    replay?.officeCreationEnabled ||
    replay?.hasSkillInstruction ||
    replay?.workMode === 'agiwork' ||
    hasExplicitWebSearchIntent(userMessage.content) ||
    hasExplicitWebFetchIntent(userMessage.content) ||
    hasExplicitCodeExecutionIntent(userMessage.content),
  );

  if (attachments.length === 0 && !needsTools) return true;
  if (!failedModelId) return false;

  return (
    options?.some((option) => {
      if (option.id === failedModelId) return false;
      const compatibility = evaluateModelCompatibility(option.id, {
        messages: [],
        hasImages: attachments.some((attachment) => attachment.type.startsWith('image/')),
        hasAttachments: attachments.length > 0,
        hasNonImageAttachments: attachments.some(
          (attachment) => !attachment.type.startsWith('image/'),
        ),
        needsTools,
      });
      return compatibility.findings.every(
        (finding) => !BLOCKING_COMPATIBILITY_CODES.has(finding.code),
      );
    }) ?? false
  );
}
