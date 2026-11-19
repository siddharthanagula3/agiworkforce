import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { creditsFromMicrousd, type MobileIapPlatform } from '@agiworkforce/types';
import { MICROUSD_PER_LEDGER_CENT } from '@/lib/server/managed-usage-policy';
import {
  mobileTopUpBudgetMicrousd,
  mobileTopUpRefundDescription,
  mobileTopUpRefundReversalDescription,
} from '@/lib/server/mobile-iap-top-up-budget';

export const READ_ONLY_STATEMENT = 'set transaction read only';
export const READ_ONLY_PROBE_SQL =
  "select current_setting('transaction_read_only') as transaction_read_only";

export const MOBILE_REFUND_LEDGER_SQL = `select entry.id, entry.user_id, entry.transaction_type, entry.description,
       entry.amount_microusd::text as amount_microusd, entry.metadata, entry.created_at
  from public.credit_transactions entry
 where starts_with(entry.description, $1) or starts_with(entry.description, $2)
 order by entry.created_at, entry.id`;

export const TOP_UP_RECEIPTS_SQL = `select receipt.id, receipt.user_id, receipt.platform,
       receipt.store_transaction_id, receipt.product_id, receipt.units_granted,
       receipt.intended_amount_cents, receipt.refunded_amount_cents, receipt.status,
       receipt.environment
  from public.mobile_iap_transactions receipt
 where receipt.product_kind = 'top_up'
   and receipt.user_id = any ($1::text[])
 order by receipt.created_at, receipt.id`;

const REFUND_DESCRIPTION_PREFIXES = [
  mobileTopUpRefundDescription('ios', ''),
  mobileTopUpRefundDescription('android', ''),
] as const;

export interface TopUpReceiptRow {
  id: string;
  user_id: string;
  platform: MobileIapPlatform;
  store_transaction_id: string;
  product_id: string;
  units_granted: number;
  intended_amount_cents: number;
  refunded_amount_cents: number;
  status: string;
  environment: string | null;
}

export interface MobileRefundLedgerRow {
  id: string;
  user_id: string;
  transaction_type: string;
  description: string;
  amount_microusd: string | number;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
}

export interface OverRevokedTopUpRefund {
  userId: string;
  platform: MobileIapPlatform;
  storeTransactionId: string;
  productId: string;
  environment: string;
  receiptStatus: string;
  refundedRetailCents: number;
  intendedRetailCents: number;
  refundEntries: number;
  reversalEntries: number;
  grantedMicrousd: number;
  revokedMicrousd: number;
  reGrantedMicrousd: number;
  shouldHaveRevokedMicrousd: number;
  owedMicrousd: number;
  owedCents: number;
  owedCredits: number;
}

export interface UnmatchedRefundEntry {
  id: string;
  userId: string;
  description: string;
  amountMicrousd: number;
  createdAt: string;
}

export interface TopUpRefundReportTotals {
  refunds: number;
  accounts: number;
  grantedMicrousd: number;
  revokedMicrousd: number;
  reGrantedMicrousd: number;
  shouldHaveRevokedMicrousd: number;
  owedMicrousd: number;
  owedCents: number;
  owedCredits: number;
}

export interface TopUpRefundReport {
  generatedAt: string;
  includeSandbox: boolean;
  refunds: OverRevokedTopUpRefund[];
  unmatchedLedgerEntries: UnmatchedRefundEntry[];
  totals: TopUpRefundReportTotals;
}

export interface TopUpRefundReportOptions {
  includeSandbox: boolean;
  now: Date;
}

export class ReportRefusal extends Error {}

