/**
 * Desktop implementation of `@agiworkforce/unified-chat`'s
 * `DeriveMessageArtifacts` host capability (DES-C05).
 *
 * WHY THIS EXISTS. Desktop Cloud could not produce an artifact at all. The only
 * artifact source on the cloud path is `cloudStreamDeltas.ts`'s
 * `payload['artifact']` branch, and the managed completions route never emits
 * that key — so a model answering with an HTML page or a React component
 * rendered as a raw code block, while web rendered a live artifact panel. Web
 * derives artifacts CLIENT-SIDE from the assistant markdown on every render
 * (`apps/web/features/chat/utils/artifact-detector.ts` ->
 * `@agiworkforce/artifacts`); mobile does the same. This is desktop's adapter
 * onto that same canonical service — NOT a fourth fork of the derivation rules.
 *
 * TRUST BOUNDARY. Pure, local, synchronous string work over content the user is
 * already looking at. It performs no I/O and is identical for Local, BYOK and
 * Managed Cloud conversations, so it moves nothing across a boundary.
 *
 * DETERMINISTIC IDS. `deriveArtifacts` keys ids on
 * `uuidv5(conversationId:messageId:ordinal)`, so the artifact derived from the
 * live stream and the artifact derived from the same message after a reload
 * carry the SAME id. That is what lets a pre-attached/edited artifact overlay
 * its derived counterpart instead of duplicating it, and it is why the cloud
 * runtime can stop persisting artifact bytes altogether (DES-C06).
 *
 * @module desktopArtifactProjection
 */

import { deriveArtifacts, removeArtifactBlocks } from '@agiworkforce/artifacts';
import type {
  Artifact,
  ChatMessage,
  DeriveMessageArtifacts,
  MessageArtifactDerivationContext,
  MessageArtifactProjection,
} from '@agiworkforce/unified-chat';

/**
 * Stable fallback timestamp for messages with neither `createdAt` nor
 * `timestamp` (the optimistic assistant row mid-stream). Any fixed value works
 * — it only lands in `createdAt`/`updatedAt` on the derived artifact, which the
 * panel does not display — and a fixed one keeps the projection memo stable.
 */
const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

/**
 * Derive renderable artifacts for one assistant message and strip their fenced
 * blocks from the body.
 *
 * Returns `null` when the message yields no derived artifact, which tells the
 * shared transcript to render the message exactly as stored — including any
 * artifacts a runtime pre-attached.
 */
export const deriveDesktopMessageArtifacts: DeriveMessageArtifacts = (
  message: ChatMessage,
  context: MessageArtifactDerivationContext,
): MessageArtifactProjection | null => {
  if (message.role !== 'assistant') return null;
  if (!message.content) return null;

  const derived = deriveArtifacts(message.content, {
    conversationId: context.conversationId,
    messageId: message.id,
    // Web's inclusion policy: only artifacts that actually render (html /
    // react / svg / mermaid / html-like / explicit @artifact marker). An
    // ordinary python snippet stays an ordinary code block, as on web.
    include: 'renderable',
    // `deriveArtifacts` defaults `now` to `new Date().toISOString()`, which
    // would hand a new object identity to React on every single render and
    // make the memoized projection useless. The message's own timestamp is
    // both stable and more truthful.
    now: message.createdAt ?? message.timestamp ?? EPOCH_ISO,
  }) as Artifact[];

  if (derived.length === 0) return null;

  // A persisted/edited artifact with the same deterministic id is the newer
  // truth (the user may have saved an edit through `ArtifactPanel`), so it
  // overlays its derived counterpart rather than duplicating it. Pre-attached
  // artifacts with no derived counterpart (e.g. a generated-file projection)
  // are appended.
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
    // Strip only what we actually surfaced as a card. `removeArtifactBlocks`
    // matches on the CURRENT markdown's block ranges, so a mid-stream capture
    // whose content later drifted cannot leave a duplicate raw block behind.
    displayContent: removeArtifactBlocks(message.content, derived),
  };
};
