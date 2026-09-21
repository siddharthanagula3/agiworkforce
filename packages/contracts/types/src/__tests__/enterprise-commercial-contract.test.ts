import { describe, expect, it } from 'vitest';

import {
  CONTRACT_LIFECYCLE_EVENTS,
  CONTRACT_LIFECYCLE_STATES,
  CONTRACT_STATES_IN_FORCE,
  CONTRACT_TRANSITIONS,
  DERIVED_CONTRACT_STATES,
  PERSISTED_CONTRACT_STATES,
  TERMINAL_CONTRACT_LIFECYCLE_STATES,
  addDaysToContractDate,
  allowedContractEvents,
  applyContractEvent,
  authoredVersionState,
  changeKindForEvent,
  contractDaysBetween,
  resolveContractForce,
  type ContractLifecycleEvent,
  type ContractLifecycleState,
} from '../enterprise/contract-lifecycle';
import {
  COMMERCIAL_MODELS,
  amendmentProration,
  commitmentLinesTotalCents,
  contractCentsToMicroUsd,
  drawdownPrepaidCents,
  minimumCommitmentShortfallCents,
  periodCommitmentLines,
  postpaidUsageDueCents,
  prorateCents,
  resolveCommercialModel,
  seatTrueUp,
  type CommitmentShape,
} from '../enterprise/commitments';
import {
  ENTERPRISE_INVOICE_STATES,
  STANDARD_NET_TERM_DAYS,
  allowedInvoiceCorrections,
  invoiceDueDate,
  invoiceIssuanceRefusals,
  invoiceOutstandingCents,
  isInvoiceAmountMutable,
  offlinePaymentRefusal,
  paymentTermLabel,
  resolveInvoiceState,
  type EnterpriseInvoiceState,
  type InvoiceIssuanceTerms,
} from '../enterprise/invoice-terms';
import {
  commercialContractView,
  contractGrantsEnterprise,
  contractInvoiceTerms,
} from '../enterprise/commercial-contract';
import { MICROUSD_PER_CENT } from '../rate-card';

type Outcome = { to: ContractLifecycleState; authors: boolean } | { refused: string };

const EXPECTED_TRANSITIONS: Record<
  ContractLifecycleState,
  Record<ContractLifecycleEvent, Outcome>
> = {
  draft: {
    send_for_signature: { to: 'pending_signature', authors: false },
    record_signature: { to: 'executed', authors: false },
    amend: { refused: 'not_signed_yet' },
    renew: { refused: 'not_signed_yet' },
    terminate: { refused: 'not_signed_yet' },
    term_lapsed: { refused: 'no_term_in_force' },
  },
  pending_signature: {
    send_for_signature: { refused: 'already_pending_signature' },
    record_signature: { to: 'executed', authors: false },
    amend: { refused: 'not_signed_yet' },
    renew: { refused: 'not_signed_yet' },
    terminate: { refused: 'not_signed_yet' },
    term_lapsed: { refused: 'no_term_in_force' },
  },
  executed: {
    send_for_signature: { refused: 'already_executed' },
    record_signature: { refused: 'already_executed' },
    amend: { to: 'superseded', authors: true },
    renew: { to: 'superseded', authors: true },
    terminate: { to: 'terminated', authors: false },
    term_lapsed: { to: 'expired', authors: false },
  },
  expired: {
    send_for_signature: { refused: 'agreement_already_ended' },
    record_signature: { refused: 'agreement_already_ended' },
    amend: { refused: 'agreement_not_in_force' },
    renew: { to: 'superseded', authors: true },
    terminate: { refused: 'agreement_already_ended' },
    term_lapsed: { refused: 'term_already_lapsed' },
  },
  terminated: {
    send_for_signature: { refused: 'agreement_already_ended' },
    record_signature: { refused: 'agreement_already_ended' },
    amend: { refused: 'agreement_already_ended' },
    renew: { refused: 'agreement_already_ended' },
    terminate: { refused: 'agreement_already_ended' },
    term_lapsed: { refused: 'agreement_already_ended' },
  },
  superseded: {
    send_for_signature: { refused: 'history_is_immutable' },
    record_signature: { refused: 'history_is_immutable' },
    amend: { refused: 'history_is_immutable' },
    renew: { refused: 'history_is_immutable' },
    terminate: { refused: 'history_is_immutable' },
    term_lapsed: { refused: 'history_is_immutable' },
  },
};

