'use client';

import { z } from 'zod';
import { computeDerivedArtifactId, extractCodeBlocks } from '@agiworkforce/artifacts';
import {
  ManagedCloudCreateConversationResponseSchema,
  ManagedCloudMessageWireSchema,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import type { ArtifactData } from '@features/chat/components/artifacts/ArtifactPreview';
import type { PublishedArtifactKind } from '@features/chat/components/artifacts/publishedArtifactRender';
import { useArtifactsStore } from '@features/chat/stores/artifacts-store';

const ARTIFACT_TYPE_BY_KIND: Record<PublishedArtifactKind, ArtifactData['type']> = {
  html: 'html',
  react: 'react',
  svg: 'svg',
  mermaid: 'mermaid',
  markdown: 'document',
  text: 'document',
  code: 'code',
};

const SavedMessagesSchema = z.object({ messages: z.array(ManagedCloudMessageWireSchema) });

export type CopySharedArtifactResult =
  { kind: 'copied'; conversationId: string } | { kind: 'sign-in' };

async function discardConversation(id: string): Promise<void> {
  await fetch(`/api/chat/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await addCsrfHeaders(),
    credentials: 'include',
  }).catch(() => undefined);
}

export async function copySharedArtifactToChat(input: {
  title: string;
  kind: PublishedArtifactKind;
  language: string | null;
  content: string;
}): Promise<CopySharedArtifactResult> {
  const created = await fetch('/api/chat/conversations', {
    method: 'POST',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ title: input.title }),
  });
  if (created.status === 401) return { kind: 'sign-in' };
  if (!created.ok) throw new Error('A new chat could not be started for this copy.');
  const conversationId = ManagedCloudCreateConversationResponseSchema.parse(await created.json())
    .conversation.id;

  const language = input.language || input.kind;
  const fenced = !/^```/m.test(input.content);
  const messageContent = fenced ? `\`\`\`${language}\n${input.content}\n\`\`\`` : input.content;
  const saved = await fetch(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/bulk`,
    {
      method: 'POST',
      headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({ messages: [{ role: 'assistant', content: messageContent }] }),
    },
  );
  const messageId = saved.ok
    ? SavedMessagesSchema.safeParse(await saved.json()).data?.messages[0]?.id
    : undefined;
  if (!messageId) {
    await discardConversation(conversationId);
    throw new Error('The artifact could not be copied into a new chat.');
  }

  const ordinal = fenced ? (extractCodeBlocks(messageContent)[0]?.ordinal ?? null) : null;
  useArtifactsStore.getState().upsertArtifact({
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
  });
  return { kind: 'copied', conversationId };
}
