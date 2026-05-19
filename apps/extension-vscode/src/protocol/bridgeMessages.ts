/**
 * bridgeMessages.ts — Zod schemas for messages crossing the
 * desktop bridge ↔ extension trust boundary (WebSocket).
 *
 * Audit finding F-17: previously, inbound bridge messages were
 * `JSON.parse(event.data) as BridgeMessage` with only a `type`
 * allowlist check. Payload shapes were never validated.
 *
 * Every inbound bridge frame must now safeParse through
 * `BridgeInboundSchema` before handlers run.
 */

import { z } from 'zod';

// Inbound (desktop → extension) ----------------------------------------

const desktopOpenFile = z.object({
  type: z.literal('desktop:open-file'),
  payload: z.object({
    filePath: z.string().min(1).max(4096),
  }),
  timestamp: z.number().int().nonnegative().optional(),
});

const desktopShowMessage = z.object({
  type: z.literal('desktop:show-message'),
  payload: z.object({
    text: z.string().min(1).max(2000),
  }),
  timestamp: z.number().int().nonnegative().optional(),
});

const desktopRunCommand = z.object({
  type: z.literal('desktop:run-command'),
  payload: z.object({
    command: z.string().min(1).max(200),
    // NOTE: args are NOT included in the schema — handler refuses to
    // forward them regardless. Even if a future change accidentally
    // adds args support, Zod's strict object would reject unknowns.
  }),
  timestamp: z.number().int().nonnegative().optional(),
});

const authOk = z.object({
  type: z.literal('auth_ok'),
  payload: z.unknown().optional(),
  timestamp: z.number().int().nonnegative().optional(),
});

export const BridgeInboundSchema = z.discriminatedUnion('type', [
  desktopOpenFile,
  desktopShowMessage,
  desktopRunCommand,
  authOk,
]);

export type BridgeInbound = z.infer<typeof BridgeInboundSchema>;

export function parseBridgeInbound(raw: unknown): BridgeInbound | undefined {
  const result = BridgeInboundSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}

// Outbound (extension → desktop) ---------------------------------------

const vscodeConnected = z.object({
  type: z.literal('vscode:connected'),
  payload: z.object({
    workspaceFolders: z.array(z.string()),
    extensionVersion: z.string(),
  }),
  timestamp: z.number().int().nonnegative(),
});

const vscodeCodeSnippet = z.object({
  type: z.literal('vscode:code-snippet'),
  payload: z.object({
    code: z.string(),
    language: z.string(),
    filePath: z.string(),
  }),
  timestamp: z.number().int().nonnegative(),
});

const vscodeSyncContext = z.object({
  type: z.literal('vscode:sync-context'),
  payload: z.object({
    workspaceFolders: z.array(z.string()),
    activeFile: z.string().optional(),
    activeLanguage: z.string().optional(),
  }),
  timestamp: z.number().int().nonnegative(),
});

const vscodeAgentAction = z.object({
  type: z.literal('vscode:agent-action'),
  payload: z
    .object({
      action: z.string(),
    })
    .passthrough(), // extra params allowed for action-specific data
  timestamp: z.number().int().nonnegative(),
});

const vscodePing = z.object({
  type: z.literal('vscode:ping'),
  payload: z.object({}).passthrough(),
  timestamp: z.number().int().nonnegative(),
});

const auth = z.object({
  type: z.literal('auth'),
  token: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
});

export const BridgeOutboundSchema = z.discriminatedUnion('type', [
  vscodeConnected,
  vscodeCodeSnippet,
  vscodeSyncContext,
  vscodeAgentAction,
  vscodePing,
  auth,
]);

export type BridgeOutbound = z.infer<typeof BridgeOutboundSchema>;
