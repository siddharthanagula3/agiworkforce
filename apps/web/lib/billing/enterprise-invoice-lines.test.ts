import { describe, expect, it } from 'vitest';

import {
  commercialContractView,
  type CommercialContractView,
  type SeatPosition,
} from '@agiworkforce/types';

import {
  ENTERPRISE_INVOICE_LINE_KINDS,
  buildEnterpriseInvoiceRun,
  invoiceRunToStripeLines,
  partitionSettledUsage,
  type EnterpriseBillingPeriod,
  type SettledUsageUnit,
} from './enterprise-invoice-lines';

const PERIOD: EnterpriseBillingPeriod = {
  start: '2026-04-01T00:00:00.000Z',
  end: '2026-07-01T00:00:00.000Z',
};
const CUT_OFF = '2026-07-02T00:00:00.000Z';

interface ContractOverrides {
  committedSeats?: number;
  seatUnitPriceCents?: number | null;
  includedUsageCentsPerPeriod?: number;
  committedUsageBlockCents?: number;
  minimumAnnualSpendCents?: number;
  meteredUsage?: boolean;
}

function contract(overrides: ContractOverrides = {}): CommercialContractView {
  return commercialContractView({
    identity: {
      organizationId: 'org_1',
      version: 1,
      state: 'executed',
      changeKind: 'initial',
      orderFormReference: 'OF-1',
      signedAt: '2026-01-01T00:00:00.000Z',
      supersedesVersion: null,
    },
    window: { termStart: '2026-01-01', termEnd: '2026-12-31', expiryGraceDays: 0 },
    commercials: {
      committedSeats: overrides.committedSeats ?? 100,
      seatUnitPriceCents:
        overrides.seatUnitPriceCents === undefined ? 5_000 : overrides.seatUnitPriceCents,
      includedUsageCentsPerPeriod: overrides.includedUsageCentsPerPeriod ?? 0,
      committedUsageBlockCents: overrides.committedUsageBlockCents ?? 0,
      minimumAnnualSpendCents: overrides.minimumAnnualSpendCents ?? 0,
      meteredUsage: overrides.meteredUsage ?? true,
      billingCurrency: 'usd',
    },
    procurement: {
      paymentTermDays: 30,
      purchaseOrderRequired: false,
      purchaseOrderNumber: 'PO-1',
      invoiceRecipientEmails: ['ap@example.com'],
      permittedPaymentMethods: ['send_invoice'],
    },
    asOfDate: '2026-07-01',
  });
}

const SEATS: SeatPosition = {
  committedSeats: 100,
  assignedSeats: 100,
  seatUnitPriceCents: 5_000,
  daysRemainingInTerm: 180,
  daysInTerm: 365,
};

function usage(overrides: Partial<SettledUsageUnit> = {}): SettledUsageUnit {
  return {
    sourceRef: 'managed_usage:user_1:idem-1:hash',
    occurredAt: '2026-05-01T00:00:00.000Z',
    settledAt: '2026-05-01T00:00:01.000Z',
    amountCents: 1_000,
    ...overrides,
  };
}

function run(input: Partial<Parameters<typeof buildEnterpriseInvoiceRun>[0]> = {}) {
  return buildEnterpriseInvoiceRun({
    contract: contract(),
    period: PERIOD,
    seats: SEATS,
    usage: [],
    prepaidBalanceCents: 0,
    recognizedTermSpendCents: 0,
    isFinalPeriodOfTerm: false,
    settlementCutOff: CUT_OFF,
    ...input,
  });
}

