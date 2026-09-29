import { z } from 'zod';

export const BANK_ACCOUNTS_CONNECTOR_ID = 'bank-accounts';
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

export const BANK_ACCOUNTS_ITEMS_PATH = '/api/connectors/bank-accounts/items';

export function bankAccountsItemPath(itemId: string): string {
  return `${BANK_ACCOUNTS_ITEMS_PATH}/${encodeURIComponent(itemId)}`;
}

export const BankAccountsItemSchema = z.object({
  id: z.string().uuid(),
  institutionName: z.string().nullable(),
  status: z.enum(['ready', 'reconnect', 'unavailable']),
  accounts: z.array(
    z.object({
      accountId: z.string(),
      name: z.string(),
      mask: z.string().nullable(),
      type: z.string(),
      subtype: z.string().nullable(),
      included: z.boolean(),
    }),
  ),
});
export type BankAccountsItem = z.infer<typeof BankAccountsItemSchema>;

export const BankAccountsItemsResponseSchema = z.object({ items: z.array(BankAccountsItemSchema) });

export const BankAccountsItemUpdateRequestSchema = z
  .object({ excludedAccountIds: z.array(z.string().min(1).max(128)).max(100) })
  .strict();