describe('contract lifecycle', () => {
  it('states an outcome for every state and event pair', () => {
    const pairs: string[] = [];
    for (const state of CONTRACT_LIFECYCLE_STATES) {
      for (const event of CONTRACT_LIFECYCLE_EVENTS) {
        pairs.push(`${state}/${event}`);
        const expected = EXPECTED_TRANSITIONS[state][event];
        const actual = applyContractEvent(state, event);
        if ('refused' in expected) {
          expect(actual, `${state} + ${event}`).toEqual({
            allowed: false,
            refusal: expected.refused,
          });
        } else {
          expect(actual, `${state} + ${event}`).toEqual({
            allowed: true,
            to: expected.to,
            authorsNewVersion: expected.authors,
          });
        }
      }
    }
    expect(pairs).toHaveLength(CONTRACT_LIFECYCLE_STATES.length * CONTRACT_LIFECYCLE_EVENTS.length);
  });

  it('leaves no state or event out of the table', () => {
    expect(Object.keys(CONTRACT_TRANSITIONS).sort()).toEqual([...CONTRACT_LIFECYCLE_STATES].sort());
    for (const state of CONTRACT_LIFECYCLE_STATES) {
      expect(Object.keys(CONTRACT_TRANSITIONS[state]).sort()).toEqual(
        [...CONTRACT_LIFECYCLE_EVENTS].sort(),
      );
    }
  });

  it('lets nothing leave a terminal state', () => {
    for (const state of TERMINAL_CONTRACT_LIFECYCLE_STATES) {
      expect(allowedContractEvents(state)).toEqual([]);
    }
  });

  it('bills under exactly one state and never persists a derived one', () => {
    expect(CONTRACT_STATES_IN_FORCE).toEqual(['executed']);
    expect([...PERSISTED_CONTRACT_STATES, ...DERIVED_CONTRACT_STATES].sort()).toEqual(
      [...CONTRACT_LIFECYCLE_STATES].sort(),
    );
    for (const state of DERIVED_CONTRACT_STATES) {
      expect(PERSISTED_CONTRACT_STATES).not.toContain(state);
    }
  });

  it('records what a superseding version was for', () => {
    expect(changeKindForEvent('amend')).toBe('amendment');
    expect(changeKindForEvent('renew')).toBe('renewal');
    expect(changeKindForEvent('record_signature')).toBeNull();
    expect(authoredVersionState(true)).toBe('executed');
    expect(authoredVersionState(false)).toBe('draft');
  });

  it('never executes a version an amendment only proposed', () => {
    const amend = applyContractEvent('executed', 'amend');
    expect(amend.allowed && amend.authorsNewVersion).toBe(true);
    expect(authoredVersionState(false)).not.toBe('executed');
  });
});