describe('settled usage is placed in the period the invoice may charge for', () => {
  it('counts usage that happened in the period and settled before the cut-off', () => {
    const { partition } = partitionSettledUsage([usage()], PERIOD, CUT_OFF);
    expect(partition).toEqual({
      inPeriodCents: 1_000,
      lateCents: 0,
      deferredCents: 0,
      futureCents: 0,
    });
  });

  it('calls usage of an already invoiced period late rather than missing', () => {
    const { partition, lateSourceRefs } = partitionSettledUsage(
      [
        usage({
          sourceRef: 'late-1',
          occurredAt: '2026-03-20T00:00:00.000Z',
          settledAt: '2026-05-02T00:00:00.000Z',
          amountCents: 700,
        }),
      ],
      PERIOD,
      CUT_OFF,
    );
    expect(partition.lateCents).toBe(700);
    expect(partition.inPeriodCents).toBe(0);
    expect(lateSourceRefs).toEqual(['late-1']);
  });

  it('defers usage that settled at or after the cut-off to the next invoice', () => {
    const { partition } = partitionSettledUsage(
      [usage({ settledAt: CUT_OFF, amountCents: 400 })],
      PERIOD,
      CUT_OFF,
    );
    expect(partition.deferredCents).toBe(400);
    expect(partition.inPeriodCents).toBe(0);
  });

  it('leaves usage of a period that has not ended off this invoice', () => {
    const { partition } = partitionSettledUsage(
      [
        usage({
          occurredAt: '2026-07-05T00:00:00.000Z',
          settledAt: '2026-07-01T12:00:00.000Z',
          amountCents: 250,
        }),
      ],
      PERIOD,
      CUT_OFF,
    );
    expect(partition.futureCents).toBe(250);
  });

  it('refuses a fractional or negative settled amount', () => {
    expect(() => partitionSettledUsage([usage({ amountCents: 10.5 })], PERIOD, CUT_OFF)).toThrow(
      RangeError,
    );
    expect(() => partitionSettledUsage([usage({ amountCents: -1 })], PERIOD, CUT_OFF)).toThrow(
      RangeError,
    );
  });
});

describe('an invoice run is the contract arithmetic applied to the settled ledger', () => {
  it('charges the seat commitment from the negotiated rate', () => {
    const result = run();
    const seatLine = result.lines.find((line) => line.kind === 'seat_commitment');
    expect(seatLine?.amountCents).toBe(100 * 5_000);
    expect(seatLine?.quantity).toBe(100);
  });

  it('draws a prepaid contract down before it invoices anything for usage', () => {
    const result = run({
      contract: contract({ committedSeats: 0, committedUsageBlockCents: 400_000 }),
      seats: { ...SEATS, committedSeats: 0, assignedSeats: 0 },
      usage: [usage({ amountCents: 150_000 })],
      prepaidBalanceCents: 400_000,
    });

    expect(result.lines.map((line) => line.kind)).toEqual(['prepaid_drawdown']);
    expect(result.lines[0]?.amountCents).toBe(0);
    expect(result.lines[0]?.quantity).toBe(150_000);
    expect(result.totalCents).toBe(0);
  });

  it('invoices a postpaid contract only above what the period includes', () => {
    const result = run({
      contract: contract({ committedSeats: 0, includedUsageCentsPerPeriod: 100_000 }),
      seats: { ...SEATS, committedSeats: 0, assignedSeats: 0 },
      usage: [usage({ amountCents: 160_000 })],
    });

    expect(result.lines.map((line) => line.kind)).toEqual(['usage_overage']);
    expect(result.totalCents).toBe(60_000);
  });

  it('invoices nothing for a postpaid contract still inside its included amount', () => {
    const result = run({
      contract: contract({ committedSeats: 0, includedUsageCentsPerPeriod: 100_000 }),
      seats: { ...SEATS, committedSeats: 0, assignedSeats: 0 },
      usage: [usage({ amountCents: 90_000 })],
    });

    expect(result.lines).toEqual([]);
    expect(result.totalCents).toBe(0);
  });

  it('carries late usage onto this invoice instead of rewriting the finalized one', () => {
    const result = run({
      contract: contract({ committedSeats: 0, includedUsageCentsPerPeriod: 0 }),
      seats: { ...SEATS, committedSeats: 0, assignedSeats: 0 },
      usage: [
        usage({ sourceRef: 'in-period', amountCents: 5_000 }),
        usage({
          sourceRef: 'late-1',
          occurredAt: '2026-02-11T00:00:00.000Z',
          settledAt: '2026-05-04T00:00:00.000Z',
          amountCents: 2_500,
        }),
      ],
    });

    const lateLine = result.lines.find((line) => line.kind === 'late_usage_catch_up');
    expect(lateLine?.amountCents).toBe(2_500);
    expect(lateLine?.quantity).toBe(1);
    expect(result.lateSourceRefs).toEqual(['late-1']);
    expect(result.lines.find((line) => line.kind === 'usage_overage')?.amountCents).toBe(5_000);
    expect(result.totalCents).toBe(7_500);
  });

  it('bills a minimum commitment shortfall only in the final period of the term', () => {
    const shortfallInput = {
      contract: contract({ committedSeats: 0, minimumAnnualSpendCents: 1_000_000 }),
      seats: { ...SEATS, committedSeats: 0, assignedSeats: 0 },
      usage: [usage({ amountCents: 200_000 })],
      recognizedTermSpendCents: 600_000,
    };

    expect(
      run({ ...shortfallInput, isFinalPeriodOfTerm: false }).lines.some(
        (line) => line.kind === 'commitment_shortfall',
      ),
    ).toBe(false);

    const final = run({ ...shortfallInput, isFinalPeriodOfTerm: true });
    expect(final.lines.find((line) => line.kind === 'commitment_shortfall')?.amountCents).toBe(
      400_000,
    );
  });

  it('refuses to bill a period from terms that commit to nothing', () => {
    expect(() =>
      run({
        contract: contract({
          committedSeats: 0,
          includedUsageCentsPerPeriod: 0,
          committedUsageBlockCents: 0,
          minimumAnnualSpendCents: 0,
          meteredUsage: false,
        }),
        seats: { ...SEATS, committedSeats: 0, assignedSeats: 0 },
      }),
    ).toThrow(RangeError);
  });

  it('describes every line kind it can emit', () => {
    const described = new Set(
      [
        run(),
        run({
          contract: contract({ committedSeats: 0, committedUsageBlockCents: 400_000 }),
          seats: { ...SEATS, committedSeats: 0, assignedSeats: 0 },
          usage: [usage({ amountCents: 1_000 })],
          prepaidBalanceCents: 400_000,
        }),
        run({
          seats: { ...SEATS, assignedSeats: 140 },
          usage: [usage({ amountCents: 1_000 })],
        }),
        run({
          contract: contract({ committedSeats: 0, minimumAnnualSpendCents: 1_000_000 }),
          seats: { ...SEATS, committedSeats: 0, assignedSeats: 0 },
          usage: [usage({ amountCents: 1_000 })],
          isFinalPeriodOfTerm: true,
        }),
        run({
          usage: [
            usage({
              sourceRef: 'late',
              occurredAt: '2026-01-05T00:00:00.000Z',
              settledAt: '2026-05-05T00:00:00.000Z',
            }),
          ],
        }),
      ]
        .flatMap((result) => result.lines)
        .map((line) => line.description),
    );
    expect(described.size).toBe(ENTERPRISE_INVOICE_LINE_KINDS.length);
  });
});

