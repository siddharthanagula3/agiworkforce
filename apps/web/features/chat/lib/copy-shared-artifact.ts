'use client';

import { z } from 'zod';
import { computeDerivedArtifactId, extractCodeBlocks } from '@agiworkforce/artifacts';
import {
  ManagedCloudCreateConversationResponseSchema,
  ManagedCloudMessageWireSchema,
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import type { RequestAuthority } from '@/lib/identity/request-authority';
import type { ArtifactData } from '@features/chat/components/artifacts/ArtifactPreview';
import type { PublishedArtifactKind } from '@features/chat/components/artifacts/publishedArtifactRender';
import type { Artifact } from '@features/chat/stores/artifacts-store';

const ARTIFACT_TYPE_BY_KIND: Record<PublishedArtifactKind, ArtifactData['type']> = {
  html: 'html',
  react: 'react',
  svg: 'svg',
  mermaid: 'mermaid',
  markdown: 'document',
  text: 'document',
  code: 'code',
};

const SavedMessagesSchema = z.object({
  messages: z.array(ManagedCloudMessageWireSchema).length(1),
});

export type CopySharedArtifactResult =
  | { kind: 'copied'; conversationId: string; artifact: Omit<Artifact, 'createdAt'> }
  | { kind: 'sign-in' }
  | { kind: 'unconfirmed'; conversationId: string | null };

export async function copySharedArtifactToChat(
  input: {
    title: string;
    kind: PublishedArtifactKind;
    language: string | null;
    content: string;
  },
  authority: RequestAuthority,
): Promise<CopySharedArtifactResult> {
  let conversationId: string | null = null;
  try {
    const created = await authority.fetch('/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: input.title }),
    });
    if (created.status === 401) return { kind: 'sign-in' };
    if (!created.ok) return { kind: 'unconfirmed', conversationId };
    const payload: unknown = await created.json();
    authority.assertCurrent();
    conversationId = z.object({ conversation: z.object({ id: z.string().uuid() }) }).parse(payload)
      .conversation.id;
    const receipt = ManagedCloudCreateConversationResponseSchema.parse(payload);
    const organizationId = receipt.conversation.organization_id;
    if (organizationId === undefined) return { kind: 'unconfirmed', conversationId };

    const language = input.language || input.kind;
    const fenced = !/^```/m.test(input.content);
    const messageContent = fenced ? `\`\`\`${language}\n${input.content}\n\`\`\`` : input.content;
    const messageId = crypto.randomUUID();
    const saved = await authority.fetch(
      `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/bulk`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [MANAGED_CLOUD_ORGANIZATION_HEADER]:
            organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
        },
        body: JSON.stringify({
          messages: [{ id: messageId, role: 'assistant', content: messageContent }],
        }),
      },
    );
    if (!saved.ok) return { kind: 'unconfirmed', conversationId };
    const message = SavedMessagesSchema.parse(await saved.json()).messages[0];
    authority.assertCurrent();
    if (
      !message ||
      message.id !== messageId ||
      message.role !== 'assistant' ||
      message.content !== messageContent.trim()
    ) {
      return { kind: 'unconfirmed', conversationId };
    }
    const ordinal = fenced ? (extractCodeBlocks(messageContent)[0]?.ordinal ?? null) : null;
    return {
      kind: 'copied',
      conversationId,
      artifact: {
        id:
          ordinal === null
            ? crypto.randomUUID()
            : computeDerivedArtifactId(conversationId, messageId, ordinal),
        type: ARTIFACT_TYPE_BY_KIND[input.kind],
        title: input.title,
        language,
        content: input.content,
        messageId,
        conversationId,
      },
    };
  } catch (error) {
    authority.assertCurrent();
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return { kind: 'unconfirmed', conversationId };
  }
}
