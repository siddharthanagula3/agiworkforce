import 'server-only';

import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import type { ESignatureProviderId } from './types';

const DOCUSIGN_SCOPES = 'signature impersonation';
const DOCUSIGN_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const DOCUSIGN_TOKEN_TTL_SECONDS = 3600;
const E_SIGNATURE_REQUEST_TIMEOUT_MS = 20_000;
const ORDER_FORM_SIGNATURE_ANCHOR = '/customer_signature/';

export type ESignatureEnvelopeStatus =
  'created' | 'sent' | 'delivered' | 'completed' | 'declined' | 'voided';

export interface ESignatureEnvelope {
  provider: ESignatureProviderId;
  envelopeId: string;
  status: ESignatureEnvelopeStatus;
  completedAt: string | null;
  signerName: string | null;
  signerEmail: string | null;
}

export interface SendOrderFormInput {
  organizationId: string;
  orderFormReference: string;
  documentName: string;
  documentBase64: string;
  signerName: string;
  signerEmail: string;
}

export interface ESignatureProvider {
  readonly id: ESignatureProviderId;
  isConfigured(): boolean;
  sendOrderForm(input: SendOrderFormInput): Promise<ESignatureEnvelope>;
  readEnvelope(envelopeId: string): Promise<ESignatureEnvelope>;
}

const DocusignConfigSchema = z.object({
  integrationKey: z.string().min(1),
  userId: z.string().min(1),
  accountId: z.string().min(1),
  privateKey: z.string().min(1),
  oauthBaseUrl: z.string().url(),
  apiBaseUrl: z.string().url(),
});

type DocusignConfig = z.infer<typeof DocusignConfigSchema>;