describe('the run becomes provider lines whose unit price times quantity is the charge', () => {
  it('splits a seat line into a unit rate and a seat count', () => {
    const [seatLine] = invoiceRunToStripeLines(run(), PERIOD);

    expect(seatLine?.amountCents).toBe(100 * 5_000);
    expect(seatLine?.quantity).toBe(100);
    expect(seatLine?.periodStart).toBe(Math.floor(Date.parse(PERIOD.start) / 1_000));
    expect(seatLine?.periodEnd).toBe(Math.floor(Date.parse(PERIOD.end) / 1_000));
  });

  it('reads a usage line as one charge rather than as a count of cents', () => {
    const lines = invoiceRunToStripeLines(
      run({
        contract: contract({ committedSeats: 0, includedUsageCentsPerPeriod: 0 }),
        seats: { ...SEATS, committedSeats: 0, assignedSeats: 0 },
        usage: [usage({ amountCents: 7 })],
      }),
      PERIOD,
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(1);
    expect(lines[0]?.amountCents).toBe(7);
  });

  it('leaves a zero-amount line off the document', () => {
    const lines = invoiceRunToStripeLines(
      run({
        contract: contract({ committedSeats: 0, committedUsageBlockCents: 400_000 }),
        seats: { ...SEATS, committedSeats: 0, assignedSeats: 0 },
        usage: [usage({ amountCents: 1_000 })],
        prepaidBalanceCents: 400_000,
      }),
      PERIOD,
    );

    expect(lines).toEqual([]);
  });

  it('every emitted line is a whole number of cents', () => {
    for (const line of invoiceRunToStripeLines(
      run({ seats: { ...SEATS, assignedSeats: 137 }, usage: [usage({ amountCents: 3_333 })] }),
      PERIOD,
    )) {
      expect(Number.isInteger(line.amountCents)).toBe(true);
      expect(Number.isInteger(line.quantity)).toBe(true);
    }
  });
});
