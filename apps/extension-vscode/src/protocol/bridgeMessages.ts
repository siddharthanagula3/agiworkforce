
import { z } from 'zod';

const authenticated = z
  .object({
    type: z.literal('Authenticated'),
    user_id: z.literal('vscode-extension'),
  })
  .strict();

const authenticationFailed = z
  .object({
    type: z.literal('AuthenticationFailed'),
    reason: z.string().min(1).max(2_000),
  })
  .strict();

const nativeResponse = z
  .object({
    type: z.literal('NativeResponse'),
    id: z.string().min(1).max(200),
    success: z.boolean(),
    data: z.unknown().nullable().optional(),
    error: z.string().max(2_000).nullable().optional(),
  })
  .strict();

export const BridgeInboundSchema = z.discriminatedUnion('type', [
  authenticated,
  authenticationFailed,
  nativeResponse,
]);

export type BridgeInbound = z.infer<typeof BridgeInboundSchema>;

export function parseBridgeInbound(raw: unknown): BridgeInbound | undefined {
  const result = BridgeInboundSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}

const authenticate = z
  .object({
    type: z.literal('Authenticate'),
    user_id: z.literal('vscode-extension'),
    team_id: z.null(),
    token: z.string().min(1),
  })
  .strict();

const nativePing = z
  .object({
    type: z.literal('NativeMessage'),
    id: z.string().min(1).max(200),
    payload: z.object({ type: z.literal('ping') }).strict(),
  })
  .strict();

export const BridgeOutboundSchema = z.discriminatedUnion('type', [authenticate, nativePing]);
export type BridgeOutbound = z.infer<typeof BridgeOutboundSchema>;
