import { deriveArtifacts, removeArtifactBlocks } from '@agiworkforce/artifacts';
import type {
  Artifact,
  ChatMessage,
  DeriveMessageArtifacts,
  MessageArtifactDerivationContext,
  MessageArtifactProjection,
} from '@agiworkforce/unified-chat';

const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

export const deriveDesktopMessageArtifacts: DeriveMessageArtifacts = (
  message: ChatMessage,
  context: MessageArtifactDerivationContext,
): MessageArtifactProjection | null => {
  if (message.role !== 'assistant') return null;
  if (!message.content) return null;

  const derived = deriveArtifacts(message.content, {
    conversationId: context.conversationId,
    messageId: message.id,
    include: 'renderable',
    now: message.createdAt ?? message.timestamp ?? EPOCH_ISO,
  }) as Artifact[];

  if (derived.length === 0) return null;

  const byId = new Map<string, Artifact>();
  for (const artifact of derived) byId.set(artifact.id, artifact);
  const extras: Artifact[] = [];
  for (const attached of message.artifacts ?? []) {
    if (byId.has(attached.id)) {
      byId.set(attached.id, attached);
      continue;
    }
    extras.push(attached);
  }

  const artifacts = [...derived.map((a) => byId.get(a.id) ?? a), ...extras];

  return {
    artifacts,
    displayContent: removeArtifactBlocks(message.content, derived),
  };
};