function readDocusignConfig(): DocusignConfig | null {
  const candidate = {
    integrationKey: process.env['DOCUSIGN_INTEGRATION_KEY']?.trim(),
    userId: process.env['DOCUSIGN_USER_ID']?.trim(),
    accountId: process.env['DOCUSIGN_ACCOUNT_ID']?.trim(),
    privateKey: process.env['DOCUSIGN_PRIVATE_KEY']?.trim(),
    oauthBaseUrl: process.env['DOCUSIGN_OAUTH_BASE_URL']?.trim(),
    apiBaseUrl: process.env['DOCUSIGN_API_BASE_URL']?.trim(),
  };
  const parsed = DocusignConfigSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function requireDocusignConfig(): DocusignConfig {
  const config = readDocusignConfig();
  if (!config) {
    throw createError.serviceUnavailable('Order form e-signature is not configured.');
  }
  return config;
}

const EnvelopeStatusSchema = z.object({
  envelopeId: z.string().min(1),
  status: z.string().min(1),
  completedDateTime: z.string().min(1).optional(),
  recipients: z
    .object({
      signers: z
        .array(z.object({ name: z.string().optional(), email: z.string().optional() }))
        .optional(),
    })
    .optional(),
});

const ENVELOPE_STATUSES: Readonly<Record<string, ESignatureEnvelopeStatus>> = {
  created: 'created',
  sent: 'sent',
  delivered: 'delivered',
  completed: 'completed',
  signed: 'completed',
  declined: 'declined',
  voided: 'voided',
};

function toEnvelopeStatus(raw: string): ESignatureEnvelopeStatus {
  const status = ENVELOPE_STATUSES[raw.trim().toLowerCase()];
  if (status) return status;
  logger.error({ status: raw }, 'Unknown e-signature envelope status; treated as not completed');
  return 'sent';
}

async function docusignAccessToken(config: DocusignConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: config.integrationKey,
      sub: config.userId,
      aud: new URL(config.oauthBaseUrl).host,
      scope: DOCUSIGN_SCOPES,
      iat: now,
      exp: now + DOCUSIGN_TOKEN_TTL_SECONDS,
    },
    config.privateKey,
    { algorithm: 'RS256' },
  );

  const response = await fetch(`${config.oauthBaseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: DOCUSIGN_GRANT_TYPE, assertion }),
    signal: AbortSignal.timeout(E_SIGNATURE_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw createError.serviceUnavailable('Order form e-signature is temporarily unavailable.');
  }
  const parsed = z.object({ access_token: z.string().min(1) }).safeParse(await response.json());
  if (!parsed.success) {
    throw createError.serviceUnavailable('Order form e-signature authentication failed.');
  }
  return parsed.data.access_token;
}

function toEnvelope(payload: z.infer<typeof EnvelopeStatusSchema>): ESignatureEnvelope {
  const signer = payload.recipients?.signers?.[0];
  return {
    provider: 'docusign',
    envelopeId: payload.envelopeId,
    status: toEnvelopeStatus(payload.status),
    completedAt: payload.completedDateTime
      ? new Date(payload.completedDateTime).toISOString()
      : null,
    signerName: signer?.name ?? null,
    signerEmail: signer?.email ?? null,
  };
}

async function docusignRequest(
  config: DocusignConfig,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  const token = await docusignAccessToken(config);
  const response = await fetch(
    `${config.apiBaseUrl}/restapi/v2.1/accounts/${encodeURIComponent(config.accountId)}${path}`,
    {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(E_SIGNATURE_REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    logger.error(
      { status: response.status, path },
      'Order form e-signature request was refused by the provider',
    );
    throw createError.serviceUnavailable('The order form could not be sent for signature.');
  }
  return response.json();
}

export const docusignESignatureProvider: ESignatureProvider = {
  id: 'docusign',

  isConfigured(): boolean {
    return readDocusignConfig() !== null;
  },

  async sendOrderForm(input: SendOrderFormInput): Promise<ESignatureEnvelope> {
    const config = requireDocusignConfig();
    const payload = await docusignRequest(config, '/envelopes', {
      method: 'POST',
      body: JSON.stringify({
        emailSubject: `AGI Enterprise Order Form ${input.orderFormReference}`,
        status: 'sent',
        documents: [
          {
            documentId: '1',
            name: input.documentName,
            fileExtension: 'pdf',
            documentBase64: input.documentBase64,
          },
        ],
        recipients: {
          signers: [
            {
              recipientId: '1',
              routingOrder: '1',
              name: input.signerName,
              email: input.signerEmail,
              tabs: {
                signHereTabs: [
                  { anchorString: ORDER_FORM_SIGNATURE_ANCHOR, anchorUnits: 'pixels' },
                ],
              },
            },
          ],
        },
        customFields: {
          textCustomFields: [
            { name: 'organization_id', value: input.organizationId, show: 'false' },
            { name: 'order_form_reference', value: input.orderFormReference, show: 'false' },
          ],
        },
      }),
    });

    const parsed = EnvelopeStatusSchema.safeParse(payload);
    if (!parsed.success) {
      throw createError.serviceUnavailable(
        'The e-signature provider returned an unusable envelope.',
      );
    }
    return toEnvelope(parsed.data);
  },

  async readEnvelope(envelopeId: string): Promise<ESignatureEnvelope> {
    const config = requireDocusignConfig();
    const payload = await docusignRequest(
      config,
      `/envelopes/${encodeURIComponent(envelopeId)}?include=recipients`,
      { method: 'GET' },
    );
    const parsed = EnvelopeStatusSchema.safeParse(payload);
    if (!parsed.success) {
      throw createError.serviceUnavailable(
        'The e-signature provider returned an unusable envelope.',
      );
    }
    return toEnvelope(parsed.data);
  },
};

/**
 * A counterpart signed outside the product: a customer that will not use an
 * e-signature portal still has to produce a signed Order Form, and its reference
 * is recorded by hand rather than inferred from the fact that billing started.
 */
export const manualCountersignedProvider: ESignatureProvider = {
  id: 'manual_countersigned',

  isConfigured(): boolean {
    return true;
  },

  sendOrderForm(): Promise<ESignatureEnvelope> {
    return Promise.reject(
      createError.badRequest('A countersigned order form is recorded, not sent for signature.'),
    );
  },

  readEnvelope(): Promise<ESignatureEnvelope> {
    return Promise.reject(
      createError.badRequest('A countersigned order form has no e-signature envelope to read.'),
    );
  },
};

const E_SIGNATURE_PROVIDERS_BY_ID: Readonly<Record<ESignatureProviderId, ESignatureProvider>> = {
  docusign: docusignESignatureProvider,
  manual_countersigned: manualCountersignedProvider,
};

export function getESignatureProvider(id: ESignatureProviderId): ESignatureProvider {
  return E_SIGNATURE_PROVIDERS_BY_ID[id];
}

export function isEnvelopeExecuted(envelope: ESignatureEnvelope): boolean {
  return envelope.status === 'completed' && envelope.completedAt !== null;
}
