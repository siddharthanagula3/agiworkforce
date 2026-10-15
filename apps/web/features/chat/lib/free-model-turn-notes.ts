import type { FreeModelHandoffReasonCode } from '@/lib/chat-fallback-reason';
import { freeQuotaChatOffering } from './free-model-handoff';

export type FreeModelTurnNoteId =
  'handoff' | 'project' | 'attachments' | 'connectors' | 'reasoning';

export interface FreeModelTurnNote {
  id: FreeModelTurnNoteId;
  text: string;
}

const HANDOFF_CAUSE: Readonly<Record<FreeModelHandoffReasonCode, string>> = {
  free_model_research: 'Deep Research is on',
  free_model_web_search: 'it asks for a web search',
  free_model_code_execution: 'it asks to run code',
  free_model_office_file: 'it asks for an Office file',
  free_model_skill: 'it uses a skill',
  free_model_connected_app: 'it uses a connected app',
  free_model_file: 'it has a file this free model cannot read',
  free_model_image: 'it has an image this free model cannot read',
};

// A handed-over message is answered by Auto, which does use the project, the
// earlier attachments and the connected apps, so it carries the hand-over line
// only: any other line would be false for that message.
export function freeModelTurnNotes(input: {
  modelId: string | null | undefined;
  handoffReason: FreeModelHandoffReasonCode | null;
  autoModelName: string;
  inProject: boolean;
  earlierAttachments: boolean;
  connectorsOn: boolean;
}): FreeModelTurnNote[] {
  const offering = freeQuotaChatOffering(input.modelId);
  if (!offering) return [];
  if (input.handoffReason) {
    return [
      {
        id: 'handoff',
        text: `${input.autoModelName} will answer this message because ${HANDOFF_CAUSE[input.handoffReason]}. ${offering.displayName} stays selected.`,
      },
    ];
  }
  return [
    ...(input.inProject
      ? [
          {
            id: 'project' as const,
            text: "Free models can use this project's instructions and relevant file excerpts. Excerpts from its other chats are sent only when Search past chats is on in Settings, Memory.",
          },
        ]
      : []),
    ...(input.earlierAttachments
      ? [
          {
            id: 'attachments' as const,
            text: `Free models do not read the files or images on earlier messages in this chat. Attach one again with your message, or choose ${input.autoModelName} to keep working with them.`,
          },
        ]
      : []),
    ...(input.connectorsOn
      ? [
          {
            id: 'connectors' as const,
            text: 'Free models do not use connected apps, so the ones switched on here are not used for this message.',
          },
        ]
      : []),
    ...(offering.quotaThinkingRequired
      ? [
          {
            id: 'reasoning' as const,
            text: 'This free model reasons before it answers. Its reasoning is not shown.',
          },
        ]
      : []),
  ];
}