describe('the day an agreement stops granting', () => {
  const window = { termStart: '2026-01-01', termEnd: '2026-12-31', expiryGraceDays: 0 };

  it.each([
    ['2025-12-31', false, 'not_started'],
    ['2026-01-01', true, 'in_force'],
    ['2026-12-31', true, 'in_force'],
    ['2027-01-01', false, 'expired'],
  ])('on %s grants %s (%s)', (asOfDate, inForce, reason) => {
    const force = resolveContractForce({ state: 'executed', window, asOfDate });
    expect(force.inForce).toBe(inForce);
    expect(force.reason).toBe(reason);
  });

  it('extends by exactly the negotiated grace and not a day more', () => {
    const graced = { ...window, expiryGraceDays: 15 };
    expect(
      resolveContractForce({ state: 'executed', window: graced, asOfDate: '2027-01-15' }),
    ).toMatchObject({ inForce: true, reason: 'in_grace', grantsThrough: '2027-01-15' });
    expect(
      resolveContractForce({ state: 'executed', window: graced, asOfDate: '2027-01-16' }),
    ).toMatchObject({ inForce: false, reason: 'expired' });
  });

  it('grants nothing once terminated, superseded or unsigned, whatever the dates say', () => {
    for (const state of ['terminated', 'superseded', 'draft', 'pending_signature'] as const) {
      expect(resolveContractForce({ state, window, asOfDate: '2026-06-01' }).inForce, state).toBe(
        false,
      );
    }
  });

  it('counts whole days across a leap day and a year boundary', () => {
    expect(contractDaysBetween('2028-02-01', '2028-03-01')).toBe(29);
    expect(contractDaysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(addDaysToContractDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToContractDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('refuses a date that is not a calendar date and a fractional grace', () => {
    expect(() => contractDaysBetween('2026-1-1', '2026-02-01')).toThrow(RangeError);
    expect(() =>
      resolveContractForce({
        state: 'executed',
        window: { ...window, expiryGraceDays: 1.5 },
        asOfDate: '2026-06-01',
      }),
    ).toThrow(RangeError);
  });
});

describe('which commercial model a set of terms expresses', () => {
  function shape(overrides: Partial<CommitmentShape> = {}): CommitmentShape {
    return {
      committedSeats: 0,
      committedUsageBlockCents: 0,
      includedUsageCentsPerPeriod: 0,
      minimumAnnualSpendCents: 0,
      meteredUsage: false,
      ...overrides,
    };
  }

  it('names a model for every combination of the four components', () => {
    const seen = new Set<string>();
    for (const seats of [0, 100]) {
      for (const prepaid of [0, 250_000]) {
        for (const metered of [false, true]) {
          for (const minimum of [0, 9_000_000]) {
            const model = resolveCommercialModel(
              shape({
                committedSeats: seats,
                committedUsageBlockCents: prepaid,
                meteredUsage: metered,
                minimumAnnualSpendCents: minimum,
              }),
            );
            const key = `${seats > 0}/${prepaid > 0}/${metered}/${minimum > 0}`;
            seen.add(key);
            if (seats === 0 && prepaid === 0 && !metered && minimum === 0) {
              expect(model, key).toBeNull();
            } else {
              expect(COMMERCIAL_MODELS, key).toContain(model);
            }
          }
        }
      }
    }
    expect(seen.size).toBe(16);
  });

  it.each([
    [{ committedSeats: 500 }, 'seat_only'],
    [{ committedSeats: 500, meteredUsage: true }, 'seat_plus_usage'],
    [{ committedUsageBlockCents: 5_000_000 }, 'prepaid_consumption'],
    [{ meteredUsage: true }, 'postpaid_usage'],
    [{ minimumAnnualSpendCents: 12_000_000 }, 'committed_spend'],
    [{ committedSeats: 500, committedUsageBlockCents: 5_000_000, meteredUsage: true }, 'hybrid'],
  ])('reads %o as %s', (overrides, expected) => {
    expect(resolveCommercialModel(shape(overrides))).toBe(expected);
  });
});

describe('commitment arithmetic', () => {
  it.each([
    [10_000, 0, 365, 0],
    [10_000, 365, 365, 10_000],
    [10_000, 182, 365, 4_986],
    [1, 1, 2, 1],
    [3, 1, 2, 2],
  ])('prorates %i over %i of %i days as %i', (amount, part, whole, expected) => {
    expect(prorateCents(amount, part, whole)).toBe(expected);
  });

  it('refuses a fraction of a cent, a fraction of a day and an impossible period', () => {
    expect(() => prorateCents(10.5, 1, 2)).toThrow(RangeError);
    expect(() => prorateCents(10, 1.5, 2)).toThrow(RangeError);
    expect(() => prorateCents(10, 1, 0)).toThrow(RangeError);
    expect(() => prorateCents(10, 3, 2)).toThrow(RangeError);
  });

  it.each([
    [100, 120, 20, 2_000_000],
    [100, 100, 0, 0],
    [100, 40, 0, 0],
  ])(
    'true-up from %i committed to %i assigned bills %i seats',
    (committed, assigned, billable, charge) => {
      const result = seatTrueUp({
        committedSeats: committed,
        assignedSeats: assigned,
        seatUnitPriceCents: 100_000,
        daysRemainingInTerm: 365,
        daysInTerm: 365,
      });
      expect(result.billableSeats).toBe(billable);
      expect(result.chargeCents).toBe(charge);
      expect(result.creditCents).toBe(0);
    },
  );

  it('returns nothing for a seat removed mid term and keeps the commitment billed', () => {
    const result = seatTrueUp({
      committedSeats: 100,
      assignedSeats: 60,
      seatUnitPriceCents: 100_000,
      daysRemainingInTerm: 180,
      daysInTerm: 365,
    });
    expect(result).toMatchObject({ creditCents: 0, chargeCents: 0, unusedCommittedSeats: 40 });
  });

  it('prorates a mid-term seat add to the days that remain', () => {
    expect(
      seatTrueUp({
        committedSeats: 100,
        assignedSeats: 110,
        seatUnitPriceCents: 120_000,
        daysRemainingInTerm: 90,
        daysInTerm: 360,
      }).chargeCents,
    ).toBe(300_000);
  });

  it.each([
    [1_000_000, 400_000, 400_000, 600_000, 0],
    [1_000_000, 1_400_000, 1_000_000, 0, 400_000],
    [0, 500_000, 0, 0, 500_000],
  ])('draws %i down by %i', (balance, usage, applied, remaining, uncovered) => {
    expect(drawdownPrepaidCents({ balanceCents: balance, usageCents: usage })).toEqual({
      appliedCents: applied,
      remainingBalanceCents: remaining,
      uncoveredCents: uncovered,
    });
  });

  it('never lets a prepaid balance go negative or a float enter it', () => {
    expect(drawdownPrepaidCents({ balanceCents: 10, usageCents: 99 }).remainingBalanceCents).toBe(
      0,
    );
    expect(() => drawdownPrepaidCents({ balanceCents: 10.5, usageCents: 1 })).toThrow(RangeError);
    expect(() => drawdownPrepaidCents({ balanceCents: -1, usageCents: 1 })).toThrow(RangeError);
  });

  it.each([
    [500_000, 200_000, 300_000],
    [500_000, 500_000, 0],
    [500_000, 900_000, 0],
  ])('bills %i of minimum against %i recognized as %i', (minimum, recognized, shortfall) => {
    expect(
      minimumCommitmentShortfallCents({ minimumCents: minimum, recognizedCents: recognized }),
    ).toBe(shortfall);
  });

  it('charges postpaid usage only above what the period includes', () => {
    expect(postpaidUsageDueCents({ meteredCents: 700_000, includedCents: 500_000 })).toBe(200_000);
    expect(postpaidUsageDueCents({ meteredCents: 300_000, includedCents: 500_000 })).toBe(0);
  });

  it('gives a shortfall its own line at the end of the term', () => {
    const lines = periodCommitmentLines({
      shape: {
        committedSeats: 100,
        committedUsageBlockCents: 0,
        includedUsageCentsPerPeriod: 0,
        minimumAnnualSpendCents: 12_000_000,
        meteredUsage: true,
      },
      seats: {
        committedSeats: 100,
        assignedSeats: 100,
        seatUnitPriceCents: 100_000,
        daysRemainingInTerm: 365,
        daysInTerm: 365,
      },
      meteredUsageCents: 0,
      prepaidBalanceCents: 0,
      recognizedTermSpendCents: 10_000_000,
      isFinalPeriodOfTerm: true,
    });
    expect(lines.map((line) => line.kind)).toEqual(['seat_commitment', 'commitment_shortfall']);
    expect(lines[1]?.amountCents).toBe(2_000_000);
    expect(commitmentLinesTotalCents(lines)).toBe(12_000_000);
  });

  it('bills a hybrid period as seats, true-up, drawdown and overage separately', () => {
    const lines = periodCommitmentLines({
      shape: {
        committedSeats: 50,
        committedUsageBlockCents: 100_000,
        includedUsageCentsPerPeriod: 20_000,
        minimumAnnualSpendCents: 0,
        meteredUsage: true,
      },
      seats: {
        committedSeats: 50,
        assignedSeats: 55,
        seatUnitPriceCents: 40_000,
        daysRemainingInTerm: 365,
        daysInTerm: 365,
      },
      meteredUsageCents: 180_000,
      prepaidBalanceCents: 100_000,
      recognizedTermSpendCents: 0,
      isFinalPeriodOfTerm: false,
    });
    expect(lines.map((line) => line.kind)).toEqual([
      'seat_commitment',
      'seat_true_up',
      'prepaid_drawdown',
      'usage_overage',
    ]);
    expect(commitmentLinesTotalCents(lines)).toBe(2_000_000 + 200_000 + 60_000);
  });

  it('nets a mid-term amendment against what the superseded terms already billed', () => {
    expect(
      amendmentProration({
        previousPeriodAmountCents: 1_200_000,
        amendedPeriodAmountCents: 1_800_000,
        daysRemainingInPeriod: 182,
        daysInPeriod: 365,
      }),
    ).toEqual({
      previousTermRefundCents: 598_356,
      amendedTermChargeCents: 897_534,
      netCents: 299_178,
    });
  });

  it('converts contract cents into the unit the ledger settles in', () => {
    expect(contractCentsToMicroUsd(1)).toBe(MICROUSD_PER_CENT);
    expect(() => contractCentsToMicroUsd(1.5)).toThrow(RangeError);
  });
});

describe('payment terms and invoice state', () => {
  it.each([
    [0, 'Due on receipt', '2026-03-01'],
    [15, 'NET 15', '2026-03-16'],
    [30, 'NET 30', '2026-03-31'],
    [45, 'NET 45', '2026-04-15'],
    [60, 'NET 60', '2026-04-30'],
    [90, 'NET 90', '2026-05-30'],
  ])('term %i is %s and falls due %s', (days, label, due) => {
    expect(paymentTermLabel(days)).toBe(label);
    expect(invoiceDueDate('2026-03-01', days)).toBe(due);
  });

  it('offers every standard term and refuses one past the ceiling', () => {
    for (const days of STANDARD_NET_TERM_DAYS) expect(paymentTermLabel(days)).toBeTypeOf('string');
    expect(() => paymentTermLabel(181)).toThrow(RangeError);
    expect(() => invoiceDueDate('2026-03-01', -1)).toThrow(RangeError);
  });

  it.each<[Partial<InvoicePositionFixture>, EnterpriseInvoiceState]>([
    [{ finalized: false }, 'draft'],
    [{ amountPaidCents: 0 }, 'open'],
    [{ amountPaidCents: 40_000 }, 'partially_paid'],
    [{ amountPaidCents: 100_000 }, 'paid'],
    [{ amountPaidCents: 0, dueOnIsoDate: '2026-02-01' }, 'overdue'],
    [{ amountPaidCents: 40_000, dueOnIsoDate: '2026-02-01' }, 'overdue'],
    [{ uncollectible: true }, 'uncollectible'],
    [{ voided: true }, 'void'],
    [{ voided: true, amountPaidCents: 100_000 }, 'void'],
  ])('reads %o as %s', (overrides, expected) => {
    expect(resolveInvoiceState(position(overrides), '2026-03-01')).toBe(expected);
  });

  it('reports what is outstanding in whole cents, and nothing on a void', () => {
    expect(invoiceOutstandingCents(position({ amountPaidCents: 40_000 }))).toBe(60_000);
    expect(invoiceOutstandingCents(position({ voided: true }))).toBe(0);
  });

  it('lets no finalized state have its amount rewritten', () => {
    for (const state of ENTERPRISE_INVOICE_STATES) {
      expect(isInvoiceAmountMutable(state), state).toBe(state === 'draft');
    }
    expect(allowedInvoiceCorrections('open')).toEqual([
      'void',
      'mark_uncollectible',
      'credit_note',
    ]);
    expect(allowedInvoiceCorrections('paid')).toEqual([]);
  });
});

interface InvoicePositionFixture {
  finalized: boolean;
  voided: boolean;
  uncollectible: boolean;
  amountDueCents: number;
  amountPaidCents: number;
  dueOnIsoDate: string | null;
}

function position(overrides: Partial<InvoicePositionFixture> = {}): InvoicePositionFixture {
  return {
    finalized: true,
    voided: false,
    uncollectible: false,
    amountDueCents: 100_000,
    amountPaidCents: 0,
    dueOnIsoDate: '2026-04-01',
    ...overrides,
  };
}

describe('what stops an enterprise invoice being created', () => {
  function terms(overrides: Partial<InvoiceIssuanceTerms> = {}): InvoiceIssuanceTerms {
    return {
      contractInForce: true,
      purchaseOrderRequired: true,
      purchaseOrderNumber: 'PO-4411',
      invoiceRecipientEmails: ['ap@northwind.example'],
      negotiatedRateCents: 100_000,
      billingCurrency: 'usd',
      permittedPaymentMethods: ['send_invoice', 'ach_credit_transfer', 'us_bank_account'],
      ...overrides,
    };
  }
  const request = {
    currency: 'usd',
    collectionMethod: 'send_invoice',
    paymentMethodTypes: ['ach_credit_transfer'],
  };

  it('permits an invoice only when every term it depends on is present', () => {
    expect(invoiceIssuanceRefusals(terms(), request)).toEqual([]);
  });

  it.each([
    [{ purchaseOrderNumber: null }, 'purchase_order_required'],
    [{ purchaseOrderNumber: '   ' }, 'purchase_order_required'],
    [{ invoiceRecipientEmails: [] }, 'invoice_recipient_missing'],
    [{ invoiceRecipientEmails: ['  '] }, 'invoice_recipient_missing'],
    [{ negotiatedRateCents: null }, 'negotiated_rate_missing'],
    [{ negotiatedRateCents: 0 }, 'negotiated_rate_missing'],
    [{ contractInForce: false }, 'contract_not_in_force'],
    [{ billingCurrency: 'eur' }, 'currency_not_contracted'],
  ])('refuses %o with %s', (overrides, reason) => {
    expect(invoiceIssuanceRefusals(terms(overrides), request)).toContain(reason);
  });

  it('lets a contract without a PO requirement invoice without one', () => {
    expect(
      invoiceIssuanceRefusals(
        terms({ purchaseOrderRequired: false, purchaseOrderNumber: null }),
        request,
      ),
    ).toEqual([]);
  });

  it('refuses a card on a contract that negotiated bank transfer', () => {
    expect(
      invoiceIssuanceRefusals(terms(), {
        currency: 'usd',
        collectionMethod: 'charge_automatically',
        paymentMethodTypes: ['card'],
      }),
    ).toEqual(['payment_method_not_permitted', 'payment_method_not_permitted']);
  });
});

describe('recording a bank transfer an operator received', () => {
  const permitted = ['ach_credit_transfer', 'wire'];

  it('accepts a wire for exactly what is outstanding', () => {
    expect(
      offlinePaymentRefusal({
        state: 'open',
        outstandingCents: 100_000,
        amountCents: 100_000,
        method: 'wire',
        permittedPaymentMethods: permitted,
      }),
    ).toBeNull();
  });

  it.each([
    [{ amountCents: 100_001 }, 'amount_exceeds_outstanding'],
    [{ amountCents: 0 }, 'amount_not_positive'],
    [{ amountCents: 10.5 }, 'amount_not_positive'],
    [{ state: 'draft' as const }, 'invoice_not_finalized'],
    [{ state: 'void' as const }, 'invoice_voided'],
    [{ method: 'check' as const }, 'method_not_permitted'],
  ])('refuses %o with %s', (overrides, reason) => {
    expect(
      offlinePaymentRefusal({
        state: 'open',
        outstandingCents: 100_000,
        amountCents: 50_000,
        method: 'wire',
        permittedPaymentMethods: permitted,
        ...overrides,
      }),
    ).toBe(reason);
  });
});

describe('the contract object every surface reads', () => {
  const input = {
    identity: {
      organizationId: '00000000-0000-4000-8000-0000000000aa',
      version: 3,
      state: 'executed' as const,
      changeKind: 'amendment' as const,
      orderFormReference: 'OF-2026-11',
      signedAt: '2026-01-05T10:00:00.000Z',
      supersedesVersion: 2,
    },
    window: { termStart: '2026-01-01', termEnd: '2026-12-31', expiryGraceDays: 10 },
    commercials: {
      committedSeats: 250,
      seatUnitPriceCents: 100_000,
      includedUsageCentsPerPeriod: 500_000,
      committedUsageBlockCents: 0,
      minimumAnnualSpendCents: 0,
      meteredUsage: true,
      billingCurrency: 'usd',
    },
    procurement: {
      paymentTermDays: 30,
      purchaseOrderRequired: true,
      purchaseOrderNumber: 'PO-4411',
      invoiceRecipientEmails: ['ap@northwind.example'],
      permittedPaymentMethods: ['send_invoice', 'ach_credit_transfer'],
    },
    asOfDate: '2026-06-01',
  };

  it('grants while in force and reports the model and the terms it carries', () => {
    const view = commercialContractView(input);
    expect(view).toMatchObject({
      model: 'seat_plus_usage',
      inForce: true,
      forceReason: 'in_force',
      state: 'executed',
      grantsThrough: '2027-01-10',
      paymentTermLabel: 'NET 30',
    });
    expect(contractGrantsEnterprise(view)).toBe(true);
    expect(contractInvoiceTerms(view)).toMatchObject({
      contractInForce: true,
      purchaseOrderRequired: true,
      negotiatedRateCents: 100_000,
    });
  });

  it('stops granting the day after the grace ends, with no sweep having run', () => {
    const view = commercialContractView({ ...input, asOfDate: '2027-01-11' });
    expect(view.state).toBe('expired');
    expect(contractGrantsEnterprise(view)).toBe(false);
    expect(
      invoiceIssuanceRefusals(contractInvoiceTerms(view), {
        currency: 'usd',
        collectionMethod: 'send_invoice',
        paymentMethodTypes: [],
      }),
    ).toEqual(['contract_not_in_force']);
  });

  it('grants nothing once terminated and offers no event out of it', () => {
    const view = commercialContractView({
      ...input,
      identity: { ...input.identity, state: 'terminated' },
    });
    expect(contractGrantsEnterprise(view)).toBe(false);
    expect(view.availableEvents).toEqual([]);
  });
});
