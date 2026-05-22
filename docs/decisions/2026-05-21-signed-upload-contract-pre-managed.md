# 2026-05-21 — Signed-upload contract lands before Cloud Managed

Status: Locked
Owner: Platform lead + backend
Last updated: 2026-05-21

## Decision

`SignedUploadRequest` and `SignedUploadResponse` ship in `packages/types/src/chat.ts` immediately, even though v1 (Local Mode + BYOK) does not need them. Cloud Managed will wire up the server side of the contract when the waitlist opens; consumer surfaces can already compile against the types today.

## Context

Round-2 audit P0 #4 promoted "Web Attachments signed uploads + MIME accept" from P1 to P0. The reliability piece — large image uploads bloating the prompt budget and 413'ing the gateway — applies the moment any chat surface starts accepting attachments routinely (which the new composer drag-drop + paste-image flow makes much easier). The cloud upload path itself is a Cloud Managed concern, but the type surface that consumers interact with is needed now so they don't have to be refactored later.

## What this means in practice

```ts
// packages/types/src/chat.ts
export interface SignedUploadRequest {
  name: string;
  mimeType: string;
  size: number; // must be <= MAX_ATTACHMENT_BYTES
  sha256?: string; // optional end-to-end integrity check
}

export interface SignedUploadResponse {
  attachmentId: string; // round-trip with subsequent chat messages
  uploadUrl: string;
  uploadMethod: 'PUT' | 'POST';
  uploadHeaders?: Record<string, string>;
  expiresAt: string; // ISO-8601 wall-clock
}
```

1. **v1 attachments stay inline base64.** Local Mode + BYOK don't traverse our server, so there's no opportunity for the gateway to issue a signed URL. The inline path is already validated against `MAX_ATTACHMENT_BYTES = 25 MiB` and the MIME prefix allowlist in `validateAttachmentFile`.
2. **Cloud Managed activates the path.** When the waitlist opens, the gateway issues a `SignedUploadResponse`; the client posts the bytes directly to the storage URL and references the returned `attachmentId` in the chat message body. The shape of the chat message itself does not change — `ChatAttachment` already carries `id` and `url` fields that map cleanly.
3. **Consumer surfaces compile against the types now.** `apps/web`, `apps/desktop`, and `packages/unified-chat` can already `import type { SignedUploadRequest } from '@agiworkforce/types'`. When the activation feature flag flips on, the UI code that needs to call the upload API has its types ready; the flip is wiring, not redesign.

## Alternatives considered

- **Wait until Cloud Managed ships to define the types.** Cheap, but the audit history shows this pattern reliably forces a same-week refactor of every consumer when the flag flips. Rejected.
- **Define the types on the server only, and surface them to clients via codegen.** Already considered for the API gateway, but those tools generate Zod schemas, not TypeScript-only interfaces that ship in a workspace package. Codegen will happen for runtime validation; the static contract belongs in `@agiworkforce/types` as the spine.
- **Make signed uploads available in v1 BYOK too.** Tempting because it'd unify the path — but BYOK by definition does not traverse our server, so we have no place to issue the signed URL. The base64-inline path is the right answer for BYOK both now and after Cloud Managed opens.

## What this does NOT decide

- The actual storage backend (Cloudflare R2, AWS S3, Supabase Storage). That's a separate decision on the cloud build-out; the contract here is storage-agnostic.
- The retention policy on uploaded attachments. Tied to billing tier and Cloud Managed posture; documented in `docs/current/commercial-and-launch.md` once finalized.
- The per-tier attachment quota (count and size). Also Cloud Managed concern; v1 enforces the `MAX_ATTACHMENT_BYTES` per-file cap and lets the client attach as many as it wants.

## Verification

- Contract lives at `packages/types/src/chat.ts` (lines added in commit `84a7cb417`).
- `packages/types` typecheck and tests pass with the new contract — verified during the 2026-05-21 session.
- Consumer use: `packages/unified-chat/src/components/ChatInput.tsx` now imports `validateAttachmentFile` (which compiles in the same types module) and surfaces rejection messages. The signed-upload path activates when a Cloud Managed feature flag flips on.

## Sources

- Round-2 audit promotion of P0 #4: `audit/anthropic-apps-parity/team-2026-05-21/EXEC-SUMMARY-r2.md`
- Anthropic's documented public limit for in-message base64 attachments (5 MiB per image, 32 MiB total request) — informs the 25 MiB per-file cap which gives Anthropic-compatible headroom and ChatGPT-compatible (20 MiB) safety.