function ledgerKey(userId: string, description: string): string {
  return `${userId}\u0000${description}`;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function balanceRevokedMicrousd(entry: MobileRefundLedgerRow): number {
  const requested = -Number(entry.amount_microusd);
  const metadata = entry.metadata ?? {};
  const microusd = finiteNumber(metadata['balance_revoked_microusd']);
  if (microusd !== null) return microusd;
  const cents = finiteNumber(metadata['balance_revoked_cents']);
  if (cents !== null) return cents * MICROUSD_PER_LEDGER_CENT;
  return requested;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function owedCentsFor(owedMicrousd: number): number {
  return Math.ceil(owedMicrousd / MICROUSD_PER_LEDGER_CENT);
}

export function buildTopUpRefundReport(
  receipts: readonly TopUpReceiptRow[],
  entries: readonly MobileRefundLedgerRow[],
  options: TopUpRefundReportOptions,
): TopUpRefundReport {
  const byKey = new Map<string, MobileRefundLedgerRow[]>();
  for (const entry of entries) {
    const key = ledgerKey(entry.user_id, entry.description);
    const group = byKey.get(key);
    if (group) group.push(entry);
    else byKey.set(key, [entry]);
  }

  const claimed = new Set<string>();
  const refunds: OverRevokedTopUpRefund[] = [];
  for (const receipt of receipts) {
    const refundKey = ledgerKey(
      receipt.user_id,
      mobileTopUpRefundDescription(receipt.platform, receipt.store_transaction_id),
    );
    const reversalKey = ledgerKey(
      receipt.user_id,
      mobileTopUpRefundReversalDescription(receipt.platform, receipt.store_transaction_id),
    );
    claimed.add(refundKey);
    claimed.add(reversalKey);

    const environment = receipt.environment === 'sandbox' ? 'sandbox' : 'production';
    if (environment === 'sandbox' && !options.includeSandbox) continue;

    const refundEntries = (byKey.get(refundKey) ?? []).filter(
      (entry) => entry.transaction_type === 'refund' && Number(entry.amount_microusd) < 0,
    );
    const reversalEntries = (byKey.get(reversalKey) ?? []).filter(
      (entry) => Number(entry.amount_microusd) > 0,
    );
    const revokedMicrousd = sum(refundEntries.map(balanceRevokedMicrousd));
    const reGrantedMicrousd = sum(reversalEntries.map((entry) => Number(entry.amount_microusd)));
    const shouldHaveRevokedMicrousd = mobileTopUpBudgetMicrousd(
      receipt,
      receipt.refunded_amount_cents,
    );
    const owedMicrousd = Math.max(
      0,
      revokedMicrousd - reGrantedMicrousd - shouldHaveRevokedMicrousd,
    );
    if (owedMicrousd <= 0) continue;

    refunds.push({
      userId: receipt.user_id,
      platform: receipt.platform,
      storeTransactionId: receipt.store_transaction_id,
      productId: receipt.product_id,
      environment,
      receiptStatus: receipt.status,
      refundedRetailCents: receipt.refunded_amount_cents,
      intendedRetailCents: receipt.intended_amount_cents,
      refundEntries: refundEntries.length,
      reversalEntries: reversalEntries.length,
      grantedMicrousd: mobileTopUpBudgetMicrousd(receipt, receipt.intended_amount_cents),
      revokedMicrousd,
      reGrantedMicrousd,
      shouldHaveRevokedMicrousd,
      owedMicrousd,
      owedCents: owedCentsFor(owedMicrousd),
      owedCredits: creditsFromMicrousd(owedMicrousd),
    });
  }

  const unmatchedLedgerEntries: UnmatchedRefundEntry[] = entries
    .filter((entry) => !claimed.has(ledgerKey(entry.user_id, entry.description)))
    .map((entry) => ({
      id: entry.id,
      userId: entry.user_id,
      description: entry.description,
      amountMicrousd: Number(entry.amount_microusd),
      createdAt: toIso(entry.created_at),
    }));

  const owedMicrousd = sum(refunds.map((refund) => refund.owedMicrousd));
  return {
    generatedAt: options.now.toISOString(),
    includeSandbox: options.includeSandbox,
    refunds,
    unmatchedLedgerEntries,
    totals: {
      refunds: refunds.length,
      accounts: new Set(refunds.map((refund) => refund.userId)).size,
      grantedMicrousd: sum(refunds.map((refund) => refund.grantedMicrousd)),
      revokedMicrousd: sum(refunds.map((refund) => refund.revokedMicrousd)),
      reGrantedMicrousd: sum(refunds.map((refund) => refund.reGrantedMicrousd)),
      shouldHaveRevokedMicrousd: sum(refunds.map((refund) => refund.shouldHaveRevokedMicrousd)),
      owedMicrousd,
      owedCents: sum(refunds.map((refund) => refund.owedCents)),
      owedCredits: creditsFromMicrousd(owedMicrousd),
    },
  };
}

/**
 * Every read runs inside one transaction the database itself holds read-only,
 * and the run stops before reading anything if the database does not confirm
 * it, so no statement this report sends can change a balance.
 */
export async function readOverRevokedTopUpRefunds(
  db: DatabaseAdapter,
  options: TopUpRefundReportOptions,
): Promise<TopUpRefundReport> {
  return db.transaction(async (tx) => {
    await tx.execute(READ_ONLY_STATEMENT);
    const [mode] = await tx.query<{ transaction_read_only: string }>(READ_ONLY_PROBE_SQL);
    if (mode?.transaction_read_only !== 'on') {
      throw new ReportRefusal('The database did not open the report transaction read-only.');
    }
    const entries = await tx.query<MobileRefundLedgerRow>(MOBILE_REFUND_LEDGER_SQL, [
      ...REFUND_DESCRIPTION_PREFIXES,
    ]);
    const userIds = [...new Set(entries.map((entry) => entry.user_id))];
    const receipts =
      userIds.length === 0 ? [] : await tx.query<TopUpReceiptRow>(TOP_UP_RECEIPTS_SQL, [userIds]);
    return buildTopUpRefundReport(receipts, entries, options);
  });
}

function formatCreditsCell(microusd: number): string {
  return creditsFromMicrousd(microusd).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const TABLE_HEADER = [
  'account',
  'platform',
  'store transaction',
  'env',
  'refunded/retail ¢',
  'granted cr',
  'revoked cr',
  're-granted cr',
  'should revoke cr',
  'owed cr',
  'owed ¢',
] as const;

export function formatTopUpRefundTable(report: TopUpRefundReport): string {
  const rows: string[][] = report.refunds.map((refund) => [
    refund.userId,
    refund.platform,
    refund.storeTransactionId,
    refund.environment,
    `${refund.refundedRetailCents}/${refund.intendedRetailCents}`,
    formatCreditsCell(refund.grantedMicrousd),
    formatCreditsCell(refund.revokedMicrousd),
    formatCreditsCell(refund.reGrantedMicrousd),
    formatCreditsCell(refund.shouldHaveRevokedMicrousd),
    formatCreditsCell(refund.owedMicrousd),
    String(refund.owedCents),
  ]);
  const totals = report.totals;
  const totalRow = [
    `TOTAL ${totals.refunds} refund(s), ${totals.accounts} account(s)`,
    '',
    '',
    '',
    '',
    formatCreditsCell(totals.grantedMicrousd),
    formatCreditsCell(totals.revokedMicrousd),
    formatCreditsCell(totals.reGrantedMicrousd),
    formatCreditsCell(totals.shouldHaveRevokedMicrousd),
    formatCreditsCell(totals.owedMicrousd),
    String(totals.owedCents),
  ];
  const table = [[...TABLE_HEADER], ...rows, totalRow];
  const widths = TABLE_HEADER.map((_, column) =>
    Math.max(...table.map((row) => (row[column] ?? '').length)),
  );
  const render = (row: readonly string[]) =>
    row
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join('  ')
      .trimEnd();
  const rule = widths.map((width) => '-'.repeat(width)).join('  ');

  const lines = [
    `Over-revoked mobile top-up refunds, read ${report.generatedAt}` +
      (report.includeSandbox ? ' (sandbox included)' : ' (production receipts only)'),
    render(table[0] ?? []),
    rule,
    ...rows.map(render),
    rule,
    render(totalRow),
  ];
  if (report.unmatchedLedgerEntries.length > 0) {
    lines.push(
      '',
      `${report.unmatchedLedgerEntries.length} mobile refund ledger entr(y/ies) name no top-up receipt; review by hand:`,
      ...report.unmatchedLedgerEntries.map(
        (entry) =>
          `  ${entry.id}  ${entry.userId}  ${entry.description}  ${formatCreditsCell(entry.amountMicrousd)} cr  ${entry.createdAt}`,
      ),
    );
  }
  return lines.join('\n');
}
