
import 'server-only';

import { z } from 'zod';

import { isBillingPortalAvailable, isVerificationEmailSendable } from './availability';
import type {
  SupportActionAuditBinding,
  SupportActionAvailability,
  SupportActionDescription,
  SupportActionEndpoint,
  SupportActionExecution,
  SupportActionId,
} from './types';

export interface SupportActionDefinition<TParams = unknown> {
  id: SupportActionId;
  title: string;
  description: string;
  execution: SupportActionExecution;
  paramsSchema: z.ZodType<TParams>;
  describe: (params: TParams) => SupportActionDescription;
  resolveAvailability: () => SupportActionAvailability;
  perDayLimit: number;
  audit: SupportActionAuditBinding;
  endpoint?: SupportActionEndpoint;
}

const EmptyParams = z.object({}).strict();

const ConnectorParams = z
  .object({
    connectorId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9][a-z0-9-]*$/u, 'connectorId has an unexpected shape'),
  })
  .strict();

const ApiKeyParams = z
  .object({
    keyId: z.string().uuid(),
  })
  .strict();

export const SUPPORT_ACTIONS: Readonly<{
  [K in SupportActionId]: SupportActionDefinition<any>;
}> = Object.freeze({
  resend_verification_email: Object.freeze({
    id: 'resend_verification_email',
    title: 'Resend the email verification link',
    description: 'Send a fresh verification link to the email address on your account.',
    execution: 'server',
    paramsSchema: EmptyParams,
    describe: () => ({
      summary: 'We will email a new verification link to the address on your account.',
      effects: [
        'A new verification link is sent to the email address already on your account.',
        'Any earlier verification link stops working.',
        'Your email address is not changed.',
      ],
      reversibleNote: 'Nothing changes on your account until you click the link yourself.',
    }),
    resolveAvailability: (): SupportActionAvailability =>
      isVerificationEmailSendable()
        ? { available: true }
        : {
            available: false,
            reason:
              'This deployment cannot send verification email yet, so the assistant will not claim to have sent one. Use “Resend verification” in account settings instead.',
          },
    perDayLimit: 5,
    audit: {
      proposeEventType: 'login',
      executeEventType: 'login',
      resourceType: 'email_verification',
    },
  } satisfies SupportActionDefinition<Record<string, never>>),

  revoke_connector: Object.freeze({
    id: 'revoke_connector',
    title: 'Disconnect a connector',
    description: 'Disconnect one of your connected services and clear its saved tool permissions.',
    execution: 'server',
    paramsSchema: ConnectorParams,
    describe: (params: z.infer<typeof ConnectorParams>) => ({
      summary: `We will disconnect “${params.connectorId}” from your account.`,
      effects: [
        `“${params.connectorId}” stops being offered to the assistant in chat.`,
        'Any “Always allow” permissions you saved for its tools are cleared.',
        'Nothing in that service is deleted or changed.',
      ],
      reversibleNote:
        'You can reconnect it any time from Settings → Connections. Reconnecting starts from “ask every time” again, not from the permissions you just cleared.',
    }),
    resolveAvailability: (): SupportActionAvailability => ({ available: true }),
    perDayLimit: 20,
    audit: {
      proposeEventType: 'connector_removed',
      executeEventType: 'connector_removed',
      resourceType: 'connector',
    },
  } satisfies SupportActionDefinition<z.infer<typeof ConnectorParams>>),

  regenerate_api_key: Object.freeze({
    id: 'regenerate_api_key',
    title: 'Regenerate an API key',
    description:
      'Revoke one of your API keys and issue a replacement with the same name and scopes.',
    execution: 'server',
    paramsSchema: ApiKeyParams,
    describe: () => ({
      summary: 'We will revoke the API key you picked and issue a replacement.',
      effects: [
        'The current key stops working immediately. Anything using it will start failing.',
        'A new key is created with the same name and exactly the same scopes — no extra access.',
        'The new key is shown to you once and is never stored in plain text, so copy it before closing.',
      ],
      reversibleNote:
        'Reversible in the sense that you can regenerate again at any time — but the old key cannot be brought back, so update anything that uses it.',
    }),
    resolveAvailability: (): SupportActionAvailability => ({ available: true }),
    perDayLimit: 5,
    audit: {
      proposeEventType: 'api_key_revoked',
      executeEventType: 'api_key_created',
      resourceType: 'api_key',
    },
  } satisfies SupportActionDefinition<z.infer<typeof ApiKeyParams>>),

  export_account_data: Object.freeze({
    id: 'export_account_data',
    title: 'Export your data',
    description: 'Download a copy of the data on your account.',
    execution: 'handoff',
    paramsSchema: EmptyParams,
    describe: () => ({
      summary: 'We will start a download of your own account data.',
      effects: [
        'A file containing your account data is generated and downloaded in your browser.',
        'Nothing is deleted, changed, or sent anywhere else.',
      ],
      reversibleNote: 'This is a read. It changes nothing on your account.',
    }),
    resolveAvailability: (): SupportActionAvailability => ({ available: true }),
    perDayLimit: 3,
    audit: {
      proposeEventType: 'data_exported',
      executeEventType: 'data_exported',
      resourceType: 'account_export',
    },
    endpoint: { method: 'GET', path: '/api/user/export?download=true' },
  } satisfies SupportActionDefinition<Record<string, never>>),

  open_billing_portal: Object.freeze({
    id: 'open_billing_portal',
    title: 'Open the billing portal',
    description: 'Open the secure billing portal where you can manage payment and subscription.',
    execution: 'handoff',
    paramsSchema: EmptyParams,
    describe: () => ({
      summary: 'We will open the billing portal for your own account.',
      effects: [
        'A billing portal session opens where you can see invoices and manage your subscription.',
        'Opening the portal by itself changes nothing — any change is one you make there.',
      ],
      reversibleNote: 'Opening the portal is not a billing change.',
    }),
    resolveAvailability: (): SupportActionAvailability =>
      isBillingPortalAvailable()
        ? { available: true }
        : {
            available: false,
            reason: 'Billing is not configured in this deployment.',
          },
    perDayLimit: 10,
    audit: {
      proposeEventType: 'billing_portal_opened',
      executeEventType: 'billing_portal_opened',
      resourceType: 'billing_portal',
    },
    endpoint: { method: 'POST', path: '/api/portal' },
  } satisfies SupportActionDefinition<Record<string, never>>),
});

export function isSupportActionId(id: string): id is SupportActionId {
  return Object.prototype.hasOwnProperty.call(SUPPORT_ACTIONS, id);
}

export function getSupportAction(id: string): SupportActionDefinition | null {
  return isSupportActionId(id) ? SUPPORT_ACTIONS[id] : null;
}
