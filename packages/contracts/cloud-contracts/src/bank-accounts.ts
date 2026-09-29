import { z } from 'zod';

export const BANK_ACCOUNTS_LINK_PATH = '/api/connectors/bank-accounts/link';
export const BANK_ACCOUNTS_EXCHANGE_PATH = '/api/connectors/bank-accounts/exchange';
export const BANK_ACCOUNTS_HOSTED_LINK_RETURN_URL = 'agiworkforce://connectors/bank-complete';

const PLAID_TOKEN_MAX_LENGTH = 512;
const INSTITUTION_NAME_MAX_LENGTH = 200;

export const BankAccountsLinkRequestSchema = z
  .object({ hostedLink: z.literal(true).optional() })
  .strict();

export const BankAccountsLinkResponseSchema = z.object({
  linkToken: z.string().min(1),
  expiration: z.string(),
  hostedLinkUrl: z.string().url().optional(),
});

export const BankAccountsExchangeRequestSchema = z.union([
  z.object({
    publicToken: z.string().trim().min(1).max(PLAID_TOKEN_MAX_LENGTH),
    institutionName: z.string().trim().min(1).max(INSTITUTION_NAME_MAX_LENGTH).optional(),
  }),
  z.object({ linkToken: z.string().trim().min(1).max(PLAID_TOKEN_MAX_LENGTH) }).strict(),
]);

export type BankAccountsLinkResponse = z.infer<typeof BankAccountsLinkResponseSchema>;
